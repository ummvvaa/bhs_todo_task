import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  sendTelegram,
  answerCallbackQuery,
  answerCallback,
  editMessageText,
  removeInlineKeyboard,
} from '@/lib/telegram'
import { LlmError } from '@/lib/llm'
import { runTrackerDialog, type DialogTurn } from '@/lib/tracker/dialog'
import { trackerMessages } from '@/lib/tracker/messages'
import { parseMorningTasks, almatyTodayDate, todayDeadlineIso } from '@/lib/morning/parse'
import { morningMessages } from '@/lib/morning/messages'

export const runtime = 'nodejs'

// Webhook Telegram: принимает апдейты бота.
//  • message «/start <код>»     → привязка аккаунта (Этап 12).
//  • callback_query «checkin:…» → ответ Да/Нет вечернего трекера (Этап 13).
//  • свободный текст            → продолжение ИИ-диалога по незакрытому вечернему чек-ину,
//                                 иначе — разбор утреннего ответа в новые задачи (утренний нудж).
//
// ВАЖНО: Telegram ждёт ответ 200 как можно быстрее и при не-200 повторяет
// доставку. Поэтому что бы ни случилось, отвечаем 200 (кроме неверного секрета).

type TelegramUpdate = {
  message?: {
    chat?: { id?: number }
    text?: string
    from?: { first_name?: string }
  }
  callback_query?: {
    id: string
    data?: string
    from?: { id?: number }
    message?: { chat?: { id?: number }; message_id?: number }
  }
}

const OK = () => NextResponse.json({ ok: true })

export async function POST(request: NextRequest) {
  // Опциональная защита: если задан TELEGRAM_WEBHOOK_SECRET, Telegram присылает
  // его в заголовке (настраивается в setWebhook через secret_token).
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (expectedSecret) {
    const got = request.headers.get('x-telegram-bot-api-secret-token')
    if (got !== expectedSecret) {
      return NextResponse.json({ error: 'forbidden' }, { status: 401 })
    }
  }

  let update: TelegramUpdate
  try {
    update = (await request.json()) as TelegramUpdate
  } catch {
    return OK()
  }

  const admin = createAdminClient()

  try {
    if (update.callback_query) {
      await handleCallback(admin, update.callback_query)
      return OK()
    }
    if (update.message) {
      await handleMessage(admin, update.message)
      return OK()
    }
  } catch (e) {
    // Любая внутренняя ошибка не должна приводить к ретраям Telegram.
    console.error('[telegram webhook] unhandled:', e)
  }
  return OK()
}

// ─── callback_query: кнопки Да/Нет вечернего трекера ────────────────────────

async function handleCallback(
  admin: SupabaseClient,
  cq: NonNullable<TelegramUpdate['callback_query']>,
) {
  const chatId = cq.message?.chat?.id
  const messageId = cq.message?.message_id
  const data = cq.data ?? ''

  // Командная фича (Этап 19): ответ на приглашение в команду по задаче.
  // Формат: team_accept:<uuid> | team_decline:<uuid> (uuid = task_members.id)
  const teamMatch = data.match(/^team_(accept|decline):([0-9a-f-]{36})$/i)
  if (teamMatch) {
    await handleTeamResponse(admin, cq, teamMatch[1].toLowerCase() as 'accept' | 'decline', teamMatch[2])
    return
  }

  // Формат: checkin:<uuid>:done | checkin:<uuid>:not_done
  const m = data.match(/^checkin:([0-9a-f-]{36}):(done|not_done)$/i)
  if (!chatId || !m) {
    await answerCallbackQuery(cq.id)
    return
  }
  const chatIdStr = String(chatId)
  const checkinId = m[1]
  const answer = m[2] as 'done' | 'not_done'

  // Загружаем чек-ин и проверяем, что он принадлежит этому чату (безопасность).
  const { data: checkin } = await admin
    .from('tracker_checkins')
    .select('id, task_id, reported_status, profile_id, profiles(telegram_chat_id)')
    .eq('id', checkinId)
    .maybeSingle()

  const ownerChat = (checkin?.profiles as { telegram_chat_id?: string } | null)?.telegram_chat_id
  if (!checkin || ownerChat !== chatIdStr) {
    await answerCallbackQuery(cq.id, 'Не удалось найти этот вопрос.')
    return
  }

  // Повторное нажатие — просто подтверждаем, ничего не меняем.
  if (checkin.reported_status) {
    await answerCallbackQuery(cq.id, 'Ответ уже принят.')
    if (messageId) await removeInlineKeyboard(chatIdStr, messageId)
    return
  }

  if (messageId) await removeInlineKeyboard(chatIdStr, messageId)

  if (answer === 'done') {
    // Задача уходит начальнику на проверку (только если ещё открыта).
    await admin
      .from('tasks')
      .update({ status: 'in_review' })
      .eq('id', checkin.task_id)
      .eq('status', 'open')
    await admin
      .from('tracker_checkins')
      .update({ reported_status: 'done', dialog: { state: 'closed', turns: [] } })
      .eq('id', checkin.id)

    await answerCallbackQuery(cq.id, 'Принято!')
    await sendTelegram(chatIdStr, trackerMessages.doneReply)
    return
  }

  // answer === 'not_done' → запускаем ИИ-диалог.
  const firstQuestion = trackerMessages.notDoneFirstQuestion
  await admin
    .from('tracker_checkins')
    .update({
      reported_status: 'not_done',
      dialog: { state: 'awaiting', turns: [{ role: 'assistant', content: firstQuestion }] },
    })
    .eq('id', checkin.id)

  await answerCallbackQuery(cq.id)
  await sendTelegram(chatIdStr, firstQuestion)
}

// ─── callback_query: приглашение в команду по задаче (Этап 19) ───────────────

async function handleTeamResponse(
  admin: SupabaseClient,
  cq: NonNullable<TelegramUpdate['callback_query']>,
  action: 'accept' | 'decline',
  memberRowId: string,
) {
  const chatId = cq.message?.chat?.id
  const messageId = cq.message?.message_id
  const fromId = cq.from?.id

  const { data: row } = await admin
    .from('task_members')
    .select('id, status, task_id, profile_id, invited_by')
    .eq('id', memberRowId)
    .maybeSingle()

  if (!row) {
    await answerCallback(cq.id, 'Приглашение не найдено.')
    return
  }

  // Безопасность: нажать кнопку может только сам приглашённый участник.
  const { data: member } = await admin
    .from('profiles')
    .select('full_name, telegram_chat_id')
    .eq('id', row.profile_id)
    .maybeSingle()

  if (!member || String(fromId) !== member.telegram_chat_id) {
    await answerCallback(cq.id, 'Это приглашение не для вас.')
    return
  }

  // Повторное нажатие — ответ уже зафиксирован, ничего не меняем.
  if (row.status !== 'pending') {
    await answerCallback(cq.id, 'Вы уже ответили на это приглашение.')
    return
  }

  const newStatus = action === 'accept' ? 'accepted' : 'declined'
  await admin
    .from('task_members')
    .update({ status: newStatus, responded_at: new Date().toISOString() })
    .eq('id', row.id)

  await answerCallback(cq.id, action === 'accept' ? 'Принято!' : 'Отклонено')
  if (chatId && messageId) {
    await editMessageText(
      String(chatId),
      messageId,
      action === 'accept' ? 'Вы приняли приглашение ✅' : 'Вы отклонили ❌',
    )
  }

  // Уведомляем владельца задачи (того, кто пригласил).
  const { data: task } = await admin
    .from('tasks')
    .select('title')
    .eq('id', row.task_id)
    .maybeSingle()
  const title = task?.title ?? 'задача'

  if (row.invited_by) {
    const { data: owner } = await admin
      .from('profiles')
      .select('telegram_chat_id')
      .eq('id', row.invited_by)
      .maybeSingle()
    if (owner?.telegram_chat_id) {
      const memberName = member.full_name?.trim() || 'Участник'
      await sendTelegram(
        owner.telegram_chat_id,
        action === 'accept'
          ? `✅ ${memberName} принял приглашение в задаче «${title}»`
          : `❌ ${memberName} отклонил приглашение в задаче «${title}»`,
      )
    }
  }
}

// ─── message: /start (привязка) или свободный текст (диалог) ─────────────────

async function handleMessage(
  admin: SupabaseClient,
  message: NonNullable<TelegramUpdate['message']>,
) {
  const chatId = message.chat?.id
  const text = message.text?.trim()
  if (!chatId || !text) return
  const chatIdStr = String(chatId)

  // «/start <код>» — привязка аккаунта (Этап 12).
  const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i)
  if (startMatch) {
    await handleStart(admin, chatIdStr, startMatch[1]?.trim())
    return
  }

  // Сначала — активный ИИ-диалог вечернего трекера (он привязан к конкретной задаче).
  if (await handleDialogReply(admin, chatIdStr, text)) return

  // Иначе — возможно, это ответ на утренний нудж: дописываем задачи на сегодня.
  if (await handleMorningReply(admin, chatIdStr, text)) return

  await sendTelegram(chatIdStr, trackerMessages.noActiveDialog)
}

/**
 * Обрабатывает свободный текст как ответ на сегодняшний утренний нудж: ИИ разбирает
 * сообщение в задачи и создаёт их этому сотруднику (assigned_to = created_by = он сам,
 * дедлайн по умолчанию — конец сегодняшнего дня).
 * Возвращает true, только если сотруднику сегодня действительно слали утренний нудж.
 */
async function handleMorningReply(
  admin: SupabaseClient,
  chatIdStr: string,
  text: string,
): Promise<boolean> {
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('telegram_chat_id', chatIdStr)
    .maybeSingle()
  if (!profile) return false

  // Гейт: разбираем в задачи только ответ на СЕГОДНЯШНИЙ нудж (запись создаёт утренний cron).
  const today = almatyTodayDate()
  const { data: nudge } = await admin
    .from('morning_nudges')
    .select('id')
    .eq('profile_id', profile.id)
    .eq('nudge_date', today)
    .maybeSingle()
  if (!nudge) return false

  let titles: string[]
  try {
    titles = await parseMorningTasks(text, today)
  } catch (e) {
    // Лимит/ошибка Groq или неразборчивый ответ — не молчим, просим повторить позже.
    if (!(e instanceof LlmError)) console.error('[morning nudge] parse error:', e)
    await sendTelegram(chatIdStr, morningMessages.parseFallback)
    return true
  }

  if (titles.length === 0) {
    await sendTelegram(chatIdStr, morningMessages.nothingParsed)
    return true
  }

  const due = todayDeadlineIso()
  const { error } = await admin.from('tasks').insert(
    titles.map((title) => ({
      title,
      assigned_to: profile.id,
      created_by: profile.id,
      due_date: due,
      status: 'open',
    })),
  )
  if (error) {
    console.error('[morning nudge] insert error:', error)
    await sendTelegram(chatIdStr, morningMessages.parseFallback)
    return true
  }

  await sendTelegram(chatIdStr, morningMessages.tasksCreated(titles))
  return true
}

async function handleStart(admin: SupabaseClient, chatIdStr: string, code: string | undefined) {
  if (!code) {
    await sendTelegram(
      chatIdStr,
      'Укажите код привязки: отправьте /start <код>. Код есть в системе задач, ' +
        'раздел «Настройки Telegram».',
    )
    return
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('telegram_link_code', code)
    .maybeSingle()

  if (!profile) {
    await sendTelegram(
      chatIdStr,
      'Код не найден. Проверьте код в системе задач (раздел «Настройки Telegram») и попробуйте снова.',
    )
    return
  }

  const { error } = await admin
    .from('profiles')
    .update({ telegram_chat_id: chatIdStr })
    .eq('id', profile.id)

  if (error) {
    await sendTelegram(chatIdStr, 'Не удалось завершить привязку. Попробуйте позже.')
    return
  }

  const name = profile.full_name?.split(' ')[0]
  await sendTelegram(
    chatIdStr,
    `Привязка успешна${name ? `, ${name}` : ''}! Теперь сюда будут приходить уведомления о новых задачах, дедлайнах и вечерние вопросы по выполнению.`,
  )
}

/**
 * Обрабатывает свободный текст как реплику в активном ИИ-диалоге трекера.
 * Возвращает true, если нашёлся незакрытый диалог и ответ обработан.
 * Привязка к задаче — по последнему чек-ину сотрудника со state='awaiting'.
 */
async function handleDialogReply(
  admin: SupabaseClient,
  chatIdStr: string,
  text: string,
): Promise<boolean> {
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('telegram_chat_id', chatIdStr)
    .maybeSingle()
  if (!profile) return false

  const { data: checkin } = await admin
    .from('tracker_checkins')
    .select('id, task_id, dialog, reason')
    .eq('profile_id', profile.id)
    .eq('dialog->>state', 'awaiting')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!checkin) return false

  // Название задачи — для контекста модели.
  const { data: task } = await admin
    .from('tasks')
    .select('title')
    .eq('id', checkin.task_id)
    .maybeSingle()
  const taskTitle = task?.title ?? 'задача'

  const prevTurns = ((checkin.dialog as { turns?: DialogTurn[] } | null)?.turns ?? []) as DialogTurn[]
  const turns: DialogTurn[] = [...prevTurns, { role: 'user', content: text }]

  try {
    const outcome = await runTrackerDialog(taskTitle, turns)
    const nextTurns: DialogTurn[] = [...turns, { role: 'assistant', content: outcome.reply }]

    await admin
      .from('tracker_checkins')
      .update({
        ...(outcome.reason ? { reason: outcome.reason } : {}),
        ...(outcome.promisedDate ? { promised_date: outcome.promisedDate } : {}),
        dialog: { state: outcome.done ? 'closed' : 'awaiting', turns: nextTurns },
      })
      .eq('id', checkin.id)

    await sendTelegram(chatIdStr, outcome.reply)
    if (outcome.done) await sendTelegram(chatIdStr, trackerMessages.dialogClosing)
    return true
  } catch (e) {
    // Лимит/ошибка Groq или неразборчивый ответ — не теряем слова сотрудника:
    // сохраняем их как причину и закрываем диалог.
    if (!(e instanceof LlmError)) console.error('[tracker dialog] error:', e)
    const combinedReason = checkin.reason ? `${checkin.reason}\n${text}` : text
    await admin
      .from('tracker_checkins')
      .update({
        reason: combinedReason,
        dialog: { state: 'closed', turns: [...turns, { role: 'assistant', content: '(ИИ недоступен)' }] },
      })
      .eq('id', checkin.id)
    await sendTelegram(chatIdStr, trackerMessages.dialogFallback)
    return true
  }
}

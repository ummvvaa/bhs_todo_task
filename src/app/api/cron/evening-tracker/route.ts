import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegram, type InlineKeyboard } from '@/lib/telegram'
import { formatDateTime } from '@/lib/datetime'
import { getPeriodStart } from '@/lib/period'
import { trackerMessages } from '@/lib/tracker/messages'

export const runtime = 'nodejs'

// Этап 13 — вечерний трекер.
// Дёргается вечерним cron (pg_cron через pg_net), см. 010_tracker_checkins.sql.
// Защищён общим секретом CRON_SECRET.
//
// Логика: задачи open/in_review с дедлайном СЕГОДНЯ (по Алматы), у исполнителя
// которых привязан Telegram → создаём чек-ин (idempotent) и шлём вопрос с
// кнопками Да/Нет. Повторный прогон за тот же день не дублирует сообщения
// (уникальный индекс task_id+check_date, ответы только по новым чек-инам).

type DueTask = {
  id: string
  title: string
  due_date: string
  assigned_to: string | null
}

/** Сегодняшняя дата в Алматы как YYYY-MM-DD (для колонки check_date). */
function almatyTodayDate(): string {
  const a = new Date(Date.now() + 5 * 60 * 60 * 1000) // UTC+5
  return a.toISOString().slice(0, 10)
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET не настроен' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Диапазон «сегодня» по Алматы в UTC.
  const dayStart = getPeriodStart('day')
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

  const { data: tasks, error } = await admin
    .from('tasks')
    .select('id, title, due_date, assigned_to')
    .in('status', ['open', 'in_review'])
    .not('due_date', 'is', null)
    .gte('due_date', dayStart.toISOString())
    .lt('due_date', dayEnd.toISOString())

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const list = (tasks ?? []) as DueTask[]
  if (list.length === 0) {
    return NextResponse.json({ sent: 0, due: 0 })
  }

  // Только исполнители с привязанным Telegram.
  const assigneeIds = [...new Set(list.map((t) => t.assigned_to).filter(Boolean) as string[])]
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, telegram_chat_id')
    .in('id', assigneeIds)
    .not('telegram_chat_id', 'is', null)

  const chatById = new Map<string, string>()
  for (const p of profiles ?? []) {
    if (p.telegram_chat_id) chatById.set(p.id, p.telegram_chat_id as string)
  }

  const reachable = list.filter((t) => t.assigned_to && chatById.has(t.assigned_to))
  if (reachable.length === 0) {
    return NextResponse.json({ sent: 0, due: list.length })
  }

  const checkDate = almatyTodayDate()

  // Idempotent-вставка: уже существующие (task_id, check_date) пропускаются,
  // .select() вернёт только НОВЫЕ строки — по ним и шлём вопросы.
  const { data: created, error: insErr } = await admin
    .from('tracker_checkins')
    .upsert(
      reachable.map((t) => ({
        task_id: t.id,
        profile_id: t.assigned_to as string,
        check_date: checkDate,
      })),
      { onConflict: 'task_id,check_date', ignoreDuplicates: true },
    )
    .select('id, task_id')

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  const taskById = new Map(reachable.map((t) => [t.id, t]))

  const results = await Promise.allSettled(
    (created ?? []).map((c) => {
      const task = taskById.get(c.task_id)
      if (!task || !task.assigned_to) return Promise.resolve(false)
      const chatId = chatById.get(task.assigned_to)
      if (!chatId) return Promise.resolve(false)

      // callback_data: «checkin:<id>:done» / «checkin:<id>:not_done» (умещается в 64 байта).
      const keyboard: InlineKeyboard = [
        [
          { text: trackerMessages.buttonYes, callback_data: `checkin:${c.id}:done` },
          { text: trackerMessages.buttonNo, callback_data: `checkin:${c.id}:not_done` },
        ],
      ]
      return sendTelegram(
        chatId,
        trackerMessages.eveningQuestion(task.title, formatDateTime(task.due_date)),
        keyboard,
      )
    }),
  )

  const sent = results.filter((r) => r.status === 'fulfilled' && r.value === true).length
  return NextResponse.json({ sent, due: list.length, new_checkins: created?.length ?? 0 })
}

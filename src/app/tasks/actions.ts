'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegramButtons } from '@/lib/telegram'
import { almatyLocalToUtcISO } from '@/lib/datetime'

type ActionResult = { error?: string; success?: boolean } | null

export async function markDone(taskId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return { error: 'Нет прав' }

  const { error } = await supabase
    .from('tasks')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('assigned_to', user.id)
    .eq('status', 'open')

  if (error) return { error: error.message }
  revalidatePath('/tasks')
  return { success: true }
}

export async function reopenTask(taskId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return { error: 'Нет прав' }

  const { error } = await supabase
    .from('tasks')
    .update({ status: 'open', completed_at: null })
    .eq('id', taskId)
    .eq('assigned_to', user.id)
    .eq('status', 'done')

  if (error) return { error: error.message }
  revalidatePath('/tasks')
  return { success: true }
}

export async function createTask(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const title = (formData.get('title') as string)?.trim()
  const description = (formData.get('description') as string)?.trim() || null
  const dueDateStr = (formData.get('due_date') as string) || null
  const isRecurring = formData.get('is_recurring') === 'on'
  const recurrence = (formData.get('recurrence') as string) || null

  if (!title) return { error: 'Название обязательно' }

  // datetime-local трактуем как время Алматы (UTC+5) при сохранении в timestamptz.
  const dueDate = almatyLocalToUtcISO(dueDateStr)

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      title,
      description,
      assigned_to: user.id,
      created_by: user.id,
      due_date: dueDate,
      is_recurring: isRecurring,
      recurrence: isRecurring ? recurrence : null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  // Командная фича (Этап 19): приглашаем выбранных участников в Telegram.
  // memberIds приходят из формы как массив 'member'. Сам создатель исключается.
  const memberIds = [...new Set((formData.getAll('member') as string[]).map(String))].filter(
    (id) => id && id !== user.id,
  )
  if (task && memberIds.length > 0) {
    // Best-effort: сбой приглашений не должен ломать создание задачи.
    try {
      await inviteTaskMembers(task.id, title, user.id, memberIds)
    } catch (e) {
      console.error('[createTask] не удалось разослать приглашения в команду:', e)
    }
  }

  revalidatePath('/tasks')
  return { success: true }
}

/**
 * Приглашает участников в команду по задаче: создаёт строки task_members (status='pending')
 * и шлёт каждому в Telegram кнопки Принять / Отклонить. adminClient — чтобы прочитать
 * telegram_chat_id чужих профилей (обычному пользователю RLS их не отдаёт) и надёжно
 * вставить task_members. Нет telegram_chat_id → отправка пропускается (приглашение в БД остаётся).
 */
async function inviteTaskMembers(
  taskId: string,
  title: string,
  ownerId: string,
  memberIds: string[],
): Promise<void> {
  const admin = createAdminClient()

  const { data: owner } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', ownerId)
    .maybeSingle()
  const ownerName = owner?.full_name?.trim() || 'Коллега'

  for (const memberId of memberIds) {
    const { data: row, error: insErr } = await admin
      .from('task_members')
      .insert({
        task_id: taskId,
        profile_id: memberId,
        status: 'pending',
        invited_by: ownerId,
      })
      .select('id')
      .single()

    // Дубликат (UNIQUE task_id+profile_id) или иная ошибка — пропускаем участника.
    if (insErr || !row) {
      if (insErr) console.error('[createTask] task_members insert:', insErr.message)
      continue
    }

    const { data: member } = await admin
      .from('profiles')
      .select('telegram_chat_id')
      .eq('id', memberId)
      .maybeSingle()
    const chatId = member?.telegram_chat_id
    if (!chatId) continue

    await sendTelegramButtons(
      chatId,
      `👥 ${ownerName} приглашает вас в команду по задаче: «${title}». Принимаете?`,
      [
        [
          { text: '✅ Принять', callback_data: `team_accept:${row.id}` },
          { text: '❌ Отклонить', callback_data: `team_decline:${row.id}` },
        ],
      ],
    )
  }
}

export async function markInReview(taskId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const { error } = await supabase
    .from('tasks')
    .update({ status: 'in_review' })
    .eq('id', taskId)
    .eq('status', 'open')

  if (error) return { error: error.message }

  revalidatePath('/tasks')
  return { success: true }
}

type FileRecord = {
  file_path: string
  file_name: string
  mime_type: string | null
  size: number | null
}

export async function recordTaskFiles(
  taskId: string,
  files: FileRecord[],
): Promise<ActionResult> {
  if (files.length === 0) return { success: true }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const records = files.map((f) => ({
    task_id: taskId,
    uploaded_by: user.id,
    file_path: f.file_path,
    file_name: f.file_name,
    mime_type: f.mime_type,
    size: f.size,
  }))

  const { error } = await supabase.from('task_files').insert(records)
  if (error) return { error: error.message }

  return { success: true }
}

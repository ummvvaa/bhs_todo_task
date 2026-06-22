'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegram } from '@/lib/telegram'
import { formatDateTime, almatyLocalToUtcISO } from '@/lib/datetime'

type ActionResult = { error?: string; success?: boolean; count?: number } | null

export async function assignTask(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
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
  if (profile?.role !== 'admin') return { error: 'Доступ запрещён' }

  const title = (formData.get('title') as string)?.trim()
  const description = (formData.get('description') as string)?.trim() || null
  const dueDateStr = (formData.get('due_date') as string) || null
  const isRecurring = formData.get('is_recurring') === 'on'
  const recurrence = (formData.get('recurrence') as string) || null
  const assignees = formData.getAll('assignee') as string[]

  if (!title) return { error: 'Название обязательно' }
  if (assignees.length === 0) return { error: 'Выберите хотя бы одного сотрудника' }

  // datetime-local трактуем как время Алматы (UTC+5) при сохранении в timestamptz.
  const dueDate = almatyLocalToUtcISO(dueDateStr)

  const tasks = assignees.map((assignedTo) => ({
    title,
    description,
    assigned_to: assignedTo,
    created_by: user.id,
    due_date: dueDate,
    is_recurring: isRecurring,
    recurrence: isRecurring ? recurrence : null,
  }))

  const { error } = await supabase.from('tasks').insert(tasks)
  if (error) return { error: error.message }

  // Telegram-уведомления привязанным сотрудникам (best-effort, не ломает назначение).
  await notifyAssignees(assignees, title, dueDate)

  revalidatePath('/tasks')
  revalidatePath('/admin')
  return { success: true, count: assignees.length }
}

async function notifyAssignees(
  assignees: string[],
  title: string,
  dueDate: string | null,
) {
  try {
    const admin = createAdminClient()
    const { data: recipients } = await admin
      .from('profiles')
      .select('telegram_chat_id')
      .in('id', assignees)
      .not('telegram_chat_id', 'is', null)

    if (!recipients?.length) return

    const deadline = dueDate ? formatDateTime(dueDate) : 'без дедлайна'
    const text = `Вам назначена задача: ${title}, дедлайн ${deadline}`

    await Promise.allSettled(
      recipients.map((r) => sendTelegram(r.telegram_chat_id as string, text)),
    )
  } catch (e) {
    console.error('[telegram] notifyAssignees failed:', e)
  }
}

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type ActionResult = { error?: string; success?: boolean } | null

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

  const { error } = await supabase.from('tasks').insert({
    title,
    description,
    assigned_to: user.id,
    created_by: user.id,
    due_date: dueDateStr || null,
    is_recurring: isRecurring,
    recurrence: isRecurring ? recurrence : null,
  })

  if (error) return { error: error.message }

  revalidatePath('/tasks')
  return { success: true }
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

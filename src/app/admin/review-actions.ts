'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type ActionResult = { error?: string; success?: boolean } | null

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return null
  return user
}

export async function acceptTask(taskId: string): Promise<ActionResult> {
  const user = await requireAdmin()
  if (!user) return { error: 'Нет доступа' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('tasks')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('status', 'in_review')

  if (error) return { error: error.message }

  revalidatePath('/admin')
  revalidatePath('/tasks')
  return { success: true }
}

export async function returnTask(taskId: string, comment: string): Promise<ActionResult> {
  const user = await requireAdmin()
  if (!user) return { error: 'Нет доступа' }

  const body = comment.trim()
  if (!body) return { error: 'Комментарий обязателен' }

  const admin = createAdminClient()

  const { error: taskError } = await admin
    .from('tasks')
    .update({ status: 'open' })
    .eq('id', taskId)
    .eq('status', 'in_review')

  if (taskError) return { error: taskError.message }

  const { error: commentError } = await admin
    .from('task_comments')
    .insert({ task_id: taskId, author_id: user.id, body })

  if (commentError) return { error: commentError.message }

  revalidatePath('/admin')
  revalidatePath('/tasks')
  return { success: true }
}

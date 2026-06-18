import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type Task = {
  id: string
  title: string
  description: string | null
  assigned_to: string | null
  created_by: string | null
  due_date: string | null
  is_recurring: boolean
  recurrence: string | null
  status: string
}

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const admin = createAdminClient()

  const { data: doneTasks, error: fetchError } = await admin
    .from('tasks')
    .select('id, title, description, assigned_to, created_by, due_date, is_recurring, recurrence, status')
    .eq('is_recurring', true)
    .eq('status', 'done')

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!doneTasks || doneTasks.length === 0) {
    return NextResponse.json({ created: 0, message: 'Нет завершённых повторяющихся задач' })
  }

  const now = new Date()
  const newTasks: object[] = []

  for (const task of doneTasks as Task[]) {
    // Skip if already has an active instance with same title+assignee
    const { data: existing } = await admin
      .from('tasks')
      .select('id')
      .eq('is_recurring', true)
      .eq('title', task.title)
      .eq('assigned_to', task.assigned_to)
      .in('status', ['open', 'in_review'])
      .limit(1)

    if (existing && existing.length > 0) continue

    const intervalMs = task.recurrence === 'daily' ? 86_400_000 : 7 * 86_400_000
    const baseMs = task.due_date ? new Date(task.due_date).getTime() : now.getTime()
    const nextMs = baseMs < now.getTime() ? now.getTime() + intervalMs : baseMs + intervalMs

    newTasks.push({
      title: task.title,
      description: task.description,
      assigned_to: task.assigned_to,
      created_by: task.created_by,
      due_date: new Date(nextMs).toISOString(),
      is_recurring: true,
      recurrence: task.recurrence,
      status: 'open',
    })
  }

  if (newTasks.length === 0) {
    return NextResponse.json({ created: 0, message: 'Все повторяющиеся задачи уже активны' })
  }

  const { error: insertError } = await admin.from('tasks').insert(newTasks)
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ created: newTasks.length })
}

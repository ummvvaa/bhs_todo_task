import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TaskList from './task-list'
import CreateTaskForm from './create-task-form'

export default async function TasksPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: tasks } = await supabase
    .from('tasks')
    .select(
      'id, title, description, due_date, status, is_recurring, recurrence, created_at, completed_at, task_comments(id, body, created_at), task_files(id, file_name, size, created_at)',
    )
    .or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)
    .order('created_at', { ascending: false })

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const all = tasks ?? []
  const now = new Date()

  const openCount = all.filter((t) => t.status === 'open').length
  const reviewCount = all.filter((t) => t.status === 'in_review').length
  const doneCount = all.filter((t) => t.status === 'done').length
  const overdueCount = all.filter(
    (t) =>
      (t.status === 'open' || t.status === 'in_review') &&
      !!t.due_date &&
      new Date(t.due_date) < now,
  ).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          {profile?.full_name ? `Задачи — ${profile.full_name.split(' ')[0]}` : 'Мои задачи'}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {all.length} задач · {doneCount} выполнено
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Открытых" value={openCount} color="blue" />
        <MetricCard label="На проверке" value={reviewCount} color="amber" />
        <MetricCard label="Выполнено" value={doneCount} color="green" />
        <MetricCard label="Просрочено" value={overdueCount} color="red" />
      </div>

      {/* Create task form */}
      <CreateTaskForm />

      {/* Task list */}
      <TaskList tasks={all} />
    </div>
  )
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: 'blue' | 'amber' | 'green' | 'red'
}) {
  const styles = {
    blue: 'bg-blue-50 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/50 text-blue-700 dark:text-blue-300',
    amber:
      'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50 text-amber-700 dark:text-amber-300',
    green:
      'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300',
    red: 'bg-red-50 dark:bg-red-950/40 border-red-100 dark:border-red-900/50 text-red-700 dark:text-red-300',
  }[color]

  return (
    <div className={`rounded-2xl border p-4 ${styles}`}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
    </div>
  )
}

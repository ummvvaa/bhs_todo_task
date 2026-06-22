import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import TaskList from './task-list'
import CreateTaskForm from './create-task-form'
import { formatDateTime } from '@/lib/datetime'

export default async function TasksPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Fetch profile first — role determines task query filter
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  // For admin: only tasks assigned to them (delegated tasks shown on dashboard/review queue).
  // For staff: tasks assigned to or created by them.
  const tasksQuery = supabase
    .from('tasks')
    .select(
      'id, title, description, assigned_to, due_date, status, is_recurring, recurrence, created_at, completed_at, task_comments(id, body, created_at), task_files(id, file_name, size, created_at), task_members(profile_id, status)',
    )
    .order('created_at', { ascending: false })

  const [{ data: tasks }, { data: allProfiles }, { data: memberRows }] = await Promise.all([
    isAdmin
      ? tasksQuery.eq('assigned_to', user.id)
      : tasksQuery.or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`),

    // All profiles (for name lookup and CreateTaskForm peers)
    admin
      .from('profiles')
      .select('id, full_name, email, is_active')
      .order('full_name', { ascending: true }),

    // Task IDs where current user is an accepted team member
    supabase
      .from('task_members')
      .select('task_id')
      .eq('profile_id', user.id)
      .eq('status', 'accepted'),
  ])

  // Build profile name map (covers all users including inactive)
  const profileMap = new Map<string, string>(
    (allProfiles ?? []).map((p) => [p.id, p.full_name ?? p.email ?? '']),
  )

  // Active peers (excluding self) for CreateTaskForm member invitation
  const peers = (allProfiles ?? []).filter((p) => p.is_active && p.id !== user.id)

  // Enrich own tasks: add full_name to each task_member
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = (tasks ?? []).map((t: any) => ({
    ...t,
    task_members: ((t.task_members ?? []) as { profile_id: string; status: string }[]).map(
      (m) => ({
        profile_id: m.profile_id,
        status: m.status,
        full_name: profileMap.get(m.profile_id) ?? null,
      }),
    ),
  }))

  // Team tasks: tasks where user is an accepted member (read-only)
  const teamTaskIds = (memberRows ?? []).map((r) => r.task_id)
  type TeamTask = {
    id: string
    title: string
    description: string | null
    assigned_to: string | null
    due_date: string | null
    status: string
    created_at: string
    owner_name: string | null
  }
  let teamTasks: TeamTask[] = []
  if (teamTaskIds.length > 0) {
    const { data: rawTeam } = await supabase
      .from('tasks')
      .select('id, title, description, assigned_to, due_date, status, created_at')
      .in('id', teamTaskIds)
      .order('created_at', { ascending: false })
    teamTasks = (rawTeam ?? []).map((t) => ({
      ...t,
      owner_name: t.assigned_to ? (profileMap.get(t.assigned_to) ?? null) : null,
    }))
  }

  // Stats: own tasks + accepted team tasks, каждая задача учитывается один раз
  // (если задача одновременно своя и командная — не дублируем по id).
  const now = new Date()
  const ownIds = new Set<string>(all.map((t) => t.id))
  const teamForStats = teamTasks.filter((t) => !ownIds.has(t.id))
  const statsTasks: { status: string; due_date: string | null }[] = [
    ...all.map((t) => ({ status: t.status as string, due_date: t.due_date as string | null })),
    ...teamForStats.map((t) => ({ status: t.status, due_date: t.due_date })),
  ]
  const openCount = statsTasks.filter((t) => t.status === 'open').length
  const reviewCount = statsTasks.filter((t) => t.status === 'in_review').length
  const doneCount = statsTasks.filter((t) => t.status === 'done').length
  const overdueCount = statsTasks.filter(
    (t) =>
      (t.status === 'open' || t.status === 'in_review') &&
      !!t.due_date &&
      new Date(t.due_date) < now,
  ).length

  // Status display config for team task cards
  const statusConfig: Record<string, { label: string; cls: string }> = {
    open: {
      label: 'Открыта',
      cls: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-100 dark:border-blue-900',
    },
    in_review: {
      label: 'На проверке',
      cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-100 dark:border-amber-900',
    },
    done: {
      label: 'Выполнена',
      cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900',
    },
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          {profile?.full_name ? `Задачи — ${profile.full_name.split(' ')[0]}` : 'Мои задачи'}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {statsTasks.length} задач · {doneCount} выполнено
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
      <CreateTaskForm peers={peers} />

      {/* Own task list */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <TaskList tasks={all as any} isAdmin={isAdmin} userId={user.id} />

      {/* Team tasks — read-only section */}
      {teamTasks.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Командные задачи
            </h2>
            <span className="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-xs font-semibold px-2 py-0.5 rounded-full">
              {teamTasks.length}
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 -mt-2">
            Задачи, в которые вас пригласили как участника
          </p>
          <ul className="space-y-3">
            {teamTasks.map((task) => {
              const overdue =
                task.status !== 'done' && !!task.due_date && new Date(task.due_date) < now
              const sc = statusConfig[task.status] ?? statusConfig['open']
              return (
                <li
                  key={task.id}
                  className={`bg-white dark:bg-slate-900 rounded-2xl shadow-sm border p-4 space-y-2.5 ${
                    overdue
                      ? 'border-red-200 dark:border-red-900'
                      : 'border-slate-100 dark:border-slate-800'
                  }`}
                >
                  {/* Title + badges */}
                  <div className="flex items-start gap-3">
                    <h3 className="flex-1 font-semibold text-slate-900 dark:text-white leading-snug min-w-0">
                      {task.title}
                    </h3>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border border-violet-100 dark:border-violet-900">
                        участник
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sc.cls}`}>
                        {sc.label}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  {task.description && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                      {task.description}
                    </p>
                  )}

                  {/* Meta row */}
                  <div className="flex flex-wrap gap-3 pt-0.5">
                    {task.owner_name && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        Владелец: {task.owner_name}
                      </span>
                    )}
                    {task.due_date && (
                      <span
                        className={`text-xs font-medium ${
                          overdue
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        До {formatDateTime(task.due_date)}
                        {overdue && ' · просрочено'}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
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

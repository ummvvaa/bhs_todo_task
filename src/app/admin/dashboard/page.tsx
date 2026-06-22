import { createAdminClient } from '@/lib/supabase/admin'
import { computeAttentionSignals, type AttentionTask } from '@/lib/attention'
import { getTaskFilesWithUrls } from '@/lib/task-files-server'
import ReviewQueue from '../review-queue'
import PeriodFilter from './period-filter'
import DeptTable from './dept-table'
import AttentionPanel from './attention-panel'

type Period = 'day' | 'week' | 'month'

function getPeriodStart(period: Period): Date {
  const OFFSET_MS = 5 * 60 * 60 * 1000
  const almatyNow = new Date(Date.now() + OFFSET_MS)
  const y = almatyNow.getUTCFullYear()
  const m = almatyNow.getUTCMonth()
  const d = almatyNow.getUTCDate()
  const wd = almatyNow.getUTCDay()

  let startAlmaty: Date
  if (period === 'day') {
    startAlmaty = new Date(Date.UTC(y, m, d))
  } else if (period === 'week') {
    const fromMon = wd === 0 ? 6 : wd - 1
    startAlmaty = new Date(Date.UTC(y, m, d - fromMon))
  } else {
    startAlmaty = new Date(Date.UTC(y, m, 1))
  }
  return new Date(startAlmaty.getTime() - OFFSET_MS)
}

type EmpStats = { open: number; in_review: number; done: number; overdue: number }

const PERIOD_LABEL: Record<Period, string> = {
  day: 'сегодня',
  week: 'за неделю',
  month: 'за месяц',
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const params = await searchParams
  const period: Period =
    params.period === 'day' || params.period === 'week' || params.period === 'month'
      ? params.period
      : 'month'

  const admin = createAdminClient()
  const periodStart = getPeriodStart(period)

  const [
    { data: profiles },
    { data: tasks },
    { data: reviewTasks },
    { data: activeTasks },
    { data: attentionTasks },
    { data: acceptedMembers },
  ] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('is_active', true)
      .order('full_name'),
    admin
      .from('tasks')
      .select('id, status, due_date, assigned_to')
      .gte('created_at', periodStart.toISOString()),
    admin
      .from('tasks')
      .select('id, title, description, due_date, assigned_to, created_at')
      .eq('status', 'in_review')
      .order('created_at', { ascending: true }),
    admin
      .from('tasks')
      .select('id, title, status, assigned_to')
      .in('status', ['open', 'in_review']),
    // Для блока «Требует внимания»: все незавершённые задачи с дедлайном (вне периода).
    admin
      .from('tasks')
      .select('title, status, due_date, assigned_to')
      .in('status', ['open', 'in_review']),
    // Принятые участники команд — задача засчитывается и им (в per-employee счётчиках).
    admin
      .from('task_members')
      .select('task_id, profile_id')
      .eq('status', 'accepted'),
  ])

  // task_id → список profile_id принятых участников команды.
  const membersByTask: Record<string, string[]> = {}
  for (const m of acceptedMembers ?? []) {
    ;(membersByTask[m.task_id] ??= []).push(m.profile_id)
  }

  const reviewTaskIds = reviewTasks?.map((t) => t.id) ?? []
  const filesByTask = await getTaskFilesWithUrls(reviewTaskIds)

  const reviewTasksWithFiles = (reviewTasks ?? []).map((t) => ({
    ...t,
    task_files: filesByTask[t.id] ?? [],
  }))

  const now = new Date()

  // Per-employee счётчики: задача засчитывается владельцу (assigned_to) И каждому
  // принятому участнику команды. Командная задача → +1 каждому ответственному.
  const empStats: Record<string, EmpStats> = {}
  for (const t of tasks ?? []) {
    const responsible = new Set<string>()
    if (t.assigned_to) responsible.add(t.assigned_to)
    for (const pid of membersByTask[t.id] ?? []) responsible.add(pid)
    if (responsible.size === 0) continue

    const isOverdue =
      (t.status === 'open' || t.status === 'in_review') &&
      !!t.due_date &&
      new Date(t.due_date) < now

    for (const pid of responsible) {
      const s = (empStats[pid] ??= { open: 0, in_review: 0, done: 0, overdue: 0 })
      if (t.status === 'done') s.done++
      else if (t.status === 'in_review') s.in_review++
      else s.open++
      if (isOverdue) s.overdue++
    }
  }

  const all = tasks ?? []
  const total = all.length
  const doneCount = all.filter((t) => t.status === 'done').length
  const overdueCount = all.filter(
    (t) =>
      (t.status === 'open' || t.status === 'in_review') &&
      t.due_date &&
      new Date(t.due_date) < now,
  ).length
  const inReviewCount = all.filter((t) => t.status === 'in_review').length
  const pctDone = total > 0 ? Math.round((doneCount / total) * 100) : 0

  const allProfiles = profiles ?? []

  const attentionSignals = computeAttentionSignals(
    allProfiles.map((p) => ({ id: p.id, full_name: p.full_name })),
    (attentionTasks ?? []) as AttentionTask[],
    now,
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Дашборд
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Задачи {PERIOD_LABEL[period]} · {total} всего
          </p>
        </div>
        <PeriodFilter current={period} />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Всего задач" value={total} color="blue" />
        <StatCard label="% выполнения" value={`${pctDone}%`} color="green" />
        <StatCard label="Просрочено" value={overdueCount} color="red" />
        <StatCard label="На проверке" value={inReviewCount} color="amber" />
      </div>

      {/* Attention block */}
      <AttentionPanel signals={attentionSignals} />

      {/* Department table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Сотрудники
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Счётчики задач {PERIOD_LABEL[period]} · нажмите на сотрудника для просмотра задач
          </p>
        </div>
        <DeptTable
          profiles={allProfiles}
          empStats={empStats}
          activeTasks={activeTasks ?? []}
          membersByTask={membersByTask}
        />
      </div>

      {/* Review queue */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Очередь проверки
          </h2>
          {(reviewTasks?.length ?? 0) > 0 && (
            <span className="text-xs font-bold bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-2.5 py-1 rounded-full">
              {reviewTasks!.length}
            </span>
          )}
        </div>
        <ReviewQueue tasks={reviewTasksWithFiles} profiles={allProfiles} />
      </div>
    </div>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: string | number
  color: 'blue' | 'green' | 'red' | 'amber'
}) {
  const styles = {
    blue: 'bg-blue-50 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/50 text-blue-700 dark:text-blue-300',
    green:
      'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300',
    red: 'bg-red-50 dark:bg-red-950/40 border-red-100 dark:border-red-900/50 text-red-700 dark:text-red-300',
    amber:
      'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50 text-amber-700 dark:text-amber-300',
  }[color]

  return (
    <div className={`rounded-2xl border p-4 ${styles}`}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 leading-tight">
        {label}
      </p>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
    </div>
  )
}

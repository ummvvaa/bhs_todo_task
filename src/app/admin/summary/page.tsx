import { createAdminClient } from '@/lib/supabase/admin'
import { formatDateTime } from '@/lib/datetime'
import DateNav from './date-nav'
import AiSummary from './ai-summary'

// Этап 13 — экран «ИИ-сводка»: итоги вечернего трекера за день
// (кто выполнил/не выполнил, причины, обещанные сроки).

type CheckinRow = {
  id: string
  reported_status: 'done' | 'not_done' | null
  reason: string | null
  promised_date: string | null
  profiles: { full_name: string | null } | null
  tasks: { title: string | null } | null
}

function almatyTodayDate(): string {
  return new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const params = await searchParams
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '')
    ? (params.date as string)
    : almatyTodayDate()

  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('tracker_checkins')
    .select('id, reported_status, reason, promised_date, profiles(full_name), tasks(title)')
    .eq('check_date', date)

  const checkins = (rows ?? []) as unknown as CheckinRow[]

  const total = checkins.length
  const done = checkins.filter((c) => c.reported_status === 'done').length
  const notDone = checkins.filter((c) => c.reported_status === 'not_done').length
  const noAnswer = checkins.filter((c) => !c.reported_status).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            ИИ-сводка
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Итоги вечернего трекера · {total} {total === 1 ? 'вопрос' : 'вопросов'}
          </p>
        </div>
        <DateNav date={date} />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Всего" value={total} color="blue" />
        <StatCard label="Выполнили" value={done} color="green" />
        <StatCard label="Не выполнили" value={notDone} color="red" />
        <StatCard label="Без ответа" value={noAnswer} color="amber" />
      </div>

      {/* AI summary */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">✨</span>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">ИИ-сводка дня</h2>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Короткий обзор: кто не выполнил, причины и обещанные сроки, сравнение отделов.
        </p>
        <AiSummary date={date} />
      </div>

      {/* Checkin breakdown */}
      {total === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          За этот день вечерний трекер ничего не зафиксировал.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {checkins.map((c) => (
              <li key={c.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {c.profiles?.full_name ?? 'Без имени'}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
                      {c.tasks?.title ?? 'задача'}
                    </div>
                  </div>
                  <StatusBadge status={c.reported_status} />
                </div>
                {c.reported_status === 'not_done' && (
                  <div className="mt-2 text-sm space-y-1">
                    <p className="text-slate-700 dark:text-slate-300">
                      <span className="text-slate-400">Причина: </span>
                      {c.reason ?? 'не указана'}
                    </p>
                    {c.promised_date && (
                      <p className="text-slate-700 dark:text-slate-300">
                        <span className="text-slate-400">Обещанный срок: </span>
                        {formatDateTime(c.promised_date)}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: 'done' | 'not_done' | null }) {
  if (status === 'done')
    return (
      <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50">
        Выполнено
      </span>
    )
  if (status === 'not_done')
    return (
      <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50">
        Не выполнено
      </span>
    )
  return (
    <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
      Без ответа
    </span>
  )
}

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

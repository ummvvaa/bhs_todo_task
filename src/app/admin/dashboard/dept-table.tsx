'use client'

import { Fragment, useState } from 'react'

type Profile = {
  id: string
  full_name: string | null
  email: string
}

type EmpStats = {
  open: number
  in_review: number
  done: number
  overdue: number
}

type ActiveTask = {
  id: string
  title: string
  status: 'open' | 'in_review'
  assigned_to: string | null
}

const STATUS_BADGE: Record<'open' | 'in_review', string> = {
  open: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  in_review: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
}
const STATUS_LABEL: Record<'open' | 'in_review', string> = {
  open: 'Открыта',
  in_review: 'На проверке',
}

export default function DeptTable({
  profiles,
  empStats,
  activeTasks,
  membersByTask,
}: {
  profiles: Profile[]
  empStats: Record<string, EmpStats>
  activeTasks: ActiveTask[]
  membersByTask: Record<string, string[]>
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Список задач сотрудника = его собственные (assigned_to) + командные,
  // где он принятый участник.
  const tasksByEmployee = activeTasks.reduce<Record<string, ActiveTask[]>>((acc, t) => {
    const responsible = new Set<string>()
    if (t.assigned_to) responsible.add(t.assigned_to)
    for (const pid of membersByTask[t.id] ?? []) responsible.add(pid)
    for (const pid of responsible) {
      ;(acc[pid] ??= []).push(t)
    }
    return acc
  }, {})

  function toggleRow(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  if (profiles.length === 0) {
    return (
      <p className="text-sm text-slate-500 text-center py-10 px-4">
        Нет активных сотрудников
      </p>
    )
  }

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <th className="text-left px-5 py-3 font-medium text-slate-500 dark:text-slate-400">
                Сотрудник
              </th>
              <th className="text-center px-3 py-3 font-semibold text-blue-600 dark:text-blue-400 w-24">
                Открыто
              </th>
              <th className="text-center px-3 py-3 font-semibold text-amber-600 dark:text-amber-400 w-24">
                Проверка
              </th>
              <th className="text-center px-3 py-3 font-semibold text-emerald-600 dark:text-emerald-400 w-24">
                Выполнено
              </th>
              <th className="text-center px-3 py-3 font-semibold text-red-500 dark:text-red-400 w-24">
                Просрочено
              </th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const s = empStats[p.id] ?? { open: 0, in_review: 0, done: 0, overdue: 0 }
              const tasks = tasksByEmployee[p.id] ?? []
              const isExpanded = expandedId === p.id
              return (
                <Fragment key={p.id}>
                  <tr
                    onClick={() => toggleRow(p.id)}
                    className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 text-xs font-bold shrink-0 select-none">
                          {(p.full_name || p.email)[0]?.toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          {p.full_name || p.email}
                        </span>
                        {tasks.length > 0 && (
                          <span className="text-slate-400 dark:text-slate-500 text-xs">
                            {isExpanded ? '▲' : '▼'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <CountBadge value={s.open} color="blue" />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <CountBadge value={s.in_review} color="amber" />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <CountBadge value={s.done} color="green" />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <CountBadge value={s.overdue} color="red" pill />
                    </td>
                  </tr>
                  {isExpanded && tasks.length > 0 && (
                    <tr className="bg-slate-50 dark:bg-slate-800/20">
                      <td colSpan={5} className="px-5 py-3">
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                            Текущие задачи ({tasks.length})
                          </p>
                          {tasks.map((t) => (
                            <div key={t.id} className="flex items-center gap-2 py-1">
                              <span
                                className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[t.status as 'open' | 'in_review']}`}
                              >
                                {STATUS_LABEL[t.status as 'open' | 'in_review']}
                              </span>
                              <span className="text-sm text-slate-700 dark:text-slate-300">
                                {t.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden p-3 space-y-2">
        {profiles.map((p) => {
          const s = empStats[p.id] ?? { open: 0, in_review: 0, done: 0, overdue: 0 }
          const tasks = tasksByEmployee[p.id] ?? []
          const isExpanded = expandedId === p.id
          return (
            <div
              key={p.id}
              className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden"
            >
              <button
                onClick={() => toggleRow(p.id)}
                className="w-full text-left px-4 py-3 flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 text-sm font-bold shrink-0">
                  {(p.full_name || p.email)[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 dark:text-white text-sm truncate">
                    {p.full_name || p.email}
                  </div>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {s.open > 0 && (
                      <span className="text-xs text-blue-600 dark:text-blue-400">
                        {s.open} откр.
                      </span>
                    )}
                    {s.in_review > 0 && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        {s.in_review} пров.
                      </span>
                    )}
                    {s.done > 0 && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">
                        {s.done} выполн.
                      </span>
                    )}
                    {s.overdue > 0 && (
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                        {s.overdue} просроч.
                      </span>
                    )}
                  </div>
                </div>
                {tasks.length > 0 && (
                  <span className="text-slate-400 text-xs shrink-0">{isExpanded ? '▲' : '▼'}</span>
                )}
              </button>

              {isExpanded && tasks.length > 0 && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/30 space-y-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Текущие задачи
                  </p>
                  {tasks.map((t) => (
                    <div key={t.id} className="flex items-start gap-2">
                      <span
                        className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full ${STATUS_BADGE[t.status as 'open' | 'in_review']}`}
                      >
                        {STATUS_LABEL[t.status as 'open' | 'in_review']}
                      </span>
                      <span className="text-sm text-slate-700 dark:text-slate-300 leading-snug">
                        {t.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CountBadge({
  value,
  color,
  pill,
}: {
  value: number
  color: 'blue' | 'amber' | 'green' | 'red'
  pill?: boolean
}) {
  if (value === 0) {
    return <span className="text-slate-300 dark:text-slate-700 text-sm">—</span>
  }

  if (pill) {
    return (
      <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 font-bold text-xs">
        {value}
      </span>
    )
  }

  const colorClass = {
    blue: 'text-blue-600 dark:text-blue-400',
    amber: 'text-amber-600 dark:text-amber-400',
    green: 'text-emerald-600 dark:text-emerald-400',
    red: 'text-red-600 dark:text-red-400',
  }[color]

  return <span className={`font-semibold text-sm ${colorClass}`}>{value}</span>
}

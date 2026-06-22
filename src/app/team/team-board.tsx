'use client'

import { useState } from 'react'

type Profile = { id: string; full_name: string | null }
type Task = {
  id: string
  title: string
  status: string
  assigned_to: string | null
  completed_at: string | null
}
type Member = { task_id: string; profile_id: string }

const STATUS_LABEL: Record<string, string> = {
  open: 'Открыта',
  in_review: 'На проверке',
  done: 'Выполнено',
}

const STATUS_CLASS: Record<string, string> = {
  open: 'text-slate-600 bg-slate-100 border-slate-200',
  in_review: 'text-amber-700 bg-amber-50 border-amber-200',
  done: 'text-green-700 bg-green-50 border-green-200',
}

const MEDALS = ['🥇', '🥈', '🥉']

function sevenDaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString()
}

function pluralTasks(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} задача`
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} задачи`
  return `${n} задач`
}

export default function TeamBoard({
  profiles,
  tasks,
  members,
}: {
  profiles: Profile[]
  tasks: Task[]
  members: Member[]
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const cutoff = sevenDaysAgo()

  // task_id → принятые участники команды (засчитываются наравне с владельцем).
  const membersByTask: Record<string, string[]> = {}
  for (const m of members) {
    ;(membersByTask[m.task_id] ??= []).push(m.profile_id)
  }

  // Done tasks in last 7 days per employee — рейтинг по реально выполненным
  // владельцем (assigned_to), участников сюда НЕ добавляем.
  const weekDone: Record<string, number> = {}
  for (const t of tasks) {
    if (
      t.status === 'done' &&
      t.completed_at &&
      t.completed_at >= cutoff &&
      t.assigned_to
    ) {
      weekDone[t.assigned_to] = (weekDone[t.assigned_to] ?? 0) + 1
    }
  }

  // Tasks grouped by employee: свои (assigned_to) ∪ командные принятые.
  // Каждая задача засчитывается сотруднику один раз (без дублей).
  const byEmployee: Record<string, Task[]> = {}
  for (const t of tasks) {
    const responsible = new Set<string>()
    if (t.assigned_to) responsible.add(t.assigned_to)
    for (const pid of membersByTask[t.id] ?? []) responsible.add(pid)
    for (const pid of responsible) {
      ;(byEmployee[pid] ??= []).push(t)
    }
  }

  // Active tasks (open + in_review) per employee — из объединённого списка.
  const activeCount: Record<string, number> = {}
  for (const pid of Object.keys(byEmployee)) {
    activeCount[pid] = byEmployee[pid].filter(
      (t) => t.status === 'open' || t.status === 'in_review',
    ).length
  }

  // Leaderboard: only employees with done tasks this week
  const leaderboard = profiles
    .filter((p) => (weekDone[p.id] ?? 0) > 0)
    .map((p) => ({ ...p, count: weekDone[p.id] }))
    .sort((a, b) => b.count - a.count)

  const toggle = (id: string) => setExpanded((prev) => (prev === id ? null : id))

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">Команда</h1>

      {/* ── Leaderboard ── */}
      <section>
        <h2 className="text-base font-semibold text-slate-700 mb-3 uppercase tracking-wide text-xs">
          Рейтинг — выполнено за 7 дней
        </h2>
        {leaderboard.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 px-6 py-8 text-slate-400 text-sm text-center">
            Нет выполненных задач за последние 7 дней
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden divide-y divide-slate-100">
            {leaderboard.map((p, idx) => {
              const place = idx + 1
              const isTop3 = place <= 3
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    isTop3 ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <span className="w-7 text-center text-base shrink-0">
                    {place <= 3 ? (
                      MEDALS[place - 1]
                    ) : (
                      <span className="text-slate-400 font-semibold text-sm">{place}</span>
                    )}
                  </span>
                  <span
                    className={`flex-1 text-sm font-medium truncate ${
                      isTop3 ? 'text-blue-900' : 'text-slate-700'
                    }`}
                  >
                    {p.full_name ?? 'Сотрудник'}
                  </span>
                  <span
                    className={`text-sm font-bold shrink-0 ${
                      isTop3 ? 'text-blue-600' : 'text-slate-500'
                    }`}
                  >
                    {pluralTasks(p.count)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Employee accordion ── */}
      <section>
        <h2 className="text-base font-semibold text-slate-700 mb-3 uppercase tracking-wide text-xs">
          Сотрудники
        </h2>
        <div className="space-y-2">
          {profiles.map((p) => {
            const isOpen = expanded === p.id
            const empTasks = byEmployee[p.id] ?? []
            const done7 = weekDone[p.id] ?? 0
            const active = activeCount[p.id] ?? 0

            return (
              <div
                key={p.id}
                className="rounded-2xl bg-white border border-slate-200 overflow-hidden"
              >
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                  onClick={() => toggle(p.id)}
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm text-slate-900 truncate block">
                      {p.full_name ?? 'Сотрудник'}
                    </span>
                  </div>

                  {/* Mini counter: done in week / active */}
                  <div className="flex items-center gap-1.5 shrink-0 text-xs text-slate-500">
                    <span className="text-green-600 font-semibold">✓{done7}</span>
                    <span>·</span>
                    <span className="font-semibold text-slate-600">{active}</span>
                    <span>акт.</span>
                  </div>

                  {/* Arrow */}
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${
                      isOpen ? 'rotate-90' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 px-4 pt-2 pb-3 space-y-1.5">
                    {empTasks.length === 0 ? (
                      <p className="text-slate-400 text-sm py-3 text-center">Нет задач</p>
                    ) : (
                      empTasks.map((t) => (
                        <div
                          key={t.id}
                          className={`flex items-center gap-2 py-1.5 px-2 rounded-lg ${
                            t.status === 'done' ? 'bg-green-50' : 'bg-slate-50/60'
                          }`}
                        >
                          <span
                            className={`flex-1 text-sm truncate ${
                              t.status === 'done' ? 'text-green-800' : 'text-slate-800'
                            }`}
                          >
                            {t.title}
                          </span>
                          <span
                            className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${
                              STATUS_CLASS[t.status] ?? 'text-slate-600 bg-slate-100 border-slate-200'
                            }`}
                          >
                            {STATUS_LABEL[t.status] ?? t.status}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

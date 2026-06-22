'use client'

import { formatDateTime } from '@/lib/datetime'
import type { AttentionSignals } from '@/lib/attention'

export default function AttentionPanel({ signals }: { signals: AttentionSignals }) {
  const { multiOverdue, dueSoon, highRate, hasSignals } = signals

  if (!hasSignals) {
    return (
      <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/40 p-5">
        <h2 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
          ⚠️ Требует внимания
        </h2>
        <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1">
          Сейчас всё спокойно — острых рисков по задачам нет.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/30 p-5 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-amber-900 dark:text-amber-200">
          ⚠️ Требует внимания
        </h2>
        <p className="text-xs text-amber-700/80 dark:text-amber-300/70 mt-0.5">
          Сигналы риска по задачам и срокам
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {multiOverdue.length > 0 && (
          <SignalCard title="Несколько просрочек">
            <ul className="space-y-1">
              {multiOverdue.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2">
                  <span className="text-slate-700 dark:text-slate-200 truncate">{m.name}</span>
                  <span className="shrink-0 text-xs font-bold text-red-600 dark:text-red-400">
                    {m.overdue} просроч.
                  </span>
                </li>
              ))}
            </ul>
          </SignalCard>
        )}

        {dueSoon.length > 0 && (
          <SignalCard title="Дедлайн в ближайшие 24 ч">
            <ul className="space-y-1.5">
              {dueSoon.map((d, i) => (
                <li key={i} className="leading-snug">
                  <span className="text-slate-700 dark:text-slate-200">«{d.title}»</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {d.name} · {formatDateTime(d.due_date)}
                  </span>
                </li>
              ))}
            </ul>
          </SignalCard>
        )}

        {highRate.length > 0 && (
          <SignalCard title="Высокая доля просрочек">
            <ul className="space-y-1">
              {highRate.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2">
                  <span className="text-slate-700 dark:text-slate-200 truncate">{h.name}</span>
                  <span className="shrink-0 text-xs font-bold text-red-600 dark:text-red-400">
                    {Math.round(h.rate * 100)}% ({h.overdue}/{h.active})
                  </span>
                </li>
              ))}
            </ul>
          </SignalCard>
        )}
      </div>
    </div>
  )
}

function SignalCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-200/70 dark:border-amber-900/40 bg-white dark:bg-slate-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
        {title}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  )
}

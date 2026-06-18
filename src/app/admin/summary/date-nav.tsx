'use client'

import { useRouter } from 'next/navigation'

// Выбор даты для ИИ-сводки трекера: ←  [дата]  →
export default function DateNav({ date }: { date: string }) {
  const router = useRouter()

  function go(newDate: string) {
    router.push(`/admin/summary?date=${newDate}`)
  }

  function shift(days: number) {
    const d = new Date(`${date}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    go(d.toISOString().slice(0, 10))
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => shift(-1)}
        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm"
        aria-label="Предыдущий день"
      >
        ←
      </button>
      <input
        type="date"
        value={date}
        onChange={(e) => e.target.value && go(e.target.value)}
        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200"
      />
      <button
        type="button"
        onClick={() => shift(1)}
        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm"
        aria-label="Следующий день"
      >
        →
      </button>
    </div>
  )
}

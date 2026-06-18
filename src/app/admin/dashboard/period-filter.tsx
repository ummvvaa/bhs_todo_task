'use client'

import { useRouter, usePathname } from 'next/navigation'

type Period = 'day' | 'week' | 'month'

const LABELS: Record<Period, string> = {
  day: 'Сегодня',
  week: 'Неделя',
  month: 'Месяц',
}

export default function PeriodFilter({ current }: { current: Period }) {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
      {(['day', 'week', 'month'] as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => router.push(`${pathname}?period=${p}`)}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
            current === p
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          {LABELS[p]}
        </button>
      ))}
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { deleteAnnouncement } from '../announcement-actions'

export type AnnouncementItem = {
  id: string
  title: string
  description: string | null
  event_at: string
  audience: string
  event_at_label?: string
}

export default function AnnouncementList({ items }: { items: AnnouncementItem[] }) {
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleDelete(id: string) {
    setError(null)
    setPendingId(id)
    startTransition(async () => {
      const res = await deleteAnnouncement(id)
      setPendingId(null)
      if (res?.error) setError(res.error)
    })
  }

  if (items.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-6">Будущих объявлений нет.</p>
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 px-3.5 py-2.5 rounded-xl">
          {error}
        </p>
      )}
      {items.map((a) => (
        <div
          key={a.id}
          className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-900 dark:text-white text-sm">{a.title}</div>
            <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">{a.event_at_label}</div>
            {a.description && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 whitespace-pre-wrap">
                {a.description}
              </p>
            )}
            <span className="inline-block mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {a.audience === 'all' ? 'Всем сотрудникам' : 'Выбранным сотрудникам'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleDelete(a.id)}
            disabled={isPending && pendingId === a.id}
            className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50 transition-colors"
          >
            {isPending && pendingId === a.id ? 'Удаляем…' : 'Удалить'}
          </button>
        </div>
      ))}
    </div>
  )
}

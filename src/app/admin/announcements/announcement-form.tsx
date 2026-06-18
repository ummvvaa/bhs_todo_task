'use client'

import { useActionState, useEffect, useState } from 'react'
import { createAnnouncement } from '../announcement-actions'

export type StaffOption = {
  id: string
  full_name: string | null
  email: string
}

type FormState = { error?: string; success?: boolean } | null

export default function AnnouncementForm({ staff }: { staff: StaffOption[] }) {
  const [state, action, isPending] = useActionState<FormState, FormData>(createAnnouncement, null)
  const [selected, setSelected] = useState<Set<string>>(new Set(staff.map((s) => s.id)))
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    if (state?.success) {
      setSelected(new Set(staff.map((s) => s.id)))
      setFormKey((k) => k + 1)
    }
  }, [state, staff])

  const allSelected = staff.length > 0 && selected.size === staff.length

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSubmit(formData: FormData) {
    // «Все» (или все отмечены) → audience='all'; иначе 'selected' + recipientIds.
    if (allSelected) {
      formData.set('audience', 'all')
    } else {
      formData.set('audience', 'selected')
      selected.forEach((id) => formData.append('recipient', id))
    }
    action(formData)
  }

  const inputClass =
    'w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow'

  return (
    <form key={formKey} action={handleSubmit} className="space-y-4">
      <h2 className="text-base font-semibold text-slate-900 dark:text-white">Новое объявление</h2>

      {state?.success && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 border border-emerald-100 dark:border-emerald-900 px-3.5 py-2.5 rounded-xl">
          Объявление создано ✓
        </p>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          Название <span className="text-red-500">*</span>
        </label>
        <input type="text" name="title" required className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          Описание
        </label>
        <textarea name="description" rows={2} className={`${inputClass} resize-none`} />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          Дата и время <span className="text-red-500">*</span>
        </label>
        <input type="datetime-local" name="event_at" required className={inputClass} />
        <p className="text-xs text-slate-400 mt-1">Время указывается по Алматы (UTC+5).</p>
      </div>

      {/* Получатели */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Получатели{' '}
            <span className="text-slate-400 font-normal">
              ({allSelected ? 'все' : `${selected.size} выбрано`})
            </span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set(staff.map((s) => s.id)))}
              className="text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Все
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Снять
            </button>
          </div>
        </div>

        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
          {staff.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggle(p.id)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-900 dark:text-white truncate">
                {p.full_name ?? p.email}
              </span>
            </label>
          ))}
          {staff.length === 0 && (
            <p className="px-3.5 py-5 text-sm text-slate-400 text-center">
              Нет активных сотрудников.
            </p>
          )}
        </div>
        {allSelected && staff.length > 0 && (
          <p className="text-xs text-slate-400 mt-1.5">Объявление будет адресовано всем сотрудникам.</p>
        )}
      </div>

      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 px-3.5 py-2.5 rounded-xl">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || selected.size === 0}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors text-sm"
      >
        {isPending ? 'Создаём…' : selected.size === 0 ? 'Выберите получателей' : 'Создать объявление'}
      </button>
    </form>
  )
}

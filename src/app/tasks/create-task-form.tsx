'use client'

import { useActionState, useEffect, useState } from 'react'
import { createTask } from './actions'

type FormState = { error?: string; success?: boolean } | null

export default function CreateTaskForm() {
  const [state, action, isPending] = useActionState<FormState, FormData>(createTask, null)
  const [open, setOpen] = useState(false)
  const [isRecurring, setIsRecurring] = useState(false)
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    if (state?.success) {
      setOpen(false)
      setIsRecurring(false)
      setFormKey((k) => k + 1)
    }
  }, [state])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Создать задачу
      </button>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900 dark:text-white">Новая задача</h2>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setIsRecurring(false)
          }}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xl leading-none"
        >
          ×
        </button>
      </div>

      <form key={formKey} action={action} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Название <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="title"
            required
            autoFocus
            placeholder="Что нужно сделать?"
            className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Описание
          </label>
          <textarea
            name="description"
            rows={3}
            placeholder="Дополнительные детали..."
            className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-shadow"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Дедлайн
          </label>
          <input
            type="datetime-local"
            name="due_date"
            className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            name="is_recurring"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Регулярная задача
          </span>
        </label>

        {isRecurring && (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Повторять
            </label>
            <select
              name="recurrence"
              defaultValue="daily"
              className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
            >
              <option value="daily">Каждый день</option>
              <option value="weekly">Каждую неделю</option>
            </select>
          </div>
        )}

        {state?.error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 px-3.5 py-2 rounded-xl">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors text-sm"
        >
          {isPending ? 'Сохраняем…' : 'Создать задачу'}
        </button>
      </form>
    </div>
  )
}

'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { assignTask } from './assign-task-actions'

type Profile = {
  id: string
  full_name: string | null
  email: string
}

type FormState = { error?: string; success?: boolean; count?: number } | null

export default function AssignTaskForm({ profiles }: { profiles: Profile[] }) {
  const [state, action, isPending] = useActionState<FormState, FormData>(assignTask, null)
  const [open, setOpen] = useState(false)
  const [isRecurring, setIsRecurring] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [formKey, setFormKey] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)

  // ИИ-подбор
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiMessage, setAiMessage] = useState<string | null>(null)
  const [aiReasons, setAiReasons] = useState<Map<string, string>>(new Map())

  function resetAi() {
    setAiError(null)
    setAiMessage(null)
    setAiReasons(new Map())
  }

  useEffect(() => {
    if (state?.success) {
      setOpen(false)
      setIsRecurring(false)
      setSelected(new Set())
      setFormKey((k) => k + 1)
      resetAi()
    }
  }, [state])

  async function suggestAI() {
    const form = formRef.current
    if (!form) return
    const fd = new FormData(form)
    const title = (fd.get('title') as string)?.trim()
    const description = (fd.get('description') as string)?.trim() || ''
    if (!title) {
      setAiMessage(null)
      setAiReasons(new Map())
      setAiError('Сначала введите название задачи')
      return
    }

    setAiLoading(true)
    setAiError(null)
    setAiMessage(null)
    try {
      const res = await fetch('/api/admin/suggest-assignee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAiError(data?.error ?? 'Не удалось выполнить подбор')
        return
      }
      const suggestions = (data?.suggestions ?? []) as {
        id: string
        reason: string
      }[]
      const reasons = new Map<string, string>()
      suggestions.forEach((s) => reasons.set(s.id, s.reason))
      setAiReasons(reasons)
      setSelected(new Set(suggestions.map((s) => s.id)))
      if (suggestions.length === 0) {
        setAiMessage(data?.message ?? 'ИИ не нашёл подходящих сотрудников.')
      }
    } catch {
      setAiError('Сеть недоступна. Повторите позже.')
    } finally {
      setAiLoading(false)
    }
  }

  function toggleProfile(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSubmit(formData: FormData) {
    selected.forEach((id) => formData.append('assignee', id))
    action(formData)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Назначить задачу сотрудникам
      </button>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Новое задание</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setIsRecurring(false)
            setSelected(new Set())
            resetAi()
          }}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xl leading-none"
        >
          ×
        </button>
      </div>

      {state?.success && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 border border-emerald-100 dark:border-emerald-900 px-3.5 py-2.5 rounded-xl">
          Создано {state.count} {state.count === 1 ? 'задача' : 'задач'}
        </p>
      )}

      <form ref={formRef} key={formKey} action={handleSubmit} className="space-y-4">
        {/* Task fields */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Название <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="title"
            required
            autoFocus
            className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Описание
          </label>
          <textarea
            name="description"
            rows={2}
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

        {/* Employee selector */}
        <div>
          <div className="mb-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Сотрудники{' '}
              {selected.size > 0 && (
                <span className="text-slate-400 font-normal">({selected.size} выбрано)</span>
              )}
            </label>
          </div>

          {/* ИИ-подбор */}
          <button
            type="button"
            onClick={suggestAI}
            disabled={aiLoading || profiles.length === 0}
            className="w-full mb-2 py-2.5 px-3 flex items-center justify-center gap-2 text-sm font-semibold rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-950 disabled:opacity-50 transition-colors"
          >
            {aiLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Подбираем…
              </>
            ) : (
              <>✨ Подобрать ИИ</>
            )}
          </button>

          {aiError && (
            <p className="mb-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 px-3 py-2 rounded-xl">
              {aiError}
            </p>
          )}
          {aiMessage && (
            <p className="mb-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl">
              {aiMessage}
            </p>
          )}
          {aiReasons.size > 0 && (
            <p className="mb-2 text-xs text-violet-700 dark:text-violet-300">
              ИИ предложил {aiReasons.size} {aiReasons.size === 1 ? 'кандидата' : 'кандидатов'} (отмечены ✨). Проверьте и подтвердите.
            </p>
          )}

          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
            {profiles.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggleProfile(p.id)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="flex-1 min-w-0">
                  <span className="text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span className="truncate">{p.full_name ?? p.email}</span>
                    {aiReasons.has(p.id) && <span className="shrink-0">✨</span>}
                  </span>
                  {aiReasons.has(p.id) && (
                    <span className="block text-xs text-violet-600 dark:text-violet-400 mt-0.5">
                      {aiReasons.get(p.id)}
                    </span>
                  )}
                </span>
              </label>
            ))}
            {profiles.length === 0 && (
              <p className="px-3.5 py-5 text-sm text-slate-400 text-center">
                Нет сотрудников. Добавьте первого через раздел «Сотрудники».
              </p>
            )}
          </div>
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
          {isPending
            ? 'Создаём…'
            : selected.size === 0
              ? 'Выберите сотрудников'
              : `Назначить ${selected.size === 1 ? '1 сотруднику' : `${selected.size} сотрудникам`}`}
        </button>
      </form>
    </div>
  )
}

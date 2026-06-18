'use client'

import { useActionState, useEffect, useState } from 'react'
import { createTask } from './actions'

type Peer = {
  id: string
  full_name: string | null
  email: string
}

type FormState = { error?: string; success?: boolean } | null

export default function CreateTaskForm({ peers = [] }: { peers?: Peer[] }) {
  const [state, action, isPending] = useActionState<FormState, FormData>(createTask, null)
  const [open, setOpen] = useState(false)
  const [isRecurring, setIsRecurring] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [membersOpen, setMembersOpen] = useState(false)
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (state?.success) {
      setOpen(false)
      setIsRecurring(false)
      setMembersOpen(false)
      setSelectedMembers(new Set())
      setFormKey((k) => k + 1)
    }
  }, [state])

  function toggleMember(id: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
            setMembersOpen(false)
            setSelectedMembers(new Set())
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
            className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Описание
          </label>
          <textarea
            name="description"
            rows={3}
            className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-shadow"
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

        {/* Team invitation — collapsible */}
        {peers.length > 0 && (
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setMembersOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
            >
              <span className="flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                Пригласить в команду
                {selectedMembers.size > 0 && (
                  <span className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                    {selectedMembers.size}
                  </span>
                )}
              </span>
              <svg
                className={`w-4 h-4 text-slate-400 transition-transform ${membersOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {membersOpen && (
              <div className="border-t border-slate-200 dark:border-slate-700 max-h-48 overflow-y-auto">
                {peers.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors"
                  >
                    <input
                      type="checkbox"
                      name="member"
                      value={p.id}
                      checked={selectedMembers.has(p.id)}
                      onChange={() => toggleMember(p.id)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-900 dark:text-white truncate">
                      {p.full_name ?? p.email}
                    </span>
                  </label>
                ))}
              </div>
            )}
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

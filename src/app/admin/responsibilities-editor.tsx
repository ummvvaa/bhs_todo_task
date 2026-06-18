'use client'

import { useState, useTransition } from 'react'
import { updateResponsibilities } from './employee-actions'

type Profile = {
  id: string
  full_name: string | null
  email: string
  responsibilities: string | null
}

function EmployeeRow({ profile }: { profile: Profile }) {
  const [value, setValue] = useState(profile.responsibilities ?? '')
  const [saved, setSaved] = useState(profile.responsibilities ?? '')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [isPending, startTransition] = useTransition()

  const dirty = value.trim() !== saved.trim()

  function save() {
    setError(null)
    setOk(false)
    startTransition(async () => {
      const res = await updateResponsibilities(profile.id, value)
      if (res?.error) {
        setError(res.error)
        return
      }
      setSaved(value)
      setOk(true)
      setTimeout(() => setOk(false), 2000)
    })
  }

  return (
    <div className="px-3.5 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
          {profile.full_name ?? profile.email}
        </span>
        {ok && <span className="text-xs text-emerald-600 dark:text-emerald-400 shrink-0">Сохранено ✓</span>}
      </div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setOk(false)
        }}
        rows={2}
        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-shadow"
      />
      {error && (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="mt-1.5 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || isPending}
          className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 transition-colors"
        >
          {isPending ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}

export default function ResponsibilitiesEditor({ profiles }: { profiles: Profile[] }) {
  if (profiles.length === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-5">
        Нет сотрудников. Добавьте первого через раздел «Список сотрудников».
      </p>
    )
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {profiles.map((p) => (
        <EmployeeRow key={p.id} profile={p} />
      ))}
    </div>
  )
}

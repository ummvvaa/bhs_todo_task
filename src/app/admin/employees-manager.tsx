'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateEmployee, toggleEmployee } from './employee-actions'

export type EmployeeProfile = {
  id: string
  full_name: string | null
  email: string
  role: string
  responsibilities: string | null
  is_active: boolean
}

const ROLES = [
  { value: 'staff', label: 'Сотрудник' },
  { value: 'admin', label: 'Администратор' },
]

function AddEmployeeForm({ onCreated }: { onCreated: (email: string) => void }) {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    role: 'staff',
    responsibilities: '',
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password.length < 6) {
      setError('Пароль должен содержать минимум 6 символов')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setError(data.error ?? 'Ошибка создания')
        return
      }
      onCreated(data.email)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  const inputCls =
    'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Имя и фамилия *</label>
          <input
            className={inputCls}
            value={form.full_name}
            onChange={(e) => set('full_name', e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Email *</label>
          <input
            className={inputCls}
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Пароль *</label>
          <input
            className={inputCls}
            type="password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className={labelCls}>Роль</label>
          <select
            className={inputCls}
            value={form.role}
            onChange={(e) => set('role', e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Зона ответственности / обязанности</label>
        <textarea
          className={inputCls + ' resize-none'}
          rows={2}
          value={form.responsibilities}
          onChange={(e) => set('responsibilities', e.target.value)}
        />
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex gap-2 justify-end">
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          {loading ? 'Создание…' : 'Создать сотрудника'}
        </button>
      </div>
    </form>
  )
}

function EditEmployeeForm({
  profile,
  onDone,
}: {
  profile: EmployeeProfile
  onDone: () => void
}) {
  const [form, setForm] = useState({
    full_name: profile.full_name ?? '',
    role: profile.role,
    responsibilities: profile.responsibilities ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const result = await updateEmployee(profile.id, {
        full_name: form.full_name,
        role: form.role,
        responsibilities: form.responsibilities || null,
      })
      if (result.error) {
        setError(result.error)
      } else {
        onDone()
      }
    })
  }

  const inputCls =
    'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1'

  return (
    <div className="space-y-3 pt-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Имя и фамилия *</label>
          <input
            className={inputCls}
            value={form.full_name}
            onChange={(e) => set('full_name', e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input
            className={inputCls + ' opacity-60 cursor-not-allowed'}
            value={profile.email}
            disabled
          />
        </div>
        <div>
          <label className={labelCls}>Роль</label>
          <select
            className={inputCls}
            value={form.role}
            onChange={(e) => set('role', e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Зона ответственности / обязанности</label>
        <textarea
          className={inputCls + ' resize-none'}
          rows={2}
          value={form.responsibilities}
          onChange={(e) => set('responsibilities', e.target.value)}
        />
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex gap-2 justify-end">
        <button
          onClick={onDone}
          disabled={isPending}
          className="rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Отмена
        </button>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          {isPending ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}

function ResetPasswordForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 6) {
      setError('Пароль должен содержать минимум 6 символов')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newPassword }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setError(data.error ?? 'Ошибка сброса пароля')
        return
      }
      setSuccess(true)
    } finally {
      setLoading(false)
    }
  }

  const inputCls =
    'rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500'

  if (success) {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
        <span className="text-sm text-emerald-700 dark:text-emerald-300 flex-1">Пароль обновлён ✓</span>
        <button onClick={onClose} className="text-xs text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 underline">
          Закрыть
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={inputCls + ' flex-1 min-w-[180px]'}
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-2 transition-colors whitespace-nowrap"
        >
          {loading ? '…' : 'Установить'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Отмена
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  )
}

function EmployeeRow({
  profile,
  currentUserId,
}: {
  profile: EmployeeProfile
  currentUserId: string
}) {
  const [editing, setEditing] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [toggling, startTogglingTransition] = useTransition()
  const [toggleError, setToggleError] = useState<string | null>(null)
  const isSelf = profile.id === currentUserId

  function handleToggle() {
    setToggleError(null)
    startTogglingTransition(async () => {
      const result = await toggleEmployee(profile.id, !profile.is_active)
      if (result.error) setToggleError(result.error)
    })
  }

  const roleBadge =
    profile.role === 'admin'
      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'

  const roleLabel = profile.role === 'admin' ? 'Администратор' : 'Сотрудник'

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        profile.is_active
          ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 opacity-70'
      }`}
    >
      {/* Header row: на мобильном — колонкой (имя/email сверху, кнопки ниже), на ≥sm — в строку */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900 dark:text-white text-sm break-words">
              {profile.full_name ?? '—'}
            </span>
            <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${roleBadge}`}>
              {roleLabel}
            </span>
            {!profile.is_active && (
              <span className="text-xs rounded-full px-2 py-0.5 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 font-medium">
                Деактивирован
              </span>
            )}
            {isSelf && (
              <span className="text-xs rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-medium">
                Вы
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-words">{profile.email}</p>
          {profile.responsibilities && !editing && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 line-clamp-2">
              {profile.responsibilities}
            </p>
          )}
        </div>

        {/* Action buttons: на мобильном переносятся на свою строку под именем, не сжимают имя */}
        <div className="flex flex-wrap items-center gap-1 sm:flex-shrink-0">
          {!editing && !resettingPassword && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Изменить
              </button>
              <button
                onClick={() => setResettingPassword(true)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Сброс пароля
              </button>
              {!isSelf && (
                <button
                  onClick={handleToggle}
                  disabled={toggling}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 transition-colors ${
                    profile.is_active
                      ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                      : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                  }`}
                >
                  {toggling ? '…' : profile.is_active ? 'Деактивировать' : 'Активировать'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Toggle error */}
      {toggleError && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{toggleError}</p>
      )}

      {/* Reset password inline form */}
      {resettingPassword && (
        <ResetPasswordForm userId={profile.id} onClose={() => setResettingPassword(false)} />
      )}

      {/* Edit form */}
      {editing && (
        <EditEmployeeForm profile={profile} onDone={() => setEditing(false)} />
      )}
    </div>
  )
}

export default function EmployeesManager({
  profiles,
  currentUserId,
}: {
  profiles: EmployeeProfile[]
  currentUserId: string
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [createdEmail, setCreatedEmail] = useState<string | null>(null)

  function handleCreated(email: string) {
    setCreatedEmail(email)
    setShowAdd(false)
  }

  const active = profiles.filter((p) => p.is_active)
  const inactive = profiles.filter((p) => !p.is_active)

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {active.length} активных
          {inactive.length > 0 && `, ${inactive.length} деактивированных`}
        </p>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          {showAdd ? 'Отмена' : '+ Добавить сотрудника'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
            Новый сотрудник
          </h3>
          <AddEmployeeForm onCreated={handleCreated} />
        </div>
      )}

      {/* New employee created confirmation */}
      {createdEmail && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Сотрудник <span className="font-medium">{createdEmail}</span> создан ✓
          </p>
          <button
            onClick={() => setCreatedEmail(null)}
            className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 text-lg leading-none flex-shrink-0"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
      )}

      {/* Active employees */}
      {active.length === 0 && !showAdd && (
        <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">
          Нет активных сотрудников
        </p>
      )}
      <div className="space-y-2">
        {active.map((p) => (
          <EmployeeRow key={p.id} profile={p} currentUserId={currentUserId} />
        ))}
      </div>

      {/* Deactivated employees */}
      {inactive.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            Деактивированные
          </p>
          {inactive.map((p) => (
            <EmployeeRow key={p.id} profile={p} currentUserId={currentUserId} />
          ))}
        </div>
      )}
    </div>
  )
}

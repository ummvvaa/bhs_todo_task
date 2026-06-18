'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ChangePasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (next.length < 6) {
      setError('Новый пароль должен содержать минимум 6 символов')
      return
    }
    if (next !== confirm) {
      setError('Новые пароли не совпадают')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()

      // Проверяем текущий пароль повторной аутентификацией
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      })
      if (signInError) {
        setError('Текущий пароль неверный')
        return
      }

      // Устанавливаем новый пароль
      const { error: updateError } = await supabase.auth.updateUser({ password: next })
      if (updateError) {
        setError(updateError.message)
        return
      }

      setSuccess(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } finally {
      setLoading(false)
    }
  }

  const inputCls =
    'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1'

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
      <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Сменить пароль</h2>

      {success && (
        <div className="mb-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
          <p className="text-sm text-emerald-700 dark:text-emerald-300">Пароль успешно изменён ✓</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className={labelCls}>Текущий пароль</label>
          <input
            className={inputCls}
            type="password"
            value={current}
            onChange={(e) => { setCurrent(e.target.value); setError(null); setSuccess(false) }}
            required
            autoComplete="current-password"
          />
        </div>
        <div>
          <label className={labelCls}>Новый пароль</label>
          <input
            className={inputCls}
            type="password"
            value={next}
            onChange={(e) => { setNext(e.target.value); setError(null); setSuccess(false) }}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className={labelCls}>Повтор нового пароля</label>
          <input
            className={inputCls}
            type="password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setError(null); setSuccess(false) }}
            required
            autoComplete="new-password"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            {loading ? 'Сохранение…' : 'Изменить пароль'}
          </button>
        </div>
      </form>
    </div>
  )
}

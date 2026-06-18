'use client'

import { useState } from 'react'

// Кнопка генерации ИИ-сводки трекера за выбранную дату.
export default function AiSummary({ date }: { date: string }) {
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setSummary(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/tracker-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? `Ошибка (HTTP ${res.status})`)
      else setSummary(data.summary ?? '')
    } catch {
      setError('Ошибка сети. Проверьте подключение и повторите.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {loading ? 'Формируем…' : '✨ Сформировать ИИ-сводку'}
      </button>

      {error && (
        <div className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {summary && (
        <div className="px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
          {summary}
        </div>
      )}
    </div>
  )
}

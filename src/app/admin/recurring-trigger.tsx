'use client'

import { useState } from 'react'

type Result = { created: number; message?: string; error?: string } | null

export default function RecurringTrigger() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result>(null)

  async function trigger() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/generate-recurring', { method: 'POST' })
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ created: 0, error: 'Ошибка сети' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Создаёт следующий экземпляр для каждой выполненной регулярной задачи, у которой
        ещё нет активного продолжения. На Этапе 7 эта функция будет запускаться автоматически
        каждую ночь.
      </p>
      <button
        onClick={trigger}
        disabled={loading}
        className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors dark:bg-gray-700 dark:hover:bg-gray-600"
      >
        {loading ? 'Запускаем...' : '▶ Запустить сейчас'}
      </button>

      {result && (
        <div
          className={`px-3 py-2 rounded-lg text-sm ${
            result.error
              ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400'
              : result.created > 0
                ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400'
                : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
          }`}
        >
          {result.error
            ? `Ошибка: ${result.error}`
            : result.created > 0
              ? `Создано новых задач: ${result.created}`
              : result.message ?? 'Нет новых задач'}
        </div>
      )}
    </div>
  )
}

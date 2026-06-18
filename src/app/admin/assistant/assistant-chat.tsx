'use client'

import { useRef, useState } from 'react'

// История вопросов/ответов в рамках текущей сессии (в памяти, без сохранения).
type Entry = {
  id: number
  question: string
  answer: string | null
  error: string | null
}

const EXAMPLES = [
  'У кого есть просрочки?',
  'Кто меньше всего загружен?',
  'Сколько задач на проверке?',
  'Что в работе на этой неделе?',
]

export default function AssistantChat() {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<Entry[]>([])
  const nextId = useRef(1)

  async function ask(q: string) {
    const text = q.trim()
    if (!text || loading) return

    const id = nextId.current++
    setHistory((h) => [{ id, question: text, answer: null, error: null }, ...h])
    setQuestion('')
    setLoading(true)

    try {
      const res = await fetch('/api/admin/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        const error = data.error ?? `Ошибка (HTTP ${res.status})`
        setHistory((h) => h.map((e) => (e.id === id ? { ...e, error } : e)))
      } else {
        setHistory((h) =>
          h.map((e) => (e.id === id ? { ...e, answer: data.answer ?? '' } : e)),
        )
      }
    } catch {
      setHistory((h) =>
        h.map((e) =>
          e.id === id ? { ...e, error: 'Ошибка сети. Проверьте подключение и повторите.' } : e,
        ),
      )
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    ask(question)
  }

  return (
    <div className="space-y-5">
      {/* Поле ввода */}
      <form onSubmit={onSubmit} className="space-y-3">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              ask(question)
            }
          }}
          rows={2}
          placeholder="Спросите о задачах и сотрудниках обычными словами…"
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:block">
            Ctrl/⌘ + Enter — отправить
          </span>
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Думаю…' : '✨ Спросить'}
          </button>
        </div>
      </form>

      {/* Примеры вопросов — пока истории нет */}
      {history.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => ask(ex)}
              disabled={loading}
              className="px-3 py-1.5 text-xs rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* История ответов в сессии (новые сверху) */}
      <div className="space-y-3">
        {history.map((e) => (
          <div
            key={e.id}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 space-y-2"
          >
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{e.question}</p>
            {e.answer === null && !e.error ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">Думаю…</p>
            ) : e.error ? (
              <div className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400">
                {e.error}
              </div>
            ) : (
              <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                {e.answer}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

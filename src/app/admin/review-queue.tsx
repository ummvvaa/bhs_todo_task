'use client'

import { useState, useTransition } from 'react'
import { acceptTask, returnTask } from './review-actions'
import { formatDateTime } from '@/lib/datetime'

type ReviewTaskFile = {
  id: string
  file_name: string
  size: number | null
  signed_url: string | null
}

type ReviewTask = {
  id: string
  title: string
  description: string | null
  due_date: string | null
  assigned_to: string | null
  created_at: string
  task_files?: ReviewTaskFile[]
}

type Profile = {
  id: string
  full_name: string | null
  email: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

export default function ReviewQueue({
  tasks,
  profiles,
}: {
  tasks: ReviewTask[]
  profiles: Profile[]
}) {
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [returnId, setReturnId] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]))

  function handleAccept(taskId: string) {
    setPendingId(taskId)
    setError(null)
    startTransition(async () => {
      const result = await acceptTask(taskId)
      if (result?.error) setError(result.error)
      setPendingId(null)
    })
  }

  function handleReturnOpen(taskId: string) {
    setReturnId(taskId)
    setComment('')
    setError(null)
  }

  function handleReturnCancel() {
    setReturnId(null)
    setComment('')
    setError(null)
  }

  function handleReturnSubmit(taskId: string) {
    if (!comment.trim()) {
      setError('Напишите причину возврата')
      return
    }
    setPendingId(taskId)
    setError(null)
    startTransition(async () => {
      const result = await returnTask(taskId, comment)
      if (result?.error) {
        setError(result.error)
        setPendingId(null)
      } else {
        setReturnId(null)
        setComment('')
        setPendingId(null)
      }
    })
  }

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
        Задач на проверке нет
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 px-3.5 py-2.5 rounded-xl border border-red-100 dark:border-red-900">
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {tasks.map((task) => {
          const assignee = task.assigned_to ? profileMap[task.assigned_to] : null
          const isReturning = returnId === task.id
          const loading = isPending && pendingId === task.id
          const overdue = task.due_date ? new Date(task.due_date) < new Date() : false
          const files = task.task_files ?? []

          return (
            <li
              key={task.id}
              className={`bg-slate-50 dark:bg-slate-800/50 rounded-2xl border p-4 ${
                overdue
                  ? 'border-red-200 dark:border-red-900'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="space-y-2.5">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 dark:text-white leading-snug">
                      {task.title}
                    </h3>
                    {assignee && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>{assignee.full_name || assignee.email}</span>
                      </p>
                    )}
                  </div>
                  {task.due_date && (
                    <span
                      className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
                        overdue
                          ? 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400 border border-red-100 dark:border-red-900'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                      }`}
                    >
                      До {formatDateTime(task.due_date)}
                    </span>
                  )}
                </div>

                {/* Description */}
                {task.description && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {task.description}
                  </p>
                )}

                {/* Attached files */}
                {files.length > 0 && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Прикреплённые файлы
                    </p>
                    <div className="space-y-1">
                      {files.map((f) =>
                        f.signed_url ? (
                          <a
                            key={f.id}
                            href={f.signed_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={f.file_name}
                            className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline group"
                          >
                            <span className="shrink-0">📎</span>
                            <span className="truncate flex-1">{f.file_name}</span>
                            {f.size != null && (
                              <span className="text-xs text-slate-400 shrink-0">
                                {formatBytes(f.size)}
                              </span>
                            )}
                            <span className="text-xs text-slate-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              ↓ скачать
                            </span>
                          </a>
                        ) : (
                          <div
                            key={f.id}
                            className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"
                          >
                            <span className="shrink-0">📎</span>
                            <span className="truncate">{f.file_name}</span>
                            {f.size != null && (
                              <span className="text-xs text-slate-400">{formatBytes(f.size)}</span>
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                {isReturning ? (
                  <div className="pt-1 space-y-2">
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Причина возврата (обязательно)..."
                      rows={3}
                      className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400 transition-shadow"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReturnSubmit(task.id)}
                        disabled={loading}
                        className="flex-1 text-sm font-semibold bg-orange-500 hover:bg-orange-600 active:bg-orange-700 disabled:opacity-50 text-white py-2.5 rounded-xl transition-colors"
                      >
                        {loading ? '…' : 'Подтвердить возврат'}
                      </button>
                      <button
                        onClick={handleReturnCancel}
                        disabled={loading}
                        className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-0.5">
                    <button
                      onClick={() => handleAccept(task.id)}
                      disabled={loading}
                      className="flex-1 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white py-2.5 rounded-xl transition-colors"
                    >
                      {loading ? '…' : '✓ Принять'}
                    </button>
                    <button
                      onClick={() => handleReturnOpen(task.id)}
                      disabled={loading}
                      className="flex-1 text-sm font-semibold bg-orange-500 hover:bg-orange-600 active:bg-orange-700 disabled:opacity-50 text-white py-2.5 rounded-xl transition-colors"
                    >
                      Вернуть
                    </button>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

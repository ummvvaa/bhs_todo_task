'use client'

import { useRef, useState, useTransition } from 'react'
import { markInReview, recordTaskFiles } from './actions'
import { formatDateTime } from '@/lib/datetime'
import { createClient } from '@/lib/supabase/client'

type TaskComment = {
  id: string
  body: string
  created_at: string
}

type TaskFile = {
  id: string
  file_name: string
  size: number | null
  created_at: string
}

type Task = {
  id: string
  title: string
  description: string | null
  due_date: string | null
  status: 'open' | 'in_review' | 'done'
  is_recurring: boolean
  recurrence: 'daily' | 'weekly' | null
  created_at: string
  completed_at: string | null
  task_comments?: TaskComment[]
  task_files?: TaskFile[]
}

type Filter = 'open' | 'in_review' | 'done' | 'overdue'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'Открытые' },
  { key: 'in_review', label: 'На проверке' },
  { key: 'done', label: 'Выполненные' },
  { key: 'overdue', label: 'Просроченные' },
]

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 МБ

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

function isOverdue(task: Task, now: Date): boolean {
  if (!task.due_date) return false
  if (task.status === 'done') return false
  return new Date(task.due_date) < now
}

function StatusBadge({ status }: { status: Task['status'] }) {
  const config: Record<Task['status'], { label: string; className: string }> = {
    open: {
      label: 'Открыта',
      className:
        'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-100 dark:border-blue-900',
    },
    in_review: {
      label: 'На проверке',
      className:
        'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-100 dark:border-amber-900',
    },
    done: {
      label: 'Выполнена',
      className:
        'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900',
    },
  }
  const { label, className } = config[status]
  return (
    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${className}`}>
      {label}
    </span>
  )
}

export default function TaskList({ tasks }: { tasks: Task[] }) {
  const [filter, setFilter] = useState<Filter>('open')
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  // Состояние «отправки на проверку» с прикреплением файлов
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const now = new Date()

  const counts: Record<Filter, number> = {
    open: tasks.filter((t) => t.status === 'open').length,
    in_review: tasks.filter((t) => t.status === 'in_review').length,
    done: tasks.filter((t) => t.status === 'done').length,
    overdue: tasks.filter(
      (t) =>
        (t.status === 'open' || t.status === 'in_review') &&
        !!t.due_date &&
        new Date(t.due_date) < now,
    ).length,
  }

  const filtered = tasks.filter((t) => {
    if (filter === 'overdue') {
      return (
        (t.status === 'open' || t.status === 'in_review') &&
        !!t.due_date &&
        new Date(t.due_date) < now
      )
    }
    return t.status === filter
  })

  function openFileUpload(taskId: string) {
    setReviewingId(taskId)
    setSelectedFiles([])
    setUploadError(null)
  }

  function cancelFileUpload() {
    setReviewingId(null)
    setSelectedFiles([])
    setUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setUploadError(null)

    const oversized = files.filter((f) => f.size > MAX_FILE_SIZE)
    if (oversized.length > 0) {
      setUploadError(
        `Превышает 50 МБ: ${oversized.map((f) => f.name).join(', ')}`,
      )
      e.target.value = ''
      return
    }

    setSelectedFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size))
      const toAdd = files.filter((f) => !existing.has(f.name + f.size))
      return [...prev, ...toAdd]
    })
    e.target.value = ''
  }

  function removeFile(idx: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmitReview(taskId: string) {
    setIsUploading(true)
    setUploadError(null)

    try {
      const supabase = createClient()
      const fileRecords: Array<{
        file_path: string
        file_name: string
        mime_type: string | null
        size: number | null
      }> = []

      for (const file of selectedFiles) {
        const uid = Date.now().toString(36) + Math.random().toString(36).slice(2)
        const path = `${taskId}/${uid}`
        const { error } = await supabase.storage
          .from('task-files')
          .upload(path, file, { contentType: file.type || 'application/octet-stream' })
        if (error) {
          setUploadError(`Ошибка загрузки «${file.name}»: ${error.message}`)
          setIsUploading(false)
          return
        }
        fileRecords.push({
          file_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size: file.size,
        })
      }

      if (fileRecords.length > 0) {
        const result = await recordTaskFiles(taskId, fileRecords)
        if (result?.error) {
          setUploadError(`Не удалось сохранить файлы: ${result.error}`)
          setIsUploading(false)
          return
        }
      }

      setPendingId(taskId)
      startTransition(async () => {
        await markInReview(taskId)
        setReviewingId(null)
        setSelectedFiles([])
        setPendingId(null)
      })
    } catch {
      setUploadError('Ошибка сети. Попробуйте ещё раз.')
      setIsUploading(false)
    }
  }

  const emptyMessages: Record<Filter, string> = {
    open: 'Открытых задач нет — создайте первую выше',
    in_review: 'Нет задач на проверке',
    done: 'Выполненных задач пока нет',
    overdue: 'Просроченных задач нет',
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl overflow-x-auto no-scrollbar">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`flex-1 min-w-max py-2 px-3 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
              filter === key
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {label}
            {counts[key] > 0 && (
              <span
                className={`ml-1.5 inline-block px-1.5 py-0.5 text-xs rounded-full ${
                  key === 'overdue'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                    : filter === key
                      ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                }`}
              >
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Task cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-14 text-slate-400 dark:text-slate-600 select-none">
          <div className="text-5xl mb-3">📋</div>
          <p className="text-base font-medium text-slate-500 dark:text-slate-400">
            {emptyMessages[filter]}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((task) => {
            const overdue = isOverdue(task, now)
            const isReviewing = reviewingId === task.id
            const loading = (isPending || isUploading) && pendingId === task.id

            return (
              <li
                key={task.id}
                className={`bg-white dark:bg-slate-900 rounded-2xl shadow-sm border transition-colors ${
                  overdue
                    ? 'border-red-200 dark:border-red-900'
                    : 'border-slate-100 dark:border-slate-800'
                }`}
              >
                <div className="p-4 space-y-2.5">
                  {/* Title + badge */}
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-slate-900 dark:text-white leading-snug">
                      {task.title}
                    </h3>
                    <StatusBadge status={task.status} />
                  </div>

                  {/* Description */}
                  {task.description && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                      {task.description}
                    </p>
                  )}

                  {/* Manager comments */}
                  {task.task_comments && task.task_comments.length > 0 && (
                    <div className="bg-orange-50 dark:bg-orange-950/50 border border-orange-100 dark:border-orange-900 rounded-xl px-3.5 py-2.5 space-y-1.5">
                      <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wide">
                        Комментарий начальника
                      </p>
                      {task.task_comments.map((c) => (
                        <p
                          key={c.id}
                          className="text-sm text-orange-800 dark:text-orange-200 leading-snug"
                        >
                          &ldquo;{c.body}&rdquo;
                          <span className="ml-1.5 text-xs text-orange-400 dark:text-orange-500">
                            {formatDateTime(c.created_at)}
                          </span>
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Attached files (already uploaded) */}
                  {task.task_files && task.task_files.length > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-3.5 py-2.5 space-y-1.5">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        Прикреплённые файлы
                      </p>
                      <div className="space-y-1">
                        {task.task_files.map((f) => (
                          <div
                            key={f.id}
                            className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"
                          >
                            <span className="shrink-0">📎</span>
                            <span className="truncate">{f.file_name}</span>
                            {f.size != null && (
                              <span className="text-xs text-slate-400 shrink-0">
                                {formatBytes(f.size)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Footer: deadline + action */}
                  <div className="flex items-center justify-between flex-wrap gap-2 pt-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {task.due_date && (
                        <span
                          className={`text-xs font-medium ${
                            overdue
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          До {formatDateTime(task.due_date)}
                          {overdue && ' · просрочено'}
                        </span>
                      )}
                      {task.is_recurring && (
                        <span className="text-xs text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950 border border-violet-100 dark:border-violet-900 px-2 py-0.5 rounded-full">
                          {task.recurrence === 'daily' ? 'Ежедневно' : 'Еженедельно'}
                        </span>
                      )}
                    </div>

                    {task.status === 'open' && !isReviewing && (
                      <button
                        onClick={() => openFileUpload(task.id)}
                        className="text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-5 py-2 rounded-xl transition-colors"
                      >
                        Готово →
                      </button>
                    )}
                  </div>

                  {/* File upload area (shown when "Готово" clicked) */}
                  {task.status === 'open' && isReviewing && (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-3 bg-slate-50 dark:bg-slate-800/50">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Прикрепите файлы (необязательно) и отправьте на проверку
                      </p>

                      {/* Hidden file input */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                        className="hidden"
                        onChange={handleFilesChange}
                      />

                      {/* Select files button */}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl px-3.5 py-2 transition-colors disabled:opacity-50"
                      >
                        <span>📎</span>
                        <span>Выбрать файлы (макс. 50 МБ)</span>
                      </button>

                      {/* Selected files list */}
                      {selectedFiles.length > 0 && (
                        <ul className="space-y-1">
                          {selectedFiles.map((f, idx) => (
                            <li
                              key={idx}
                              className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"
                            >
                              <span className="shrink-0">📎</span>
                              <span className="truncate flex-1">{f.name}</span>
                              <span className="text-xs text-slate-400 shrink-0">
                                {formatBytes(f.size)}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeFile(idx)}
                                disabled={isUploading}
                                className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 shrink-0 disabled:opacity-50"
                                aria-label="Удалить файл"
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Error */}
                      {uploadError && (
                        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900 rounded-xl px-3 py-2">
                          {uploadError}
                        </p>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSubmitReview(task.id)}
                          disabled={isUploading || (loading && pendingId === task.id)}
                          className="flex-1 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white py-2.5 rounded-xl transition-colors"
                        >
                          {isUploading || loading
                            ? selectedFiles.length > 0
                              ? 'Загрузка…'
                              : 'Отправка…'
                            : selectedFiles.length > 0
                              ? `Прикрепить ${selectedFiles.length} ${selectedFiles.length === 1 ? 'файл' : 'файла'} и отправить`
                              : 'Отправить на проверку'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelFileUpload}
                          disabled={isUploading}
                          className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

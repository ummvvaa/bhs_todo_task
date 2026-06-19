'use client'

import { useRef, useState, useTransition } from 'react'
import { markInReview, recordTaskFiles, markDone, reopenTask } from './actions'
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

type TaskMember = {
  profile_id: string
  status: 'pending' | 'accepted' | 'declined'
  full_name: string | null
}

type Task = {
  id: string
  title: string
  description: string | null
  assigned_to: string | null
  due_date: string | null
  status: 'open' | 'in_review' | 'done'
  is_recurring: boolean
  recurrence: 'daily' | 'weekly' | null
  created_at: string
  completed_at: string | null
  task_comments?: TaskComment[]
  task_files?: TaskFile[]
  task_members?: TaskMember[]
}

type Filter = 'open' | 'in_review' | 'done' | 'overdue'
type DateField = 'created_at' | 'due_date' | 'completed_at'
type DatePeriod = 'today' | 'week' | 'month' | 'all'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'Открытые' },
  { key: 'in_review', label: 'На проверке' },
  { key: 'done', label: 'Выполненные' },
  { key: 'overdue', label: 'Просроченные' },
]

const DATE_FIELDS: { key: DateField; label: string }[] = [
  { key: 'created_at', label: 'Создано' },
  { key: 'due_date', label: 'Дедлайн' },
  { key: 'completed_at', label: 'Выполнено' },
]

const DATE_PERIODS: { key: DatePeriod; label: string }[] = [
  { key: 'today', label: 'Сегодня' },
  { key: 'week', label: 'Эта неделя' },
  { key: 'month', label: 'Этот месяц' },
  { key: 'all', label: 'Все' },
]

const MAX_FILE_SIZE = 50 * 1024 * 1024
// UTC+5 в миллисекундах — Алматы без DST
const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000

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

// Возвращает [start, end) в UTC для заданного периода в поясе Алматы.
function getPeriodBounds(period: DatePeriod, now: Date): { start: Date; end: Date } | null {
  if (period === 'all') return null

  const almatyMs = now.getTime() + ALMATY_OFFSET_MS
  const a = new Date(almatyMs)
  const y = a.getUTCFullYear()
  const m = a.getUTCMonth()
  const d = a.getUTCDate()
  const dow = a.getUTCDay() // 0=Вс

  let startA: Date
  let endA: Date

  if (period === 'today') {
    startA = new Date(Date.UTC(y, m, d))
    endA = new Date(Date.UTC(y, m, d + 1))
  } else if (period === 'week') {
    const daysFromMon = dow === 0 ? 6 : dow - 1
    startA = new Date(Date.UTC(y, m, d - daysFromMon))
    endA = new Date(Date.UTC(y, m, d - daysFromMon + 7))
  } else {
    startA = new Date(Date.UTC(y, m, 1))
    endA = new Date(Date.UTC(y, m + 1, 1))
  }

  return {
    start: new Date(startA.getTime() - ALMATY_OFFSET_MS),
    end: new Date(endA.getTime() - ALMATY_OFFSET_MS),
  }
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

export default function TaskList({
  tasks,
  isAdmin,
  userId,
}: {
  tasks: Task[]
  isAdmin: boolean
  userId: string
}) {
  const [filter, setFilter] = useState<Filter>('open')
  const [dateField, setDateField] = useState<DateField>('created_at')
  const [datePeriod, setDatePeriod] = useState<DatePeriod>('all')

  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const [isCheckPending, startCheckTransition] = useTransition()
  const [checkPendingId, setCheckPendingId] = useState<string | null>(null)

  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
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

  const periodBounds = datePeriod !== 'all' ? getPeriodBounds(datePeriod, now) : null

  const filtered = tasks.filter((t) => {
    let matchesStatus: boolean
    if (filter === 'overdue') {
      matchesStatus =
        (t.status === 'open' || t.status === 'in_review') &&
        !!t.due_date &&
        new Date(t.due_date) < now
    } else {
      matchesStatus = t.status === filter
    }

    let matchesDate = true
    if (periodBounds) {
      const val =
        dateField === 'created_at'
          ? t.created_at
          : dateField === 'due_date'
            ? t.due_date
            : t.completed_at
      if (!val) {
        matchesDate = false
      } else {
        const d = new Date(val)
        matchesDate = d >= periodBounds.start && d < periodBounds.end
      }
    }

    return matchesStatus && matchesDate
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
      setUploadError(`Превышает 50 МБ: ${oversized.map((f) => f.name).join(', ')}`)
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
    setUploadingId(taskId)
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
          setUploadingId(null)
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
          setUploadingId(null)
          return
        }
      }
      setPendingId(taskId)
      startTransition(async () => {
        try {
          await markInReview(taskId)
        } catch {
          setUploadError('Ошибка сети. Попробуйте ещё раз.')
        } finally {
          setUploadingId(null)
          setReviewingId(null)
          setSelectedFiles([])
          setPendingId(null)
        }
      })
    } catch {
      setUploadError('Ошибка сети. Попробуйте ещё раз.')
      setUploadingId(null)
    }
  }

  function handleToggleDone(task: Task) {
    setCheckPendingId(task.id)
    startCheckTransition(async () => {
      if (task.status === 'open') {
        await markDone(task.id)
      } else if (task.status === 'done') {
        await reopenTask(task.id)
      }
      setCheckPendingId(null)
    })
  }

  const emptyMessages: Record<Filter, string> = {
    open: 'Открытых задач нет — создайте первую выше',
    in_review: 'Нет задач на проверке',
    done: 'Выполненных задач пока нет',
    overdue: 'Просроченных задач нет',
  }

  const pillBase =
    'flex-1 min-w-max py-1.5 px-3 text-sm font-medium rounded-lg transition-all whitespace-nowrap'
  const pillActive = 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
  const pillInactive =
    'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
  const pillRow = 'flex gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl overflow-x-auto no-scrollbar'

  return (
    <div className="space-y-3">
      {/* Фильтр по дате */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-3 space-y-2">
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">
          Фильтр по дате
        </p>
        <div className={pillRow}>
          {DATE_FIELDS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setDateField(key)}
              className={`${pillBase} ${dateField === key ? pillActive : pillInactive}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={pillRow}>
          {DATE_PERIODS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setDatePeriod(key)}
              className={`${pillBase} ${datePeriod === key ? pillActive : pillInactive}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Вкладки статусов */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl overflow-x-auto no-scrollbar">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`${pillBase} py-2 ${filter === key ? pillActive : pillInactive}`}
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

      {/* Карточки задач */}
      {filtered.length === 0 ? (
        <div className="text-center py-14 text-slate-400 dark:text-slate-600 select-none">
          <div className="text-5xl mb-3">📋</div>
          <p className="text-base font-medium text-slate-500 dark:text-slate-400">
            {datePeriod !== 'all' ? 'Нет задач за выбранный период' : emptyMessages[filter]}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((task) => {
            const overdue = isOverdue(task, now)
            const isReviewing = reviewingId === task.id
            const isTaskUploading = uploadingId === task.id
            const loading = (isPending || isTaskUploading) && pendingId === task.id
            const isAdminOwnTask = isAdmin && task.assigned_to === userId
            const checkLoading = isCheckPending && checkPendingId === task.id

            return (
              <li
                key={task.id}
                className={`bg-white dark:bg-slate-900 rounded-2xl shadow-sm border transition-colors ${
                  overdue
                    ? 'border-red-200 dark:border-red-900'
                    : 'border-slate-100 dark:border-slate-800'
                }`}
              >
                <div className="p-3 space-y-2">
                  {/* Заголовок + бейдж (+ чекбокс только для задач admin'а, где он исполнитель) */}
                  <div className="flex items-start gap-3">
                    {isAdmin && task.assigned_to === userId && (task.status === 'open' || task.status === 'done') && (
                      <button
                        onClick={() => handleToggleDone(task)}
                        disabled={checkLoading}
                        className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full border-2 transition-all duration-200 flex items-center justify-center ${
                          task.status === 'done'
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-500'
                        } ${checkLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        aria-label={task.status === 'done' ? 'Снять отметку' : 'Отметить выполненным'}
                      >
                        {task.status === 'done' && (
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </button>
                    )}

                    <div className="flex flex-1 items-start justify-between gap-3 min-w-0">
                      <h3
                        className={`font-semibold leading-snug ${
                          isAdminOwnTask && task.status === 'done'
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {task.title}
                      </h3>
                      <StatusBadge status={task.status} />
                    </div>
                  </div>

                  {/* Описание */}
                  {task.description && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug">
                      {task.description}
                    </p>
                  )}

                  {/* Комментарий начальника */}
                  {task.task_comments && task.task_comments.length > 0 && (
                    <div className="bg-orange-50 dark:bg-orange-950/50 border border-orange-100 dark:border-orange-900 rounded-xl px-3 py-2 space-y-1">
                      <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wide">
                        Комментарий начальника
                      </p>
                      {task.task_comments.map((c) => (
                        <p
                          key={c.id}
                          className="text-xs text-orange-800 dark:text-orange-200 leading-snug"
                        >
                          &ldquo;{c.body}&rdquo;
                          <span className="ml-1.5 text-orange-400 dark:text-orange-500">
                            {formatDateTime(c.created_at)}
                          </span>
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Прикреплённые файлы (уже загруженные) */}
                  {task.task_files && task.task_files.length > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2 space-y-1">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        Прикреплённые файлы
                      </p>
                      <div className="space-y-0.5">
                        {task.task_files.map((f) => (
                          <div
                            key={f.id}
                            className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"
                          >
                            <span className="shrink-0">📎</span>
                            <span className="truncate">{f.file_name}</span>
                            {f.size != null && (
                              <span className="text-slate-400 shrink-0">
                                {formatBytes(f.size)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Участники команды (только у владельца) */}
                  {task.task_members && task.task_members.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {task.task_members.map((m) => {
                        const name = m.full_name ?? 'Участник'
                        const badge =
                          m.status === 'accepted'
                            ? {
                                label: `${name} — принял ✓`,
                                cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900',
                              }
                            : m.status === 'declined'
                              ? {
                                  label: `${name} — отклонил`,
                                  cls: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 border border-red-100 dark:border-red-900',
                                }
                              : {
                                  label: `${name} — ожидает`,
                                  cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700',
                                }
                        return (
                          <span
                            key={m.profile_id}
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                        )
                      })}
                    </div>
                  )}

                  {/* Нижняя строка: дедлайн + кнопка «Готово» */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
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

                    {/* Кнопка «Готово →» только для сотрудников */}
                    {!isAdmin && task.status === 'open' && !isReviewing && (
                      <button
                        onClick={() => openFileUpload(task.id)}
                        className="text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-5 py-2 rounded-xl transition-colors"
                      >
                        Готово →
                      </button>
                    )}
                  </div>

                  {/* Зона загрузки файлов (только для сотрудников) */}
                  {!isAdmin && task.status === 'open' && isReviewing && (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-3 bg-slate-50 dark:bg-slate-800/50">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Прикрепите файлы (необязательно) и отправьте на проверку
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                        className="hidden"
                        onChange={handleFilesChange}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isTaskUploading}
                        className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl px-3.5 py-2 transition-colors disabled:opacity-50"
                      >
                        <span>📎</span>
                        <span>Выбрать файлы (макс. 50 МБ)</span>
                      </button>
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
                                disabled={isTaskUploading}
                                className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 shrink-0 disabled:opacity-50"
                                aria-label="Удалить файл"
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {uploadError && (
                        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900 rounded-xl px-3 py-2">
                          {uploadError}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSubmitReview(task.id)}
                          disabled={isTaskUploading || loading}
                          className="flex-1 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white py-2.5 rounded-xl transition-colors"
                        >
                          {isTaskUploading || loading
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
                          disabled={isTaskUploading}
                          className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Временны́е метки */}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      Создано: {formatDateTime(task.created_at)}
                    </span>
                    {task.status === 'done' && task.completed_at && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        Выполнено: {formatDateTime(task.completed_at)}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

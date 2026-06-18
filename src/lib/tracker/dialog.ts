// Этап 13 — ИИ-диалог трекера (ветка «Нет»).
// Сотрудник свободным текстом объясняет, что помешало и когда закончит.
// ИИ ведёт короткую беседу, извлекает причину и обещанный срок.
// ТОЛЬКО сервер (через @/lib/llm, ключ не уходит в браузер).

import { chatCompletion, LlmError } from '@/lib/llm'
import { APP_TIME_ZONE } from '@/lib/datetime'
import {
  trackerDialogSystemPrompt,
  TRACKER_DIALOG_MAX_USER_TURNS,
} from '@/lib/tracker/messages'

/** Одна реплика диалога; храним в tracker_checkins.dialog.turns. */
export type DialogTurn = { role: 'assistant' | 'user'; content: string }

export type DialogOutcome = {
  /** Реплика, которую отправим сотруднику. */
  reply: string
  /** Диалог завершён (причина + срок собраны, либо достигнут лимит реплик). */
  done: boolean
  /** Извлечённая причина невыполнения (или null, пока неизвестна). */
  reason: string | null
  /** Обещанный срок в ISO (timestamptz-совместимо) или null. */
  promisedDate: string | null
}

const ALMATY_DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function almatyTodayLabel(): string {
  // ru-RU даёт DD.MM.YYYY — переставим в YYYY-MM-DD для однозначности модели.
  const parts = ALMATY_DATE_FMT.formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Безопасно превращает строку даты от ИИ в ISO timestamptz или null. */
function normalizePromisedDate(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const s = raw.trim()
  // Чистая дата YYYY-MM-DD → полдень по Алматы (чтобы не «уехать» в другой день при UTC).
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00+05:00` : s
  const d = new Date(dateOnly)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function parseOutcome(content: string): Omit<DialogOutcome, 'done'> & { done: boolean } | null {
  // Модель просили вернуть JSON; вырезаем на случай обрамляющего текста.
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  let obj: unknown
  try {
    obj = JSON.parse(content.slice(start, end + 1))
  } catch {
    return null
  }
  if (typeof obj !== 'object' || obj === null) return null
  const o = obj as Record<string, unknown>
  const reply = typeof o.reply === 'string' ? o.reply.trim() : ''
  if (!reply) return null
  return {
    reply,
    done: o.done === true,
    reason: typeof o.reason === 'string' && o.reason.trim() ? o.reason.trim() : null,
    promisedDate: normalizePromisedDate(o.promised_date),
  }
}

/**
 * Прогоняет один ход диалога. На вход — название задачи и вся история реплик
 * (включая только что добавленный ответ сотрудника). Возвращает реплику ИИ и
 * извлечённые причину/срок. Бросает LlmError при проблемах с LLM (вызывающий
 * решает, как фолбэчить).
 */
export async function runTrackerDialog(
  taskTitle: string,
  turns: DialogTurn[],
): Promise<DialogOutcome> {
  const system = trackerDialogSystemPrompt(taskTitle, almatyTodayLabel())

  const content = await chatCompletion(
    [
      { role: 'system', content: system },
      ...turns.map((t) => ({ role: t.role, content: t.content })),
    ],
    { temperature: 0.3, json: true },
  )

  const parsed = parseOutcome(content)
  if (!parsed) {
    // ИИ вернул мусор — не валим диалог, переспросим один раз.
    throw new LlmError('ИИ вернул неразборчивый ответ в диалоге трекера.', 502)
  }

  // Защита от бесконечного диалога: после лимита реплик сотрудника закрываем.
  const userTurns = turns.filter((t) => t.role === 'user').length
  const done = parsed.done || userTurns >= TRACKER_DIALOG_MAX_USER_TURNS

  return { reply: parsed.reply, done, reason: parsed.reason, promisedDate: parsed.promisedDate }
}

// Утренний нудж — разбор свободного ответа сотрудника в список задач через ИИ (Groq).
// ТОЛЬКО сервер (через @/lib/llm, ключ не уходит в браузер).

import { chatCompletion, LlmError } from '@/lib/llm'
import { getPeriodStart } from '@/lib/period'

const OFFSET_MS = 5 * 60 * 60 * 1000 // Asia/Almaty = UTC+5

/** Сегодняшняя дата в Алматы как YYYY-MM-DD. */
export function almatyTodayDate(nowMs: number = Date.now()): string {
  return new Date(nowMs + OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * Дедлайн «на сегодня по умолчанию» — конец текущего дня по Алматы (23:59),
 * ISO в UTC. Так задача считается сегодняшней и не становится просроченной сразу.
 */
export function todayDeadlineIso(nowMs: number = Date.now()): string {
  const dayStart = getPeriodStart('day', nowMs)
  return new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 60 * 1000).toISOString()
}

/** Защита от слишком длинных списков — за раз создаём не больше стольких задач. */
export const MORNING_MAX_TASKS = 12

const systemPrompt = (almatyToday: string): string =>
  'Ты — ассистент трекера задач школы Beta High School (Алматы). ' +
  'Сотрудник прислал сообщение о том, что планирует сделать сегодня. ' +
  'Извлеки из сообщения список конкретных задач. ' +
  'Каждая задача — короткое понятное название (3–8 слов) на русском, по возможности в повелительном наклонении. ' +
  'НЕ выдумывай задачи, которых нет в сообщении. Объединяй явные дубликаты. ' +
  'Если конкретных задач нет (приветствие, «ничего», «не знаю», болтовня) — верни пустой список. ' +
  `Сегодня (Алматы) ${almatyToday}. ` +
  'Отвечай СТРОГО в JSON без markdown: {"tasks": ["<название задачи>", ...]}.'

/** Достаёт массив названий задач из ответа модели. null — если разобрать не удалось. */
function parseTitles(content: string): string[] | null {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  let obj: unknown
  try {
    obj = JSON.parse(content.slice(start, end + 1))
  } catch {
    return null
  }
  const raw = (obj as { tasks?: unknown })?.tasks
  if (!Array.isArray(raw)) return null

  const seen = new Set<string>()
  const titles: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const title = item.trim().slice(0, 200)
    if (!title) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    titles.push(title)
    if (titles.length >= MORNING_MAX_TASKS) break
  }
  return titles
}

/**
 * Разбирает свободный текст сотрудника в список названий задач.
 * Пустой массив — задач не найдено (валидный исход).
 * Бросает LlmError при проблемах с LLM (лимит/ключ/таймаут) или неразборчивом ответе —
 * вызывающий решает, как фолбэчить.
 */
export async function parseMorningTasks(text: string, almatyToday: string): Promise<string[]> {
  const content = await chatCompletion(
    [
      { role: 'system', content: systemPrompt(almatyToday) },
      { role: 'user', content: text },
    ],
    { temperature: 0.2, json: true },
  )

  const titles = parseTitles(content)
  if (titles === null) {
    throw new LlmError('ИИ вернул неразборчивый ответ при разборе утренних задач.', 502)
  }
  return titles
}

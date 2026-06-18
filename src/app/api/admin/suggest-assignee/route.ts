import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { chatCompletion, LlmError } from '@/lib/llm'

export const runtime = 'nodejs'

type ProfileRow = {
  id: string
  full_name: string | null
  responsibilities: string | null
}

type TaskRow = {
  assigned_to: string | null
  status: string
  due_date: string | null
}

type Suggestion = {
  id: string
  full_name: string | null
  reason: string
}

const MAX_SUGGESTIONS = 5

/**
 * Безопасно достаёт массив подсказок из ответа модели.
 * Модель просили вернуть {"suggestions":[{"id","reason"}]}, но на всякий случай
 * вырезаем JSON между первой { и последней } и валидируем каждое поле.
 */
function parseSuggestions(
  raw: string,
  validIds: Set<string>,
): { id: string; reason: string }[] {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('no-json')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    throw new Error('bad-json')
  }

  const list = (parsed as { suggestions?: unknown })?.suggestions
  if (!Array.isArray(list)) {
    throw new Error('no-suggestions')
  }

  const seen = new Set<string>()
  const result: { id: string; reason: string }[] = []
  for (const item of list) {
    const id = (item as { id?: unknown })?.id
    const reason = (item as { reason?: unknown })?.reason
    if (typeof id !== 'string' || !validIds.has(id) || seen.has(id)) continue
    seen.add(id)
    result.push({
      id,
      reason: typeof reason === 'string' && reason.trim() ? reason.trim() : 'Подходит по профилю.',
    })
    if (result.length >= MAX_SUGGESTIONS) break
  }
  return result
}

export async function POST(request: NextRequest) {
  // --- Защита: только авторизованный admin ---
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })
  }

  // --- Входные данные ---
  let body: { title?: string; description?: string } = {}
  try {
    body = await request.json()
  } catch {
    // тело обязательно ниже
  }
  const title = (body.title ?? '').trim()
  const description = (body.description ?? '').trim()
  if (!title) {
    return NextResponse.json({ error: 'Укажите название задачи для подбора' }, { status: 400 })
  }

  // --- Кандидаты и их загрузка ---
  const admin = createAdminClient()
  const [{ data: profiles }, { data: tasks }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, responsibilities')
      .eq('is_active', true)
      .neq('id', user.id)
      .order('full_name', { ascending: true }),
    admin
      .from('tasks')
      .select('assigned_to, status, due_date')
      .in('status', ['open', 'in_review']),
  ])

  const candidates = (profiles ?? []) as ProfileRow[]
  if (candidates.length === 0) {
    return NextResponse.json(
      { error: 'Нет активных сотрудников для подбора' },
      { status: 400 },
    )
  }

  // Загрузка: открытые (open+in_review) и просроченные по каждому сотруднику
  const now = new Date()
  const load = new Map<string, { openCount: number; overdue: number }>()
  for (const t of (tasks ?? []) as TaskRow[]) {
    if (!t.assigned_to) continue
    let l = load.get(t.assigned_to)
    if (!l) {
      l = { openCount: 0, overdue: 0 }
      load.set(t.assigned_to, l)
    }
    l.openCount++
    if (t.due_date && new Date(t.due_date) < now) l.overdue++
  }

  const validIds = new Set(candidates.map((c) => c.id))

  // --- Промпт ---
  const candidateLines = candidates.map((c) => {
    const l = load.get(c.id) ?? { openCount: 0, overdue: 0 }
    const resp = c.responsibilities?.trim() || 'обязанности не указаны'
    return `id=${c.id} | ${c.full_name ?? 'Без имени'} | загрузка: открытых ${l.openCount}, просрочено ${l.overdue} | обязанности: ${resp}`
  })

  const systemPrompt =
    'Ты — ассистент начальника школы Beta High School (Алматы) по распределению задач между сотрудниками. ' +
    'Тебе дают описание задачи и список кандидатов с их зоной ответственности и текущей загрузкой. ' +
    'Подбери сотрудников, наиболее подходящих ПО СМЫСЛУ задачи (соответствие их обязанностям и навыкам). ' +
    'При прочих равных предпочитай менее загруженных (меньше открытых и особенно просроченных задач). ' +
    'Верни от 1 до 3 лучших кандидатов, лучший — первым. ' +
    'Используй ТОЛЬКО id из переданного списка, не выдумывай новых. ' +
    'Ответ — строго JSON одного объекта без пояснений и markdown в формате: ' +
    '{"suggestions":[{"id":"<id кандидата>","reason":"<краткое обоснование на русском, 1 предложение>"}]}'

  const userPrompt =
    `Задача:\nНазвание: ${title}\n` +
    (description ? `Описание: ${description}\n` : 'Описание: (не указано)\n') +
    `\nКандидаты (по одному в строке):\n${candidateLines.join('\n')}\n\n` +
    'Верни JSON с подходящими сотрудниками.'

  // --- Вызов LLM ---
  let raw: string
  try {
    raw = await chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.2, json: true },
    )
  } catch (e) {
    if (e instanceof LlmError) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 502 })
    }
    return NextResponse.json({ error: 'Не удалось выполнить подбор' }, { status: 500 })
  }

  // --- Разбор ответа ---
  let picks: { id: string; reason: string }[]
  try {
    picks = parseSuggestions(raw, validIds)
  } catch {
    return NextResponse.json(
      { error: 'ИИ вернул ответ в неожиданном формате. Попробуйте ещё раз.' },
      { status: 502 },
    )
  }

  if (picks.length === 0) {
    return NextResponse.json({
      suggestions: [],
      message: 'ИИ не нашёл явно подходящих сотрудников. Выберите вручную.',
    })
  }

  const byId = new Map(candidates.map((c) => [c.id, c]))
  const suggestions: Suggestion[] = picks.map((p) => {
    const c = byId.get(p.id)!
    return {
      id: p.id,
      full_name: c.full_name,
      reason: p.reason,
    }
  })

  return NextResponse.json({ suggestions })
}

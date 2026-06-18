import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { chatCompletion, LlmError } from '@/lib/llm'
import { formatDateTime } from '@/lib/datetime'

export const runtime = 'nodejs'

// ИИ-ассистент начальника: вопрос обычными словами → компактный срез данных → LLM.
// Срез намеренно ограничен незавершёнными задачами (open/in_review) и агрегатами,
// чтобы контекст не разрастался при сотнях сотрудников и задач.

type ProfileRow = { id: string; full_name: string | null }
type TaskRow = {
  title: string | null
  assigned_to: string | null
  status: string
  due_date: string | null
}

// Сколько незавершённых задач максимум перечислять построчно (счётчики — по всем).
const MAX_TASKS_LISTED = 150
const MAX_QUESTION_LEN = 500

const STATUS_LABEL: Record<string, string> = {
  open: 'открыта',
  in_review: 'на проверке',
}

// Текущая дата в поясе Алматы, напр. «четверг, 18 июня 2026 г.».
function almatyTodayLabel(): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Almaty',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
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
  let body: { question?: string } = {}
  try {
    body = await request.json()
  } catch {
    // тело проверяем ниже
  }
  const question = (body.question ?? '').trim()
  if (!question) {
    return NextResponse.json({ error: 'Задайте вопрос' }, { status: 400 })
  }
  if (question.length > MAX_QUESTION_LEN) {
    return NextResponse.json(
      { error: `Вопрос слишком длинный (максимум ${MAX_QUESTION_LEN} символов)` },
      { status: 400 },
    )
  }

  // --- Сбор компактного среза данных ---
  const admin = createAdminClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: profiles }, { data: openTasks }, { data: doneRows }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name', { ascending: true }),
    // только незавершённые задачи — счётчики open/in_review/overdue + сам список
    admin
      .from('tasks')
      .select('title, assigned_to, status, due_date')
      .in('status', ['open', 'in_review']),
    // выполнено за последние 30 дней — только для счётчика «выполнено»
    admin
      .from('tasks')
      .select('assigned_to')
      .eq('status', 'done')
      .gte('completed_at', thirtyDaysAgo),
  ])

  const employees = (profiles ?? []) as ProfileRow[]
  if (employees.length === 0) {
    return NextResponse.json(
      { error: 'Нет активных сотрудников — отвечать не на чем' },
      { status: 400 },
    )
  }

  const nameById = new Map(employees.map((e) => [e.id, e.full_name ?? 'Без имени']))
  const now = new Date()

  type Counters = { open: number; in_review: number; overdue: number; done30: number }
  const stats = new Map<string, Counters>()
  const ensure = (id: string) => {
    let s = stats.get(id)
    if (!s) {
      s = { open: 0, in_review: 0, overdue: 0, done30: 0 }
      stats.set(id, s)
    }
    return s
  }
  // гарантируем строку для каждого активного сотрудника (в т.ч. с 0 задач)
  for (const e of employees) ensure(e.id)

  const tasks = (openTasks ?? []) as TaskRow[]
  for (const t of tasks) {
    if (!t.assigned_to || !stats.has(t.assigned_to)) continue
    const s = ensure(t.assigned_to)
    if (t.status === 'in_review') s.in_review++
    else s.open++
    if (t.due_date && new Date(t.due_date) < now) s.overdue++
  }
  for (const r of (doneRows ?? []) as { assigned_to: string | null }[]) {
    if (r.assigned_to && stats.has(r.assigned_to)) ensure(r.assigned_to).done30++
  }

  // --- Строки сотрудников (счётчики по всем активным) ---
  const employeeLines = employees.map((e) => {
    const s = stats.get(e.id)!
    return `${nameById.get(e.id)}: открыто ${s.open}, на проверке ${s.in_review}, просрочено ${s.overdue}, выполнено за 30 дней ${s.done30}`
  })

  // --- Список незавершённых задач (просроченные и ближайшие — первыми) ---
  const sortedTasks = tasks
    .slice()
    .sort((a, b) => {
      const av = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY
      const bv = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY
      return av - bv
    })
  const shown = sortedTasks.slice(0, MAX_TASKS_LISTED)
  const taskLines = shown.map((t) => {
    const who = t.assigned_to ? nameById.get(t.assigned_to) ?? 'неизвестно' : 'не назначен'
    const statusLabel = STATUS_LABEL[t.status] ?? t.status
    const deadline = t.due_date ? formatDateTime(t.due_date) : 'без дедлайна'
    const overdue = t.due_date && new Date(t.due_date) < now ? ' [ПРОСРОЧЕНО]' : ''
    return `«${t.title ?? 'без названия'}» — исполнитель: ${who}, статус: ${statusLabel}, дедлайн: ${deadline}${overdue}`
  })
  const truncatedNote =
    sortedTasks.length > shown.length
      ? `\n(показаны ${shown.length} из ${sortedTasks.length} незавершённых задач; счётчики выше — по всем)`
      : ''

  // --- Промпт ---
  const systemPrompt =
    'Ты — ассистент начальника школы Beta High School (Алматы) по задачам и сотрудникам. ' +
    'Тебе дают текущий срез данных и вопрос. Отвечай кратко и по делу на русском языке, ' +
    'опираясь ТОЛЬКО на эти данные. Не выдумывай факты, которых нет в данных. ' +
    'Если данных для ответа недостаточно — честно скажи об этом. ' +
    'Где уместно, перечисляй сотрудников или задачи списком. ' +
    'Статусы: «открыта» и «на проверке» — незавершённые; «просрочено» — незавершённая задача с истёкшим дедлайном. ' +
    'Учитывай, что список задач может быть усечён, а счётчики по сотрудникам — полные.'

  const dataBlock =
    `Сегодня (Алматы): ${almatyTodayLabel()}\n\n` +
    `Активные сотрудники (счётчики незавершённых + выполнено за 30 дней):\n` +
    employeeLines.join('\n') +
    `\n\nТекущие незавершённые задачи:\n` +
    (taskLines.length ? taskLines.join('\n') : '(незавершённых задач нет)') +
    truncatedNote

  const userPrompt = `Данные:\n${dataBlock}\n\nВопрос начальника: ${question}`

  // --- Вызов LLM ---
  let answer: string
  try {
    answer = await chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.3 },
    )
  } catch (e) {
    if (e instanceof LlmError) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 502 })
    }
    return NextResponse.json({ error: 'Не удалось получить ответ ИИ' }, { status: 500 })
  }

  return NextResponse.json({ answer })
}

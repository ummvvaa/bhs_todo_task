// Сигналы риска «Требует внимания» — считаются ИЗ ДАННЫХ, без ИИ.
// Используется и серверным компонентом дашборда (для немедленного показа),
// и роутом /api/admin/attention (чтобы не доверять данным от клиента).
//
// Три сигнала:
//  1) сотрудники с несколькими просроченными задачами;
//  2) задачи в статусе 'open' с дедлайном в ближайшие 6 часов;
//  3) сотрудники, у кого доля просрочек заметно выше средней.

export type AttentionTask = {
  title: string | null
  assigned_to: string | null
  status: string
  due_date: string | null
}

export type AttentionProfile = {
  id: string
  full_name: string | null
}

export type MultiOverdue = { id: string; name: string; overdue: number }
export type DueSoon = { title: string; name: string; due_date: string }
export type HighRate = {
  id: string
  name: string
  overdue: number
  active: number
  rate: number // 0..1
}

export type AttentionSignals = {
  multiOverdue: MultiOverdue[]
  dueSoon: DueSoon[]
  highRate: HighRate[]
  hasSignals: boolean
}

// Пороги — намеренно консервативные, чтобы блок подсвечивал реальные риски.
const MULTI_OVERDUE_MIN = 2 // «несколько» просроченных
const DUE_SOON_HOURS = 6 // окно ближайших дедлайнов
const RATE_MIN_TASKS = 3 // у кого мало задач — долю не считаем (шум)
const RATE_FLOOR = 0.4 // доля просрочек должна быть значимой сама по себе
const RATE_ABOVE_AVG = 0.2 // и заметно выше средней по остальным

/**
 * Считает сигналы риска из активных профилей и незавершённых задач (open/in_review).
 * `now` можно передать для тестируемости; по умолчанию — текущий момент.
 */
export function computeAttentionSignals(
  profiles: AttentionProfile[],
  tasks: AttentionTask[],
  now: Date = new Date(),
): AttentionSignals {
  const nameById = new Map(profiles.map((p) => [p.id, p.full_name ?? 'Без имени']))

  type Counter = { active: number; overdue: number }
  const byEmp = new Map<string, Counter>()
  for (const p of profiles) byEmp.set(p.id, { active: 0, overdue: 0 })

  const nowMs = now.getTime()
  const soonCutoff = nowMs + DUE_SOON_HOURS * 60 * 60 * 1000

  const dueSoon: DueSoon[] = []

  for (const t of tasks) {
    const due = t.due_date ? new Date(t.due_date).getTime() : null
    const overdue = due !== null && due < nowMs

    if (t.assigned_to && byEmp.has(t.assigned_to)) {
      const c = byEmp.get(t.assigned_to)!
      c.active++
      if (overdue) c.overdue++
    }

    // Задачи open с дедлайном в ближайшие 6 ч (ещё не просроченные).
    if (t.status === 'open' && due !== null && due >= nowMs && due <= soonCutoff) {
      dueSoon.push({
        title: t.title ?? 'без названия',
        name: t.assigned_to ? nameById.get(t.assigned_to) ?? 'неизвестно' : 'не назначен',
        due_date: t.due_date!,
      })
    }
  }
  dueSoon.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())

  // 1) Несколько просроченных.
  const multiOverdue: MultiOverdue[] = []
  for (const [id, c] of byEmp) {
    if (c.overdue >= MULTI_OVERDUE_MIN) {
      multiOverdue.push({ id, name: nameById.get(id)!, overdue: c.overdue })
    }
  }
  multiOverdue.sort((a, b) => b.overdue - a.overdue)

  // 3) Доля просрочек заметно выше средней.
  // Средняя считается по сотрудникам с заметным числом задач, чтобы не было шума.
  const eligible = [...byEmp.entries()].filter(([, c]) => c.active >= RATE_MIN_TASKS)
  const highRate: HighRate[] = []
  if (eligible.length >= 2) {
    const avg =
      eligible.reduce((s, [, c]) => s + c.overdue / c.active, 0) / eligible.length
    for (const [id, c] of eligible) {
      const rate = c.overdue / c.active
      if (rate >= RATE_FLOOR && rate >= avg + RATE_ABOVE_AVG) {
        highRate.push({ id, name: nameById.get(id)!, overdue: c.overdue, active: c.active, rate })
      }
    }
    highRate.sort((a, b) => b.rate - a.rate)
  }

  const hasSignals =
    multiOverdue.length > 0 || dueSoon.length > 0 || highRate.length > 0

  return { multiOverdue, dueSoon, highRate, hasSignals }
}

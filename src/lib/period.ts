// Границы периодов (день/неделя/месяц) в UTC с учётом Asia/Almaty (UTC+5, без DST).
// Используется дашбордом и ИИ-отчётами, чтобы статистика считалась одинаково.

export type Period = 'day' | 'week' | 'month'

const OFFSET_MS = 5 * 60 * 60 * 1000 // Asia/Almaty = UTC+5

function almatyParts(ms: number) {
  const a = new Date(ms + OFFSET_MS)
  return {
    y: a.getUTCFullYear(),
    m: a.getUTCMonth(),
    d: a.getUTCDate(),
    wd: a.getUTCDay(), // 0 = воскресенье
  }
}

// Полночь указанной даты в Алматы → момент в UTC.
function almatyMidnightToUtc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d) - OFFSET_MS)
}

/** Начало текущего периода (UTC). */
export function getPeriodStart(period: Period, nowMs: number = Date.now()): Date {
  const { y, m, d, wd } = almatyParts(nowMs)
  if (period === 'day') return almatyMidnightToUtc(y, m, d)
  if (period === 'week') {
    const fromMon = wd === 0 ? 6 : wd - 1
    return almatyMidnightToUtc(y, m, d - fromMon)
  }
  return almatyMidnightToUtc(y, m, 1)
}

/** Начало предыдущего периода (UTC) — для сравнения трендов. */
export function getPreviousPeriodStart(period: Period, nowMs: number = Date.now()): Date {
  const start = getPeriodStart(period, nowMs)
  const { y, m, d } = almatyParts(start.getTime())
  if (period === 'day') return almatyMidnightToUtc(y, m, d - 1)
  if (period === 'week') return almatyMidnightToUtc(y, m, d - 7)
  return almatyMidnightToUtc(y, m - 1, 1)
}

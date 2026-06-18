'use client'

import { useState, useMemo } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'month' | 'week' | 'day'

export type Announcement = {
  id: string
  title: string
  description: string | null
  event_at: string
}

type AD = { year: number; month: number; day: number }

// ─── Date helpers (Almaty = UTC+5, no DST) ────────────────────────────────────

const TZ = 'Asia/Almaty'
const p2 = (n: number) => String(n).padStart(2, '0')

function toAD(d: Date): AD {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
  const [year, month, day] = s.split('-').map(Number)
  return { year, month, day }
}

const todayAD = (): AD => toAD(new Date())

const adKey = (d: AD) => `${d.year}-${p2(d.month)}-${p2(d.day)}`

const isoKey = (s: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(s))

const fmtTime = (s: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit',
  }).format(new Date(s))

const fmtFull = (s: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(s))

// UTC noon for an Almaty calendar date (noon Almaty = 07:00 UTC; same calendar day always)
const adToUTC = (d: AD) => new Date(Date.UTC(d.year, d.month - 1, d.day, 7, 0, 0))

// Monday-first DOW: 0=Mon … 6=Sun
const mondayDow = (d: AD) => (adToUTC(d).getUTCDay() + 6) % 7

const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate()

const addDays = (d: AD, n: number): AD =>
  toAD(new Date(adToUTC(d).getTime() + n * 86_400_000))

const addMonths = (d: AD, n: number): AD => {
  let { year, month, day } = d
  month += n
  while (month > 12) { month -= 12; year++ }
  while (month < 1)  { month += 12; year-- }
  return { year, month, day: Math.min(day, daysInMonth(year, month)) }
}

const weekStart = (d: AD): AD => addDays(d, -mondayDow(d))

const keyToAD = (k: string): AD => {
  const [y, m, dv] = k.split('-').map(Number)
  return { year: y, month: m, day: dv }
}

const fmtDayLabel = (d: AD, opts?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long',
    ...opts,
  }).format(adToUTC(d))

// ─── Locale constants ─────────────────────────────────────────────────────────

const MONTHS_NOM = [
  '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]
const MONTHS_GEN = [
  '', 'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]
const WDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

// ─── Month grid ───────────────────────────────────────────────────────────────

type Cell = { day: number; current: boolean; ad: AD }

function buildGrid(year: number, month: number): Cell[] {
  const offset = mondayDow({ year, month, day: 1 })
  const nDays = daysInMonth(year, month)
  const cells: Cell[] = []

  // Leading cells (prev month)
  const pm = month === 1 ? 12 : month - 1
  const py = month === 1 ? year - 1 : year
  const pd = daysInMonth(py, pm)
  for (let i = offset - 1; i >= 0; i--)
    cells.push({ day: pd - i, current: false, ad: { year: py, month: pm, day: pd - i } })

  // Current month
  for (let d = 1; d <= nDays; d++)
    cells.push({ day: d, current: true, ad: { year, month, day: d } })

  // Trailing cells (next month)
  const nm = month === 12 ? 1 : month + 1
  const ny = month === 12 ? year + 1 : year
  let nd = 1
  while (cells.length % 7 !== 0)
    cells.push({ day: nd, current: false, ad: { year: ny, month: nm, day: nd++ } })

  return cells
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconChevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      {dir === 'left'
        ? <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        : <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />}
    </svg>
  )
}

function IconX() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function IconCalSmall() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

// ─── Month view ───────────────────────────────────────────────────────────────

function MonthView({
  cursor, today, eventMap, selDay, onDayClick, onEventClick,
}: {
  cursor: AD
  today: AD
  eventMap: Map<string, Announcement[]>
  selDay: string | null
  onDayClick: (key: string) => void
  onEventClick: (e: Announcement) => void
}) {
  const grid = useMemo(() => buildGrid(cursor.year, cursor.month), [cursor.year, cursor.month])
  const todayKey = adKey(today)

  return (
    <div>
      {/* Weekday header row */}
      <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
        {WDAYS.map((w, i) => (
          <div
            key={w}
            className={`py-2.5 text-center text-[11px] sm:text-xs font-semibold tracking-wide uppercase ${
              i >= 5
                ? 'text-blue-400 dark:text-blue-500'
                : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* Grid cells */}
      <div className="grid grid-cols-7">
        {grid.map((cell, i) => {
          const key = adKey(cell.ad)
          const events = eventMap.get(key) ?? []
          const isToday = key === todayKey
          const isSel = key === selDay
          const isCurrent = cell.current
          const isWeekend = i % 7 >= 5

          return (
            <div
              key={i}
              onClick={() => onDayClick(key)}
              className={[
                'relative border-b border-r border-slate-100 dark:border-slate-800',
                'h-16 sm:h-[100px] p-1 sm:p-1.5 cursor-pointer',
                'transition-colors duration-100 select-none',
                isSel
                  ? 'bg-blue-50 dark:bg-blue-950/30'
                  : isWeekend && isCurrent
                    ? 'bg-slate-50/60 dark:bg-slate-900/60 hover:bg-slate-100/70 dark:hover:bg-slate-800/40'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/30',
                !isCurrent ? 'opacity-40' : '',
              ].join(' ')}
            >
              {/* Day number */}
              <div className={[
                'w-6 h-6 flex items-center justify-center text-xs font-semibold rounded-full',
                isToday
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isCurrent
                    ? isWeekend
                      ? 'text-blue-500 dark:text-blue-400'
                      : 'text-slate-800 dark:text-slate-100'
                    : 'text-slate-400 dark:text-slate-600',
              ].join(' ')}>
                {cell.day}
              </div>

              {/* Events */}
              {events.length > 0 && (
                <>
                  {/* Desktop: chips with titles */}
                  <div className="hidden sm:flex flex-col gap-0.5 mt-0.5">
                    {events.slice(0, 2).map(e => (
                      <button
                        key={e.id}
                        onClick={ev => { ev.stopPropagation(); onEventClick(e) }}
                        className="w-full text-left text-[11px] leading-tight bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-md px-1.5 py-0.5 truncate transition-colors"
                      >
                        <span className="font-semibold opacity-75">{fmtTime(e.event_at)}</span>
                        {' '}{e.title}
                      </button>
                    ))}
                    {events.length > 2 && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 pl-1 leading-none">
                        ещё {events.length - 2}
                      </span>
                    )}
                  </div>

                  {/* Mobile: colored dots */}
                  <div className="flex sm:hidden gap-0.5 mt-0.5 flex-wrap px-0.5">
                    {events.slice(0, 4).map((e, idx) => (
                      <div
                        key={e.id}
                        className={`w-1.5 h-1.5 rounded-full ${
                          idx === 0 ? 'bg-blue-600' :
                          idx === 1 ? 'bg-blue-400' :
                          idx === 2 ? 'bg-blue-300' : 'bg-slate-300'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Week view ────────────────────────────────────────────────────────────────

function WeekView({
  cursor, today, eventMap, onDayClick, onEventClick,
}: {
  cursor: AD
  today: AD
  eventMap: Map<string, Announcement[]>
  onDayClick: (d: AD) => void
  onEventClick: (e: Announcement) => void
}) {
  const ws = weekStart(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  const todayKey = adKey(today)

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[480px]">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
          {days.map((d, i) => {
            const key = adKey(d)
            const isToday = key === todayKey
            const isWeekend = i >= 5
            return (
              <button
                key={i}
                onClick={() => onDayClick(d)}
                className={[
                  'py-3 text-center transition-colors',
                  isToday
                    ? 'bg-blue-50 dark:bg-blue-950/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/30',
                ].join(' ')}
              >
                <div className={`text-[11px] font-semibold uppercase tracking-wide ${
                  isWeekend ? 'text-blue-400 dark:text-blue-500' : 'text-slate-400 dark:text-slate-500'
                }`}>
                  {WDAYS[i]}
                </div>
                <div className={[
                  'mx-auto mt-1 w-8 h-8 flex items-center justify-center text-sm font-bold rounded-full transition-all',
                  isToday
                    ? 'bg-blue-600 text-white shadow-sm'
                    : isWeekend
                      ? 'text-blue-500 dark:text-blue-400'
                      : 'text-slate-800 dark:text-slate-100',
                ].join(' ')}>
                  {d.day}
                </div>
              </button>
            )
          })}
        </div>

        {/* Event columns */}
        <div className="grid grid-cols-7 min-h-[180px]">
          {days.map((d, i) => {
            const key = adKey(d)
            const events = eventMap.get(key) ?? []
            const isToday = key === todayKey
            return (
              <div
                key={i}
                className={[
                  'p-1.5 border-r border-slate-100 dark:border-slate-800 last:border-r-0',
                  isToday ? 'bg-blue-50/30 dark:bg-blue-950/10' : '',
                ].join(' ')}
              >
                {events.length === 0 ? (
                  <div className="h-full flex items-start justify-center pt-6 text-slate-200 dark:text-slate-700 text-xs select-none">—</div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {events.map(e => (
                      <button
                        key={e.id}
                        onClick={() => onEventClick(e)}
                        className="w-full text-left bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg px-2 py-1.5 transition-colors"
                      >
                        <div className="text-[10px] font-semibold opacity-75 leading-none">{fmtTime(e.event_at)}</div>
                        <div className="text-xs font-medium leading-snug mt-0.5 line-clamp-2">{e.title}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Day view ─────────────────────────────────────────────────────────────────

function DayView({
  cursor, today, eventMap, onEventClick,
}: {
  cursor: AD
  today: AD
  eventMap: Map<string, Announcement[]>
  onEventClick: (e: Announcement) => void
}) {
  const key = adKey(cursor)
  const events = eventMap.get(key) ?? []
  const isToday = key === adKey(today)

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-5 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className={`w-2 h-2 rounded-full shrink-0 ${isToday ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`} />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 capitalize">
          {fmtDayLabel(cursor)}
        </span>
        {isToday && (
          <span className="text-xs bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
            сегодня
          </span>
        )}
      </div>

      {events.length === 0 ? (
        <div className="text-center py-14">
          <div className="text-4xl mb-3 select-none">📅</div>
          <p className="text-sm text-slate-400 dark:text-slate-500">Нет событий на этот день</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(e => (
            <button
              key={e.id}
              onClick={() => onEventClick(e)}
              className="w-full text-left flex items-start gap-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 active:bg-blue-50 dark:active:bg-blue-950/30 transition-all shadow-sm"
            >
              <div className="shrink-0 text-center min-w-[3rem]">
                <div className="text-base font-bold text-blue-600 dark:text-blue-400 leading-tight tabular-nums">
                  {fmtTime(e.event_at)}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                  {e.title}
                </h3>
                {e.description && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {e.description}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-slate-300 dark:text-slate-600 mt-0.5">
                <IconChevron dir="right" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Selected day events panel ────────────────────────────────────────────────

function SelDayPanel({
  dayKey, events, onEventClick,
}: {
  dayKey: string
  events: Announcement[]
  onEventClick: (e: Announcement) => void
}) {
  const d = keyToAD(dayKey)
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
        <IconCalSmall />
        <span className="text-sm font-semibold text-slate-800 dark:text-white capitalize">
          {fmtDayLabel(d)}
        </span>
      </div>
      {events.length === 0 ? (
        <div className="px-4 py-5 text-sm text-slate-400 dark:text-slate-500">Нет событий</div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {events.map(e => (
            <button
              key={e.id}
              onClick={() => onEventClick(e)}
              className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-blue-50/60 dark:hover:bg-blue-950/20 active:bg-blue-50 transition-colors"
            >
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-0.5 tabular-nums shrink-0 w-10">
                {fmtTime(e.event_at)}
              </span>
              <span className="text-sm font-medium text-slate-900 dark:text-white leading-snug flex-1 min-w-0">
                {e.title}
              </span>
              <span className="shrink-0 text-slate-300 dark:text-slate-600 mt-0.5">
                <IconChevron dir="right" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Event detail modal ───────────────────────────────────────────────────────

function EventModal({ event, onClose }: { event: Announcement; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-5 sm:p-6"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Закрыть"
        >
          <IconX />
        </button>

        {/* Time badge */}
        <div className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
          <IconCalSmall />
          <span>{fmtFull(event.event_at)}</span>
        </div>

        <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-snug pr-6">
          {event.title}
        </h2>

        {event.description && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
            {event.description}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Main CalendarView ────────────────────────────────────────────────────────

export default function CalendarView({ announcements }: { announcements: Announcement[] }) {
  const [view, setView] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState<AD>(() => todayAD())
  const [selDay, setSelDay] = useState<string | null>(null)
  const [selEvent, setSelEvent] = useState<Announcement | null>(null)

  const today = useMemo(() => todayAD(), [])

  // Map: 'YYYY-MM-DD' → sorted announcements
  const eventMap = useMemo(() => {
    const m = new Map<string, Announcement[]>()
    for (const a of announcements) {
      const k = isoKey(a.event_at)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(a)
    }
    for (const evts of m.values()) evts.sort((a, b) => a.event_at.localeCompare(b.event_at))
    return m
  }, [announcements])

  const navigate = (dir: -1 | 1) => {
    setSelDay(null)
    if (view === 'month') setCursor(c => addMonths(c, dir))
    else if (view === 'week') setCursor(c => addDays(c, dir * 7))
    else setCursor(c => addDays(c, dir))
  }

  const goToday = () => {
    const t = todayAD()
    setCursor(t)
    setSelDay(adKey(t))
  }

  const switchView = (v: ViewMode) => {
    setView(v)
    setSelDay(null)
  }

  const openEvent = (e: Announcement) => setSelEvent(e)

  // Header label
  const headerLabel = useMemo(() => {
    if (view === 'month') return `${MONTHS_NOM[cursor.month]} ${cursor.year}`
    if (view === 'week') {
      const ws = weekStart(cursor)
      const we = addDays(ws, 6)
      if (ws.month === we.month)
        return `${ws.day}–${we.day} ${MONTHS_GEN[ws.month]} ${ws.year}`
      if (ws.year === we.year)
        return `${ws.day} ${MONTHS_GEN[ws.month]} – ${we.day} ${MONTHS_GEN[we.month]} ${ws.year}`
      return `${ws.day} ${MONTHS_GEN[ws.month]} ${ws.year} – ${we.day} ${MONTHS_GEN[we.month]} ${we.year}`
    }
    // day view: "среда, 18 июня"
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long',
    }).format(adToUTC(cursor))
  }, [view, cursor])

  const selDayEvents = selDay ? (eventMap.get(selDay) ?? []) : []

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Календарь</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {announcements.length > 0
            ? `${announcements.length} ${announcements.length === 1 ? 'событие' : announcements.length < 5 ? 'события' : 'событий'}`
            : 'Расписание событий'}
        </p>
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* View switcher (pill) */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          {(['month', 'week', 'day'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => switchView(v)}
              className={[
                'px-3 sm:px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all',
                view === v
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
              ].join(' ')}
            >
              {v === 'month' ? 'Месяц' : v === 'week' ? 'Неделя' : 'День'}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Назад"
          >
            <IconChevron dir="left" />
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Сегодня
          </button>
          <button
            onClick={() => navigate(1)}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Вперёд"
          >
            <IconChevron dir="right" />
          </button>
        </div>

        {/* Period label */}
        <span className="text-base font-bold text-slate-900 dark:text-white capitalize">
          {headerLabel}
        </span>
      </div>

      {/* Calendar card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        {view === 'month' && (
          <MonthView
            cursor={cursor}
            today={today}
            eventMap={eventMap}
            selDay={selDay}
            onDayClick={k => setSelDay(prev => prev === k ? null : k)}
            onEventClick={openEvent}
          />
        )}
        {view === 'week' && (
          <WeekView
            cursor={cursor}
            today={today}
            eventMap={eventMap}
            onDayClick={d => { switchView('day'); setCursor(d) }}
            onEventClick={openEvent}
          />
        )}
        {view === 'day' && (
          <DayView
            cursor={cursor}
            today={today}
            eventMap={eventMap}
            onEventClick={openEvent}
          />
        )}
      </div>

      {/* Selected day panel (month view) */}
      {view === 'month' && selDay && (
        <SelDayPanel
          dayKey={selDay}
          events={selDayEvents}
          onEventClick={openEvent}
        />
      )}

      {/* Event detail modal */}
      {selEvent && (
        <EventModal event={selEvent} onClose={() => setSelEvent(null)} />
      )}
    </div>
  )
}

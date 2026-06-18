'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type NavItem = {
  href: string
  label: string
  icon: 'dashboard' | 'review' | 'employees' | 'tasks' | 'ai' | 'mytasks' | 'telegram' | 'announcements' | 'calendar' | 'team'
  badge?: number
  exact?: boolean
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconDashboard() {
  return (
    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1.5" strokeLinejoin="round" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" strokeLinejoin="round" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" strokeLinejoin="round" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function IconReview() {
  return (
    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function IconEmployees() {
  return (
    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function IconTasks() {
  return (
    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  )
}

function IconAI() {
  return (
    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  )
}

function IconTelegram() {
  return (
    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.5 4.5L2.5 11.8c-.7.27-.68 1.27.03 1.5l4.7 1.55 1.8 5.4c.2.6.97.77 1.4.3l2.5-2.7 4.6 3.4c.5.37 1.2.1 1.34-.5l3.1-14.6c.16-.73-.56-1.34-1.27-1.05z" />
    </svg>
  )
}

function IconAnnouncements() {
  return (
    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
    </svg>
  )
}

function IconTeam() {
  return (
    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function IconMenu() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function IconX() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

const ICON_MAP: Record<NavItem['icon'], () => React.JSX.Element> = {
  dashboard: IconDashboard,
  review: IconReview,
  employees: IconEmployees,
  tasks: IconTasks,
  ai: IconAI,
  mytasks: IconTasks,
  telegram: IconTelegram,
  announcements: IconAnnouncements,
  calendar: IconCalendar,
  team: IconTeam,
}

// ─── Sidebar nav list ──────────────────────────────────────────────────────────

function NavList({
  items,
  pathname,
  onItemClick,
}: {
  items: NavItem[]
  pathname: string
  onItemClick?: () => void
}) {
  return (
    <nav className="px-2 py-3 space-y-0.5 flex-1">
      {items.map((item, idx) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        const Icon = ICON_MAP[item.icon]
        return (
          <Link
            key={idx}
            href={item.href}
            onClick={onItemClick}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              active
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
            }`}
          >
            <span className="shrink-0"><Icon /></span>
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge != null && item.badge > 0 && (
              <span className="bg-amber-400 text-slate-900 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center leading-tight">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

// ─── Sidebar content (shared between desktop + drawer) ────────────────────────

function SidebarContent({
  items,
  pathname,
  userName,
  signOutAction,
  onNavClick,
}: {
  items: NavItem[]
  pathname: string
  userName?: string | null
  signOutAction: () => Promise<void>
  onNavClick?: () => void
}) {
  const initials = userName
    ? userName.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800 shrink-0">
        <div className="text-white font-bold text-sm leading-tight tracking-tight">Beta High School</div>
        <div className="text-slate-500 text-xs mt-0.5 tracking-wide">Система задач</div>
      </div>

      <NavList items={items} pathname={pathname} onItemClick={onNavClick} />

      {/* User footer */}
      <div className="shrink-0 border-t border-slate-800 px-3 pb-3 pt-2">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-slate-200 text-xs font-bold shrink-0 select-none">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-200 truncate leading-tight">
              {userName ?? 'Пользователь'}
            </div>
          </div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full text-left px-2 py-1.5 text-xs text-slate-500 hover:text-slate-300 rounded-md hover:bg-slate-800 transition-colors"
          >
            Выйти из системы
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export default function AppShell({
  children,
  navItems,
  userName,
  signOutAction,
  reviewCount,
}: {
  children: React.ReactNode
  navItems: NavItem[]
  userName?: string | null
  signOutAction: () => Promise<void>
  reviewCount?: number
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex flex-col w-56 xl:w-60 bg-slate-900 shrink-0 sticky top-0 h-screen overflow-y-auto no-scrollbar">
        <SidebarContent
          items={navItems}
          pathname={pathname}
          userName={userName}
          signOutAction={signOutAction}
        />
      </aside>

      {/* ── Mobile drawer overlay ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-slate-900 shadow-2xl flex flex-col">
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors z-10"
            >
              <IconX />
            </button>
            <SidebarContent
              items={navItems}
              pathname={pathname}
              userName={userName}
              signOutAction={signOutAction}
              onNavClick={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top header */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800">
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
            aria-label="Открыть меню"
          >
            <IconMenu />
          </button>
          <span className="text-white font-semibold text-sm flex-1">Beta High School</span>
          {reviewCount != null && reviewCount > 0 && (
            <span className="bg-amber-400 text-slate-900 text-xs font-bold px-2 py-0.5 rounded-full">
              {reviewCount}
            </span>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-5xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

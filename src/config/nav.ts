import type { NavItem } from '@/components/AppShell'

export const ADMIN_NAV = (reviewCount: number): NavItem[] => [
  { href: '/admin/dashboard', label: 'Дашборд', icon: 'dashboard' },
  { href: '/admin/review', label: 'Проверка', icon: 'review', badge: reviewCount, exact: true },
  { href: '/admin', label: 'Сотрудники', icon: 'employees', exact: true },
  { href: '/team', label: 'Команда', icon: 'team', exact: true },
  { href: '/admin/announcements', label: 'Объявления', icon: 'announcements', exact: true },
  { href: '/calendar', label: 'Календарь', icon: 'calendar', exact: true },
  { href: '/tasks', label: 'Задачи', icon: 'tasks', exact: true },
  { href: '/admin/assistant', label: 'ИИ-ассистент', icon: 'ai', exact: true },
]

export const STAFF_NAV: NavItem[] = [
  { href: '/tasks', label: 'Мои задачи', icon: 'mytasks', exact: true },
  { href: '/team', label: 'Команда', icon: 'team', exact: true },
  { href: '/calendar', label: 'Календарь', icon: 'calendar', exact: true },
  { href: '/tasks/settings', label: 'Telegram', icon: 'telegram', exact: true },
]

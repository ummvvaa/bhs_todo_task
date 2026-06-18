import { createAdminClient } from '@/lib/supabase/admin'
import { formatDateTime } from '@/lib/datetime'
import AnnouncementForm, { type StaffOption } from './announcement-form'
import AnnouncementList, { type AnnouncementItem } from './announcement-list'

export default async function AnnouncementsPage() {
  const admin = createAdminClient()

  // Активные сотрудники — кандидаты в получатели.
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .eq('is_active', true)
    .order('full_name', { ascending: true })

  // Будущие объявления (event_at >= сейчас), ближайшие первыми.
  const { data: announcements } = await admin
    .from('announcements')
    .select('id, title, description, event_at, audience')
    .gte('event_at', new Date().toISOString())
    .order('event_at', { ascending: true })

  const staff = (profiles ?? []) as StaffOption[]
  const items = ((announcements ?? []) as AnnouncementItem[]).map((a) => ({
    ...a,
    event_at_label: formatDateTime(a.event_at),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Объявления
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Анонсы событий с напоминанием в Telegram за час до начала
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-5">
        <AnnouncementForm staff={staff} />
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
          Ближайшие объявления
        </h2>
        <AnnouncementList items={items} />
      </section>
    </div>
  )
}

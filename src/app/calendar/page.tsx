import { createClient } from '@/lib/supabase/server'
import CalendarView, { type Announcement } from './calendar-view'

export default async function CalendarPage() {
  const supabase = await createClient()

  // RLS фильтрует автоматически: admin видит все, staff — только свои (audience='all' или в получателях)
  const { data } = await supabase
    .from('announcements')
    .select('id, title, description, event_at')
    .order('event_at', { ascending: true })

  return <CalendarView announcements={(data ?? []) as Announcement[]} />
}

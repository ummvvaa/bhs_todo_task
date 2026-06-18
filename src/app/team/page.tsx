import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import TeamBoard from './team-board'

export default async function TeamPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profiles }, { data: tasks }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name'),
    supabase
      .from('tasks')
      .select('id, title, status, assigned_to, completed_at'),
  ])

  return <TeamBoard profiles={profiles ?? []} tasks={tasks ?? []} />
}

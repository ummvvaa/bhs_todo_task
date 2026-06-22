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

  const [{ data: profiles }, { data: tasks }, { data: acceptedMembers }] =
    await Promise.all([
      admin
        .from('profiles')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name'),
      supabase
        .from('tasks')
        .select('id, title, status, assigned_to, completed_at'),
      // Принятые участники команд — задача засчитывается и им (счётчик «акт.» + список).
      admin
        .from('task_members')
        .select('task_id, profile_id')
        .eq('status', 'accepted'),
    ])

  return (
    <TeamBoard
      profiles={profiles ?? []}
      tasks={tasks ?? []}
      members={acceptedMembers ?? []}
    />
  )
}

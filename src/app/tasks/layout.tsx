import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import AppShell from '@/components/AppShell'
import { signOut } from '@/app/actions'
import { ADMIN_NAV, STAFF_NAV } from '@/config/nav'

export default async function TasksLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') {
    const admin = createAdminClient()
    const { count: reviewCount } = await admin
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'in_review')

    return (
      <AppShell
        navItems={ADMIN_NAV(reviewCount ?? 0)}
        userName={profile.full_name}
        signOutAction={signOut}
        reviewCount={reviewCount ?? 0}
      >
        {children}
      </AppShell>
    )
  }

  return (
    <AppShell
      navItems={STAFF_NAV}
      userName={profile?.full_name}
      signOutAction={signOut}
    >
      {children}
    </AppShell>
  )
}

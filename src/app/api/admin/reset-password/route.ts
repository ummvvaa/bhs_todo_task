import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/**
 * POST /api/admin/reset-password
 * Устанавливает новый пароль через Admin API.
 * Только для администратора. Пароль задаётся администратором (мин. 6 символов).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (callerProfile?.role !== 'admin')
    return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const { userId, newPassword } = await request.json()
  if (!userId) return NextResponse.json({ error: 'userId обязателен' }, { status: 400 })
  if (!newPassword || newPassword.length < 6)
    return NextResponse.json({ error: 'Пароль должен содержать минимум 6 символов' }, { status: 400 })

  const admin = createAdminClient()

  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

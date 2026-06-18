import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/**
 * POST /api/admin/employees
 * Создаёт нового сотрудника через Supabase Admin API.
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

  const body = await request.json()
  const { full_name, email, role, responsibilities, password } = body

  if (!full_name?.trim()) return NextResponse.json({ error: 'Имя обязательно' }, { status: 400 })
  if (!email?.trim()) return NextResponse.json({ error: 'Email обязателен' }, { status: 400 })
  if (!['admin', 'staff'].includes(role))
    return NextResponse.json({ error: 'Роль должна быть admin или staff' }, { status: 400 })
  if (!password || password.length < 6)
    return NextResponse.json({ error: 'Пароль должен содержать минимум 6 символов' }, { status: 400 })

  const admin = createAdminClient()

  const { data, error } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name.trim(), is_active: true },
  })

  if (error) {
    const already = error.status === 422 || /already|exist|registered/i.test(error.message)
    return NextResponse.json(
      { error: already ? 'Пользователь с таким email уже существует' : error.message },
      { status: already ? 409 : 500 }
    )
  }

  const newUserId = data.user?.id
  if (!newUserId) return NextResponse.json({ error: 'Аккаунт не создан' }, { status: 500 })

  // Триггер handle_new_user уже создал строку в profiles — дозаполняем поля
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      full_name: full_name.trim(),
      role,
      responsibilities: responsibilities?.trim() || null,
    })
    .eq('id', newUserId)

  if (profileError) {
    return NextResponse.json(
      { error: `Аккаунт создан, но профиль не обновлён: ${profileError.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    id: newUserId,
    email: email.trim().toLowerCase(),
    full_name: full_name.trim(),
  })
}

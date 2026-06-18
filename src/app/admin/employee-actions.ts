'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type ActionResult = { error?: string; success?: boolean }

async function getAdminUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, error: 'Не авторизован' as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return { user: null, error: 'Доступ запрещён' as const }
  return { user, error: null }
}

/**
 * Обновляет поле responsibilities (зона ответственности) сотрудника.
 * Доступно только админу; пишет через service_role (обходит RLS).
 */
export async function updateResponsibilities(
  id: string,
  responsibilities: string,
): Promise<ActionResult> {
  const { user, error: authError } = await getAdminUser()
  if (!user) return { error: authError ?? 'Не авторизован' }
  if (!id) return { error: 'Не указан сотрудник' }

  const value = responsibilities.trim() || null

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ responsibilities: value })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin')
  return { success: true }
}

/**
 * Редактирует основные поля профиля сотрудника (имя, роль, отдел, обязанности).
 */
export async function updateEmployee(
  id: string,
  data: {
    full_name: string
    role: string
    responsibilities: string | null
  },
): Promise<ActionResult> {
  const { user, error: authError } = await getAdminUser()
  if (!user) return { error: authError ?? 'Не авторизован' }
  if (!id) return { error: 'Не указан сотрудник' }
  if (!data.full_name?.trim()) return { error: 'Имя обязательно' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({
      full_name: data.full_name.trim(),
      role: data.role,
      responsibilities: data.responsibilities?.trim() || null,
    })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin')
  return { success: true }
}

/**
 * Деактивирует или активирует сотрудника.
 * Деактивированный не может войти в систему.
 * Нельзя деактивировать себя.
 */
export async function toggleEmployee(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const { user, error: authError } = await getAdminUser()
  if (!user) return { error: authError ?? 'Не авторизован' }
  if (!id) return { error: 'Не указан сотрудник' }
  if (id === user.id) return { error: 'Нельзя деактивировать собственный аккаунт' }

  const admin = createAdminClient()

  const { error: profileError } = await admin
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', id)
  if (profileError) return { error: profileError.message }

  // Записываем is_active в user_metadata — middleware проверяет его без лишнего DB-запроса
  const { error: authUpdateError } = await admin.auth.admin.updateUserById(id, {
    user_metadata: { is_active: isActive },
  })
  if (authUpdateError) return { error: authUpdateError.message }

  revalidatePath('/admin')
  return { success: true }
}

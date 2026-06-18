'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type ActionResult = { error?: string; success?: boolean } | null

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return null
  return user
}

/**
 * datetime-local ("YYYY-MM-DDTHH:mm") трактуем во времени Алматы (UTC+5, без DST)
 * и переводим в UTC ISO для timestamptz. Возвращает null при некорректном вводе.
 */
function almatyLocalToUtcIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const iso = new Date(`${y}-${mo}-${d}T${h}:${mi}:00+05:00`)
  if (Number.isNaN(iso.getTime())) return null
  return iso.toISOString()
}

export async function createAnnouncement(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireAdmin()
  if (!user) return { error: 'Нет доступа' }

  const title = (formData.get('title') as string)?.trim()
  const description = (formData.get('description') as string)?.trim() || null
  const eventAtRaw = (formData.get('event_at') as string) || ''
  const audience = (formData.get('audience') as string) === 'selected' ? 'selected' : 'all'
  const recipientIds = (formData.getAll('recipient') as string[]).filter(Boolean)

  if (!title) return { error: 'Название обязательно' }

  const eventAt = almatyLocalToUtcIso(eventAtRaw)
  if (!eventAt) return { error: 'Укажите дату и время события' }

  if (audience === 'selected' && recipientIds.length === 0) {
    return { error: 'Выберите получателей или адресуйте всем' }
  }

  const admin = createAdminClient()

  const { data: created, error } = await admin
    .from('announcements')
    .insert({
      title,
      description,
      event_at: eventAt,
      audience,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  if (audience === 'selected') {
    const rows = recipientIds.map((profileId) => ({
      announcement_id: created.id,
      profile_id: profileId,
    }))
    const { error: recErr } = await admin.from('announcement_recipients').insert(rows)
    if (recErr) {
      // Откатываем объявление, чтобы не осталось без получателей.
      await admin.from('announcements').delete().eq('id', created.id)
      return { error: recErr.message }
    }
  }

  revalidatePath('/admin/announcements')
  return { success: true }
}

export async function deleteAnnouncement(id: string): Promise<ActionResult> {
  const user = await requireAdmin()
  if (!user) return { error: 'Нет доступа' }

  const admin = createAdminClient()
  const { error } = await admin.from('announcements').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/announcements')
  return { success: true }
}

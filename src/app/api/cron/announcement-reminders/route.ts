import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegram } from '@/lib/telegram'
import { formatDateTime } from '@/lib/datetime'

export const runtime = 'nodejs'

// Напоминания за час до события. Дёргается cron-ом каждые 15 минут (pg_cron через pg_net),
// см. supabase/migrations/016_announcements.sql. Защищён общим секретом CRON_SECRET.
//
// Логика: объявления, у которых reminder_sent=false И событие наступит в ближайший час,
// рассылаем получателям с привязанным Telegram, затем помечаем reminder_sent=true
// (идемпотентно: при повторном прогоне такие уже не выберутся).

type Announcement = {
  id: string
  title: string
  description: string | null
  event_at: string
  audience: string
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET не настроен' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const admin = createAdminClient()

  const now = new Date()
  const horizon = new Date(now.getTime() + 60 * 60 * 1000)

  const { data: anns, error } = await admin
    .from('announcements')
    .select('id, title, description, event_at, audience')
    .eq('reminder_sent', false)
    .gt('event_at', now.toISOString())
    .lte('event_at', horizon.toISOString())

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const list = (anns ?? []) as Announcement[]
  if (list.length === 0) {
    return NextResponse.json({ sent: 0, announcements: 0 })
  }

  let sent = 0

  for (const a of list) {
    const chatIds = await recipientChatIds(admin, a)

    const text =
      `🔔 Напоминание: ${a.title} — ${formatDateTime(a.event_at)}` +
      (a.description ? `\n\n${a.description}` : '')

    const results = await Promise.allSettled(chatIds.map((chatId) => sendTelegram(chatId, text)))
    sent += results.filter((r) => r.status === 'fulfilled' && r.value === true).length

    // Помечаем разосланным независимо от результата отправки (best-effort),
    // чтобы при следующем прогоне не дублировать напоминания.
    await admin.from('announcements').update({ reminder_sent: true }).eq('id', a.id)
  }

  return NextResponse.json({ sent, announcements: list.length })
}

/** chat_id получателей объявления (с непустым telegram_chat_id). */
async function recipientChatIds(
  admin: ReturnType<typeof createAdminClient>,
  a: Announcement,
): Promise<string[]> {
  if (a.audience === 'all') {
    const { data } = await admin
      .from('profiles')
      .select('telegram_chat_id')
      .eq('is_active', true)
      .not('telegram_chat_id', 'is', null)
    return (data ?? []).map((p) => p.telegram_chat_id as string).filter(Boolean)
  }

  // audience='selected' — профили из announcement_recipients.
  const { data: recs } = await admin
    .from('announcement_recipients')
    .select('profile_id')
    .eq('announcement_id', a.id)

  const ids = (recs ?? []).map((r) => r.profile_id as string)
  if (ids.length === 0) return []

  const { data: profiles } = await admin
    .from('profiles')
    .select('telegram_chat_id')
    .in('id', ids)
    .not('telegram_chat_id', 'is', null)

  return (profiles ?? []).map((p) => p.telegram_chat_id as string).filter(Boolean)
}

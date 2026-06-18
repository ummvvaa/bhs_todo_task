import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegram } from '@/lib/telegram'
import { formatDateTime } from '@/lib/datetime'

export const runtime = 'nodejs'

// Напоминания о дедлайнах. Дёргается ночным cron (pg_cron через pg_net),
// см. supabase/migrations/009_telegram.sql. Защищён общим секретом CRON_SECRET.
//
// Логика: активные задачи (open/in_review) с дедлайном на ближайшие 24 часа,
// у исполнителя которых привязан Telegram → шлём напоминание.

type ReminderTask = {
  title: string
  due_date: string
  assigned_to: string | null
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET не настроен' }, { status: 500 })
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const admin = createAdminClient()

  const now = new Date()
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const { data: tasks, error } = await admin
    .from('tasks')
    .select('title, due_date, assigned_to')
    .in('status', ['open', 'in_review'])
    .not('due_date', 'is', null)
    .gte('due_date', now.toISOString())
    .lte('due_date', horizon.toISOString())

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const list = (tasks ?? []) as ReminderTask[]
  if (list.length === 0) {
    return NextResponse.json({ sent: 0, candidates: 0 })
  }

  // Подтягиваем chat_id исполнителей одним запросом.
  const assigneeIds = [...new Set(list.map((t) => t.assigned_to).filter(Boolean) as string[])]
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, telegram_chat_id')
    .in('id', assigneeIds)
    .not('telegram_chat_id', 'is', null)

  const chatById = new Map<string, string>()
  for (const p of profiles ?? []) {
    if (p.telegram_chat_id) chatById.set(p.id, p.telegram_chat_id as string)
  }

  const results = await Promise.allSettled(
    list
      .filter((t) => t.assigned_to && chatById.has(t.assigned_to))
      .map((t) =>
        sendTelegram(
          chatById.get(t.assigned_to as string) as string,
          `Напоминание о дедлайне: задача «${t.title}» — срок ${formatDateTime(t.due_date)}.`,
        ),
      ),
  )

  const sent = results.filter((r) => r.status === 'fulfilled' && r.value === true).length
  return NextResponse.json({ sent, candidates: list.length })
}

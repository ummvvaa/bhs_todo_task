import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegram } from '@/lib/telegram'
import { formatDateTime } from '@/lib/datetime'
import { getPeriodStart } from '@/lib/period'
import { almatyTodayDate } from '@/lib/morning/parse'
import { morningMessages } from '@/lib/morning/messages'

export const runtime = 'nodejs'

// Утренний нудж. Дёргается утренним cron (pg_cron через pg_net),
// см. supabase/migrations/012_morning_nudge.sql. Защищён общим секретом CRON_SECRET.
//
// Логика: каждому активному сотруднику с привязанным Telegram шлём «Доброе утро!
// Ваши задачи на сегодня: …» (список задач open/in_review с дедлайном сегодня по
// Алматы) и приглашаем дописать задачи ответом. Если задач нет — короткое сообщение
// без списка. Idempotent: повторный прогон за тот же день не дублирует (morning_nudges).

type TodayTask = {
  title: string
  due_date: string
  assigned_to: string | null
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

  // Активные сотрудники с привязанным Telegram — им и шлём.
  const { data: profiles, error: profErr } = await admin
    .from('profiles')
    .select('id, full_name, telegram_chat_id')
    .eq('is_active', true)
    .not('telegram_chat_id', 'is', null)

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 })
  }

  const recipients = (profiles ?? []).filter((p) => p.telegram_chat_id)
  if (recipients.length === 0) {
    return NextResponse.json({ sent: 0, recipients: 0 })
  }

  // Задачи на сегодня (по Алматы) для этих сотрудников.
  const ids = recipients.map((p) => p.id)
  const dayStart = getPeriodStart('day')
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

  const { data: tasks, error: taskErr } = await admin
    .from('tasks')
    .select('title, due_date, assigned_to')
    .in('status', ['open', 'in_review'])
    .in('assigned_to', ids)
    .not('due_date', 'is', null)
    .gte('due_date', dayStart.toISOString())
    .lt('due_date', dayEnd.toISOString())

  if (taskErr) {
    return NextResponse.json({ error: taskErr.message }, { status: 500 })
  }

  // Группируем задачи по исполнителю, сортируем по дедлайну.
  const tasksByEmployee = new Map<string, TodayTask[]>()
  for (const t of (tasks ?? []) as TodayTask[]) {
    if (!t.assigned_to) continue
    const arr = tasksByEmployee.get(t.assigned_to) ?? []
    arr.push(t)
    tasksByEmployee.set(t.assigned_to, arr)
  }
  for (const arr of tasksByEmployee.values()) {
    arr.sort((a, b) => a.due_date.localeCompare(b.due_date))
  }

  // Idempotent-вставка: уже существующие (profile_id, nudge_date) пропускаются,
  // .select() вернёт только НОВЫЕ строки — им и шлём утреннее сообщение.
  const nudgeDate = almatyTodayDate()
  const { data: created, error: insErr } = await admin
    .from('morning_nudges')
    .upsert(
      recipients.map((p) => ({ profile_id: p.id, nudge_date: nudgeDate })),
      { onConflict: 'profile_id,nudge_date', ignoreDuplicates: true },
    )
    .select('profile_id')

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  const newProfileIds = new Set((created ?? []).map((r) => r.profile_id as string))
  const recipientById = new Map(recipients.map((p) => [p.id, p]))

  const results = await Promise.allSettled(
    [...newProfileIds].map((profileId) => {
      const profile = recipientById.get(profileId)
      if (!profile?.telegram_chat_id) return Promise.resolve(false)

      const name = profile.full_name?.split(' ')[0] ?? ''
      const todays = tasksByEmployee.get(profileId) ?? []

      const text =
        todays.length === 0
          ? morningMessages.greetingNoTasks(name)
          : morningMessages.greetingWithTasks(
              name,
              todays.map((t) => morningMessages.taskLine(t.title, formatDateTime(t.due_date))).join('\n'),
            )

      return sendTelegram(profile.telegram_chat_id as string, text)
    }),
  )

  const sent = results.filter((r) => r.status === 'fulfilled' && r.value === true).length
  return NextResponse.json({ sent, recipients: recipients.length, new_nudges: newProfileIds.size })
}

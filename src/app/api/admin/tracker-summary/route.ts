import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { chatCompletion, LlmError } from '@/lib/llm'
import { formatDateTime } from '@/lib/datetime'

export const runtime = 'nodejs'

// Этап 13 — ИИ-сводка вечернего трекера за день.
// Берёт чек-ины за указанную дату (по умолчанию сегодня по Алматы) и формирует
// через LLM короткую сводку для начальника.

type CheckinRow = {
  reported_status: 'done' | 'not_done' | null
  reason: string | null
  promised_date: string | null
  profiles: { full_name: string | null } | null
  tasks: { title: string | null } | null
}

function almatyTodayDate(): string {
  return new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export async function POST(request: NextRequest) {
  // --- Защита: только авторизованный admin ---
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })
  }

  let body: { date?: string } = {}
  try {
    body = await request.json()
  } catch {
    // тело необязательно
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '') ? (body.date as string) : almatyTodayDate()

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('tracker_checkins')
    .select('reported_status, reason, promised_date, profiles(full_name), tasks(title)')
    .eq('check_date', date)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const checkins = (rows ?? []) as unknown as CheckinRow[]
  if (checkins.length === 0) {
    return NextResponse.json({
      summary: `За ${date} вечерний трекер не зафиксировал ни одного вопроса. Возможно, на этот день не было задач с дедлайном или сотрудники не привязали Telegram.`,
      date,
    })
  }

  // Сборка структурированного текста.
  const done = checkins.filter((c) => c.reported_status === 'done').length
  const notDone = checkins.filter((c) => c.reported_status === 'not_done').length
  const noAnswer = checkins.filter((c) => !c.reported_status).length
  const lines: string[] = [
    `Дата: ${date}.`,
    `Итого: выполнили ${done}, не выполнили ${notDone}, без ответа ${noAnswer}.`,
    '',
  ]
  for (const c of checkins) {
    const name = c.profiles?.full_name ?? 'Без имени'
    const title = c.tasks?.title ?? 'задача'
    if (c.reported_status === 'done') {
      lines.push(`- ${name}: «${title}» — выполнено.`)
    } else if (c.reported_status === 'not_done') {
      const reason = c.reason ? ` Причина: ${c.reason}.` : ' Причина не указана.'
      const promise = c.promised_date ? ` Обещает к ${formatDateTime(c.promised_date)}.` : ''
      lines.push(`- ${name}: «${title}» — НЕ выполнено.${reason}${promise}`)
    } else {
      lines.push(`- ${name}: «${title}» — не ответил(а).`)
    }
  }

  const statsBlock = lines.join('\n')

  const systemPrompt =
    'Ты — ассистент начальника школы Beta High School (Алматы). ' +
    'По итогам вечернего трекера ты делаешь короткую управленческую сводку на русском языке. ' +
    'Без воды и markdown-таблиц. Структура: ' +
    '1) Итог дня одним-двумя предложениями (сколько выполнили / не выполнили). ' +
    '2) Кто не выполнил — с причинами и обещанными сроками. ' +
    '3) На что обратить внимание начальнику (1–3 пункта). ' +
    'Не выдумывай данные, которых нет.'

  const userPrompt = `Данные вечернего трекера:\n\n${statsBlock}\n\nСоставь сводку по описанной структуре.`

  try {
    const summary = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ])
    return NextResponse.json({ summary, date })
  } catch (e) {
    if (e instanceof LlmError) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 502 })
    }
    return NextResponse.json({ error: 'Не удалось сформировать сводку' }, { status: 500 })
  }
}

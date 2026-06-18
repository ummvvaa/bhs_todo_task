import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateLinkCode } from '@/lib/telegram'
import LinkCodeBox from './link-code-box'
import ChangePasswordForm from './change-password-form'

// Настройки сотрудника: привязка Telegram для уведомлений.
// Показывает персональный код привязки и инструкцию /start <код>.

async function getOrCreateLinkCode(userId: string, existing: string | null): Promise<string> {
  if (existing) return existing
  const admin = createAdminClient()
  // Несколько попыток на случай коллизии уникального индекса.
  for (let i = 0; i < 5; i++) {
    const code = generateLinkCode()
    const { error } = await admin
      .from('profiles')
      .update({ telegram_link_code: code })
      .eq('id', userId)
      .is('telegram_link_code', null)
    if (!error) {
      // Перечитываем — на случай, если параллельный запрос уже проставил код.
      const { data } = await admin
        .from('profiles')
        .select('telegram_link_code')
        .eq('id', userId)
        .single()
      if (data?.telegram_link_code) return data.telegram_link_code
    }
  }
  // Крайний случай: возвращаем то, что есть в БД.
  const { data } = await admin
    .from('profiles')
    .select('telegram_link_code')
    .eq('id', userId)
    .single()
  return data?.telegram_link_code ?? generateLinkCode()
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('telegram_chat_id, telegram_link_code')
    .eq('id', user.id)
    .single()

  const linked = !!profile?.telegram_chat_id
  const code = await getOrCreateLinkCode(user.id, profile?.telegram_link_code ?? null)

  const botUsername =
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.replace(/^@/, '') || null
  const startCommand = `/start ${code}`

  const userEmail = user.email ?? ''

  return (
    <div className="space-y-6 max-w-2xl">
      <ChangePasswordForm email={userEmail} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Уведомления в Telegram
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Привяжите Telegram, чтобы получать уведомления о новых задачах и дедлайнах.
        </p>
      </div>

      {linked ? (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/40 p-5">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            ✓ Telegram привязан
          </p>
          <p className="text-sm text-emerald-700/80 dark:text-emerald-300/80 mt-1">
            Уведомления о назначенных задачах и напоминания о дедлайнах приходят в ваш чат с ботом.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Как привязать
            </p>
            <ol className="mt-2 space-y-1.5 text-sm text-slate-600 dark:text-slate-300 list-decimal list-inside">
              <li>
                Откройте бота{' '}
                {botUsername ? (
                  <span className="font-medium text-slate-900 dark:text-white">@{botUsername}</span>
                ) : (
                  <span className="font-medium text-slate-900 dark:text-white">
                    нашего уведомлений (имя узнайте у администратора)
                  </span>
                )}{' '}
                в Telegram.
              </li>
              <li>
                Отправьте ему команду <span className="font-mono">/start</span> с вашим персональным кодом
                (см. ниже).
              </li>
              <li>Бот ответит «привязка успешна» — готово.</li>
            </ol>
          </div>

          <LinkCodeBox code={code} startCommand={startCommand} botUsername={botUsername} />

          <p className="text-xs text-slate-400 dark:text-slate-500">
            Код персональный — не передавайте его другим. После привязки обновите эту страницу.
          </p>
        </div>
      )}
    </div>
  )
}

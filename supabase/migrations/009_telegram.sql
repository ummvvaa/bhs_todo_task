-- Этап 12: Telegram-уведомления и привязка аккаунтов.
-- Выполнить в Supabase SQL Editor.
--
-- 1) Поля привязки в profiles:
--    * telegram_chat_id    — chat_id из Telegram, куда слать уведомления (после /start <код>).
--    * telegram_link_code  — персональный код привязки, уникальный.
-- 2) (опц.) Ночной cron, который вызывает наш эндпоинт напоминаний о дедлайнах
--    через pg_net (см. блок ниже — настраивается ПОСЛЕ деплоя).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_chat_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_link_code text;

-- Код привязки уникален (один код = один сотрудник). NULL допускается у многих строк.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_telegram_link_code_key
  ON profiles (telegram_link_code)
  WHERE telegram_link_code IS NOT NULL;

COMMENT ON COLUMN profiles.telegram_chat_id IS
  'chat_id Telegram сотрудника. Заполняется webhook-ом при /start <код>. Пусто = уведомления не идут.';
COMMENT ON COLUMN profiles.telegram_link_code IS
  'Персональный одноразовый код привязки Telegram. Показывается сотруднику в настройках.';

-- ---------------------------------------------------------------------------
-- Напоминания о дедлайнах в существующем ночном cron.
-- ---------------------------------------------------------------------------
-- Токен бота (TELEGRAM_BOT_TOKEN) живёт ТОЛЬКО в приложении, не в БД. Поэтому
-- pg_cron не шлёт в Telegram напрямую, а ДЁРГАЕТ наш серверный эндпоинт
-- POST /api/cron/telegram-reminders, который сам собирает задачи с дедлайном
-- на ближайшие 24ч и рассылает уведомления через Bot API.
--
-- Это требует:
--   * расширения pg_net (Supabase: Dashboard → Database → Extensions → pg_net);
--   * публичного URL приложения (после деплоя на Vercel);
--   * секрета CRON_SECRET (тот же, что в .env.local приложения).
--
-- НАСТРОИТЬ ПОСЛЕ ДЕПЛОЯ: подставьте свой домен и CRON_SECRET, затем выполните.

 create extension if not exists pg_net;

 select cron.unschedule('telegram-deadline-reminders')
 where exists (select 1 from cron.job where jobname = 'telegram-deadline-reminders');

 select cron.schedule(
   'telegram-deadline-reminders',
   '0 22 * * *',                              -- 22:00 UTC = 03:00 Asia/Almaty (как nightly-task-maintenance)
   $$
     select net.http_post(
       url     := 'https://ВАШ-ДОМЕН.vercel.app/api/cron/telegram-reminders',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ВАШ_CRON_SECRET'
       ),
       body    := '{}'::jsonb
     );
   $$
 );

 Проверка: select * from cron.job where jobname = 'telegram-deadline-reminders';

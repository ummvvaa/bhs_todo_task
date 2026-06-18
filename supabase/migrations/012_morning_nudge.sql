-- Утренний нудж: бот по утрам шлёт сотруднику его задачи на сегодня и
-- предлагает дописать новые задачи ответом. Выполнить в Supabase SQL Editor.
--
-- Таблица morning_nudges — по одной записи на (сотрудник, дата нуджа).
--  * idempotency утреннего cron (повторный прогон за тот же день не дублирует сообщения);
--  * признак для webhook: «этому сотруднику сегодня прислали утренний нудж» →
--    его свободный текстовый ответ за сегодня разбираем в задачи.

CREATE TABLE IF NOT EXISTS morning_nudges (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nudge_date  date        NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Almaty')::date,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Один нудж на сотрудника в день (idempotent-рассылка утреннего cron).
CREATE UNIQUE INDEX IF NOT EXISTS morning_nudges_profile_date_key
  ON morning_nudges (profile_id, nudge_date);

ALTER TABLE morning_nudges ENABLE ROW LEVEL SECURITY;

-- Читать: причастный сотрудник либо admin. (Запись идёт через service_role, он RLS обходит.)
CREATE POLICY "morning_nudges_select" ON morning_nudges
  FOR SELECT USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

COMMENT ON TABLE morning_nudges IS
  'Утренний нудж: факт отправки утреннего сообщения сотруднику за дату (идемпотентность cron + гейт для разбора ответа в задачи).';

-- ---------------------------------------------------------------------------
-- Утренний cron: рассылка «Доброе утро! Ваши задачи на сегодня…».
-- ---------------------------------------------------------------------------
-- Как и остальные рассылки (009/010), pg_cron не ходит в Telegram напрямую
-- (токен живёт только в приложении), а ДЁРГАЕТ эндпоинт POST /api/cron/morning-nudge.
-- Эндпоинт сам собирает задачи на сегодня и рассылает сообщения.
--
-- Требует: pg_net, публичного URL приложения (после деплоя) и CRON_SECRET (как в .env).
--
-- НАСТРОИТЬ ПОСЛЕ ДЕПЛОЯ: подставьте домен и CRON_SECRET, затем выполните.
--
-- create extension if not exists pg_net;
--
-- select cron.unschedule('morning-nudge')
-- where exists (select 1 from cron.job where jobname = 'morning-nudge');
--
-- select cron.schedule(
--   'morning-nudge',
--   '0 3 * * *',                               -- 03:00 UTC = 08:00 Asia/Almaty (утро)
--   $$
--     select net.http_post(
--       url     := 'https://ВАШ-ДОМЕН.vercel.app/api/cron/morning-nudge',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ВАШ_CRON_SECRET'
--       ),
--       body    := '{}'::jsonb
--     );
--   $$
-- );
--
-- Проверка: select * from cron.job where jobname = 'morning-nudge';

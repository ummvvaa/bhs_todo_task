-- Этап 13: вечерний трекер выполнения задач через Telegram.
-- Таблица tracker_checkins — по одной записи на (задача, дата проверки).
-- Создаётся вечерним cron-ом, заполняется ответами сотрудника в Telegram.
-- Выполнить в Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS tracker_checkins (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  profile_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  check_date      date        NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Almaty')::date,
  -- 'done' = сотрудник нажал «Да», 'not_done' = «Нет», NULL = ещё не ответил.
  reported_status text        CHECK (reported_status IN ('done', 'not_done')),
  -- Причина невыполнения (разбирает ИИ из свободного ответа).
  reason          text,
  -- Обещанный срок завершения (ИИ извлекает из ответа сотрудника).
  promised_date   timestamptz,
  -- Состояние короткого ИИ-диалога: { state, turns: [{role, content}], ... }.
  dialog          jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Одна проверка на задачу в день (idempotent-рассылка вечернего cron).
CREATE UNIQUE INDEX IF NOT EXISTS tracker_checkins_task_date_key
  ON tracker_checkins (task_id, check_date);

-- Быстрый поиск активного диалога по сотруднику (webhook привязывает свободный
-- ответ к нужной задаче по последнему незакрытому чек-ину).
CREATE INDEX IF NOT EXISTS tracker_checkins_profile_idx
  ON tracker_checkins (profile_id, created_at DESC);

ALTER TABLE tracker_checkins ENABLE ROW LEVEL SECURITY;

-- Читать: причастный сотрудник (его чек-ин) либо admin.
-- (запись идёт через service_role — он RLS обходит; политики — для чтения из UI.)
CREATE POLICY "tracker_checkins_select" ON tracker_checkins
  FOR SELECT USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

COMMENT ON TABLE tracker_checkins IS
  'Вечерний трекер: ответы сотрудников «выполнил/не выполнил» по задачам с дедлайном на сегодня (Этап 13).';

-- ---------------------------------------------------------------------------
-- Вечерний cron: рассылка вопросов по задачам с дедлайном на сегодня.
-- ---------------------------------------------------------------------------
-- Как и напоминания (009), pg_cron не ходит в Telegram напрямую (токен живёт
-- только в приложении), а ДЁРГАЕТ серверный эндпоинт POST /api/cron/evening-tracker.
-- Эндпоинт сам собирает задачи, создаёт чек-ины и шлёт сообщения с кнопками Да/Нет.
--
-- Требует: pg_net, публичного URL приложения (после деплоя) и CRON_SECRET (как в .env).
--
-- НАСТРОИТЬ ПОСЛЕ ДЕПЛОЯ: подставьте домен и CRON_SECRET, затем выполните.
--
-- create extension if not exists pg_net;
--
-- select cron.unschedule('evening-tracker')
-- where exists (select 1 from cron.job where jobname = 'evening-tracker');
--
-- select cron.schedule(
--   'evening-tracker',
--   '0 14 * * *',                              -- 14:00 UTC = 19:00 Asia/Almaty (вечер)
--   $$
--     select net.http_post(
--       url     := 'https://ВАШ-ДОМЕН.vercel.app/api/cron/evening-tracker',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ВАШ_CRON_SECRET'
--       ),
--       body    := '{}'::jsonb
--     );
--   $$
-- );
--
-- Проверка: select * from cron.job where jobname = 'evening-tracker';

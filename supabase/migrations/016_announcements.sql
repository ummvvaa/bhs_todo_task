-- Этап 15 — объявления (анонсы событий). Выполнить в Supabase SQL Editor.
--
-- announcements — событие/объявление с датой и временем.
--  * audience='all'      — адресовано всем активным сотрудникам;
--  * audience='selected' — адресовано выбранным (см. announcement_recipients).
-- announcement_recipients — получатели при audience='selected' (только тогда используется).
--
-- Напоминание за час до события рассылает cron-эндпоинт /api/cron/announcement-reminders
-- (блок настройки pg_cron — в конце файла, настраивается ПОСЛЕ деплоя).
--
-- Миграция ИДЕМПОТЕНТНА (DROP POLICY IF EXISTS → CREATE).

-- ============================================================================
-- 1. Таблицы
-- ============================================================================
CREATE TABLE IF NOT EXISTS announcements (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text        NOT NULL,
  description   text,
  event_at      timestamptz NOT NULL,
  audience      text        NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'selected')),
  reminder_sent boolean     NOT NULL DEFAULT false,
  created_by    uuid        REFERENCES profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS announcement_recipients (
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  profile_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (announcement_id, profile_id)
);

-- Индексы: выборка ближайших событий и сканирование cron-ом (ещё не разосланные).
CREATE INDEX IF NOT EXISTS announcements_event_at_idx
  ON announcements (event_at);
CREATE INDEX IF NOT EXISTS announcements_reminder_idx
  ON announcements (reminder_sent, event_at);

-- ============================================================================
-- 2. RLS
-- ============================================================================
-- Используется security-definer функция public.is_admin() из миграции 015
-- (без рекурсии на profiles). Запись/рассылка идёт через service_role (RLS обходит).
ALTER TABLE announcements           ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_recipients ENABLE ROW LEVEL SECURITY;

-- ── announcements ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "announcements_select" ON announcements;
DROP POLICY IF EXISTS "announcements_insert" ON announcements;
DROP POLICY IF EXISTS "announcements_update" ON announcements;
DROP POLICY IF EXISTS "announcements_delete" ON announcements;

-- Читать: admin (все), либо адресовано всем, либо ты в списке получателей.
CREATE POLICY "announcements_select" ON announcements
  FOR SELECT
  USING (
    public.is_admin()
    OR audience = 'all'
    OR EXISTS (
      SELECT 1 FROM announcement_recipients r
      WHERE r.announcement_id = announcements.id
        AND r.profile_id = auth.uid()
    )
  );

-- Создавать/менять/удалять — только admin.
CREATE POLICY "announcements_insert" ON announcements
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "announcements_update" ON announcements
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "announcements_delete" ON announcements
  FOR DELETE USING (public.is_admin());

-- ── announcement_recipients ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "announcement_recipients_select" ON announcement_recipients;
DROP POLICY IF EXISTS "announcement_recipients_insert" ON announcement_recipients;
DROP POLICY IF EXISTS "announcement_recipients_update" ON announcement_recipients;
DROP POLICY IF EXISTS "announcement_recipients_delete" ON announcement_recipients;

-- Читать: своя строка (адресовано тебе) либо admin.
CREATE POLICY "announcement_recipients_select" ON announcement_recipients
  FOR SELECT
  USING (profile_id = auth.uid() OR public.is_admin());

-- Создавать/менять/удалять — только admin.
CREATE POLICY "announcement_recipients_insert" ON announcement_recipients
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "announcement_recipients_update" ON announcement_recipients
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "announcement_recipients_delete" ON announcement_recipients
  FOR DELETE USING (public.is_admin());

COMMENT ON TABLE announcements IS
  'Объявления/анонсы событий (дата + получатели). Напоминание за час рассылает cron /api/cron/announcement-reminders.';

-- ---------------------------------------------------------------------------
-- Cron: напоминания за час до события (КАЖДЫЕ 15 МИНУТ).
-- ---------------------------------------------------------------------------
-- Как и остальные рассылки (009/012), pg_cron не ходит в Telegram напрямую
-- (токен живёт только в приложении), а ДЁРГАЕТ эндпоинт
-- POST /api/cron/announcement-reminders. Эндпоинт сам находит объявления, до
-- которых осталось ≤ 1 часа и которые ещё не разосланы, шлёт получателям и
-- помечает reminder_sent=true (идемпотентно).
--
-- Запуск каждые 15 минут даёт окно: событие попадёт в рассылку за 45–60 минут
-- до начала (а не ровно за час) — этого достаточно для напоминания.
--
-- Требует: pg_net, публичного URL приложения (после деплоя) и CRON_SECRET (как в .env).
--
-- НАСТРОИТЬ ПОСЛЕ ДЕПЛОЯ: подставьте домен и CRON_SECRET, затем выполните.
--
-- create extension if not exists pg_net;
--
-- select cron.unschedule('announcement-reminders')
-- where exists (select 1 from cron.job where jobname = 'announcement-reminders');
--
-- select cron.schedule(
--   'announcement-reminders',
--   '*/15 * * * *',                            -- каждые 15 минут
--   $$
--     select net.http_post(
--       url     := 'https://ВАШ-ДОМЕН.vercel.app/api/cron/announcement-reminders',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ВАШ_CRON_SECRET'
--       ),
--       body    := '{}'::jsonb
--     );
--   $$
-- );
--
-- Проверка: select * from cron.job where jobname = 'announcement-reminders';

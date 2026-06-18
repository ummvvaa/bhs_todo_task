-- Этап 17: открыть видимость задач для доски команды.
-- Любой авторизованный сотрудник может ЧИТАТЬ все задачи (нужно для будущей доски).
-- Экран «Мои задачи» (/tasks) по-прежнему показывает только свои задачи —
-- за счёт запросного фильтра .or(assigned_to.eq, created_by.eq) в коде, а не RLS.
--
-- Что НЕ меняется:
--   * INSERT / UPDATE / DELETE политики остаются как в 015 (только свои / admin).
--   * task_comments, task_files, tracker_checkins, morning_nudges, profiles,
--     announcements — не трогаем.
--
-- Идемпотентна: DROP IF EXISTS → CREATE — повторный прогон безопасен.

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Удаляем старую ограничивающую политику чтения (имя из 015).
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;

-- Новая политика: любой авторизованный сотрудник читает все задачи.
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT
  TO authenticated
  USING (true);

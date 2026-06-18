-- Этап 19 — командная фича (бэкенд): приглашения участников к задаче через Telegram.
-- Выполнить в Supabase SQL Editor (целиком, идемпотентно — повторный прогон безопасен).
--
-- Модель: владелец задачи (assigned_to / created_by) приглашает других сотрудников
-- в «команду» по задаче. Приглашённый отвечает в Telegram (Принять / Отклонить):
--   * status='accepted' → участник ВИДИТ задачу (но НЕ может её закрывать/менять — это право владельца);
--   * status='pending' | 'declined' → задача участнику не показывается (фильтр на уровне запроса в UI).
--
-- Запись статусов (ответ из Telegram) идёт через service_role в вебхуке —
-- service_role RLS ОБХОДИТ, поэтому update-политика ниже рассчитана на владельца/admin из UI.
--
-- ВАЖНО: миграция НЕ трогает политику чтения tasks (tasks_select).
-- В 017 эта политика уже расширена до `TO authenticated USING (true)` (любой авторизованный
-- читает все задачи — нужно для доски команды, Этап 18). Это покрывает и принятых участников,
-- поэтому отдельное условие OR EXISTS(task_members …) не требуется. Возврат к ограниченной
-- политике сломал бы доску команды, поэтому tasks_select оставлен как есть.
-- Приватность «pending/declined не видит задачу» обеспечивается фильтром запроса в UI (Этап 20),
-- как это уже сделано на /tasks (.or(assigned_to, created_by)).

-- ============================================================================
-- 1. Таблица task_members
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.task_members (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      uuid        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  profile_id   uuid        NOT NULL REFERENCES public.profiles(id),
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'accepted', 'declined')),
  invited_by   uuid        REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (task_id, profile_id)
);

-- Индекс под выборку «мои приглашения / мои командные задачи» по статусу.
CREATE INDEX IF NOT EXISTS task_members_profile_status_idx
  ON public.task_members (profile_id, status);

-- ============================================================================
-- 2. RLS
-- ============================================================================
ALTER TABLE public.task_members ENABLE ROW LEVEL SECURITY;

-- Читать: сам участник, владелец задачи (исполнитель/автор) или admin.
DROP POLICY IF EXISTS "task_members_select" ON public.task_members;
CREATE POLICY "task_members_select" ON public.task_members
  FOR SELECT
  USING (
    profile_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
  );

-- Приглашать (INSERT): только владелец задачи или admin.
DROP POLICY IF EXISTS "task_members_insert" ON public.task_members;
CREATE POLICY "task_members_insert" ON public.task_members
  FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
  );

-- Менять (UPDATE): только владелец задачи или admin.
-- (Ответ участника Принять/Отклонить идёт через service_role в вебхуке — RLS не мешает.)
DROP POLICY IF EXISTS "task_members_update" ON public.task_members;
CREATE POLICY "task_members_update" ON public.task_members
  FOR UPDATE
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
  );

-- Удалять (DELETE): только владелец задачи или admin.
DROP POLICY IF EXISTS "task_members_delete" ON public.task_members;
CREATE POLICY "task_members_delete" ON public.task_members
  FOR DELETE
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
  );

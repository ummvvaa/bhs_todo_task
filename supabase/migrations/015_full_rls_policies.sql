-- Этап: ПОЛНЫЕ политики безопасности (RLS) под текущую схему.
-- Выполнить в Supabase SQL Editor (целиком, идемпотентно — повторный прогон безопасен).
--
-- Принципы:
--  * staff (и manager — пока трактуется как staff, отделов нет) видит/меняет ТОЛЬКО своё;
--  * admin видит/меняет всё;
--  * проверка роли — через security-definer функцию is_admin() (без рекурсии на profiles);
--  * запись «системных» данных (создание сотрудников, рассылки, приёмка, signed-URL)
--    идёт через service_role, который RLS ОБХОДИТ — эти политики его не касаются.
--
-- ВАЖНО: эта миграция пересоздаёт политики идемпотентно (DROP IF EXISTS → CREATE),
-- поэтому заменяет ранее заданные политики на profiles/tasks/task_comments/task_files/
-- tracker_checkins/morning_nudges и на бакете storage task-files.

-- ============================================================================
-- 1. is_admin() — security definer, без рекурсии
-- ============================================================================
-- SECURITY DEFINER => тело функции выполняется с правами владельца и НЕ применяет
-- RLS к запросу profiles внутри себя. Поэтому функцию можно безопасно вызывать
-- из политики НА profiles — бесконечной рекурсии не будет.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Доступна авторизованным (и анонимной роли — вернёт false, если профиля нет).
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- ============================================================================
-- 2. profiles — своя строка для всех; admin видит/меняет все
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Снимаем все ранее заданные варианты политик (имена могли отличаться от сессии к сессии).
DROP POLICY IF EXISTS "own_select"        ON public.profiles;
DROP POLICY IF EXISTS "own_update"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_select"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_update"   ON public.profiles;

-- Чтение: своя строка ИЛИ admin (видит всех).
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT
  USING (id = auth.uid() OR public.is_admin());

-- Обновление: своя строка ИЛИ admin.
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- INSERT/DELETE по profiles НЕ открываем обычным пользователям:
--   * создание идёт триггером handle_new_user (security definer) и через service_role;
--   * увольнение = деактивация (is_active=false), не удаление строки.

-- Защита от самоповышения прав: обычный пользователь (не admin) не может менять
-- собственные role/is_active. service_role (auth.uid() IS NULL) и admin — могут.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role / триггеры / серверные задачи без JWT — пропускаем.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- admin может менять что угодно.
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  -- обычный пользователь не вправе трогать роль и статус активности.
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'Недостаточно прав для изменения роли или статуса активности';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER protect_profile_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- ============================================================================
-- 3. tasks — staff видит/меняет свои (исполнитель ИЛИ автор); admin — все
-- ============================================================================
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select_own" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert_own" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update_own" ON public.tasks;
DROP POLICY IF EXISTS "tasks_select"     ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert"     ON public.tasks;
DROP POLICY IF EXISTS "tasks_update"     ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete"     ON public.tasks;

-- Видит: исполнитель, автор, или admin.
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR public.is_admin()
  );

-- Создаёт: автор = он сам (свои задачи), либо admin.
CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    OR public.is_admin()
  );

-- Меняет: исполнитель, автор, или admin.
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR public.is_admin()
  )
  WITH CHECK (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR public.is_admin()
  );

-- Удаляет: только admin (в UI не используется; service_role и так может).
CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE
  USING (public.is_admin());

-- ============================================================================
-- 4. task_comments — причастный к задаче или admin
-- ============================================================================
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments_select"        ON public.task_comments;
DROP POLICY IF EXISTS "comments_insert"        ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_select"   ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_insert"   ON public.task_comments;

-- Читать: исполнитель/автор задачи или admin.
CREATE POLICY "task_comments_select" ON public.task_comments
  FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
  );

-- Писать: от своего имени и только если причастен к задаче, либо admin.
-- (Возврат «переделать» начальником идёт через service_role — RLS не мешает.)
CREATE POLICY "task_comments_insert" ON public.task_comments
  FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_id
          AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
      )
    )
  );

-- ============================================================================
-- 5. task_files — причастный к задаче или admin
-- ============================================================================
ALTER TABLE public.task_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_files_insert" ON public.task_files;
DROP POLICY IF EXISTS "task_files_select" ON public.task_files;

-- Вставлять: исполнитель/автор задачи и только от своего имени (или admin).
CREATE POLICY "task_files_insert" ON public.task_files
  FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_id
          AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
      )
    )
  );

-- Читать: исполнитель/автор задачи или admin.
-- (Скачивание у начальника идёт через signed URL на service_role — RLS не мешает.)
CREATE POLICY "task_files_select" ON public.task_files
  FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
  );

-- ============================================================================
-- 6. tracker_checkins — сотрудник своей записи или admin
-- ============================================================================
ALTER TABLE public.tracker_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tracker_checkins_select" ON public.tracker_checkins;

-- Читать: своя запись или admin. (Пишет вечерний трекер через service_role.)
CREATE POLICY "tracker_checkins_select" ON public.tracker_checkins
  FOR SELECT
  USING (profile_id = auth.uid() OR public.is_admin());

-- ============================================================================
-- 7. morning_nudges — сотрудник своей записи или admin
-- ============================================================================
ALTER TABLE public.morning_nudges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "morning_nudges_select" ON public.morning_nudges;

CREATE POLICY "morning_nudges_select" ON public.morning_nudges
  FOR SELECT
  USING (profile_id = auth.uid() OR public.is_admin());

-- ============================================================================
-- 8. Storage: бакет task-files — загрузка к своим задачам, чтение причастный/admin
-- ============================================================================
-- Путь объекта = '{task_id}/{uid}', поэтому (storage.foldername(name))[1] = task_id.
-- В приложении скачивание идёт через signed URL (service_role, RLS не применяется),
-- поэтому ужесточение SELECT не ломает существующие экраны; политика — защита от
-- прямого обращения к Storage обычным клиентом.

DROP POLICY IF EXISTS "task_files_upload" ON storage.objects;
DROP POLICY IF EXISTS "task_files_select" ON storage.objects;

-- Загрузка: только в бакет task-files и только в папку задачи, к которой
-- пользователь причастен (исполнитель/автор), либо admin.
CREATE POLICY "task_files_upload" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'task-files'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = ((storage.foldername(name))[1])::uuid
          AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
      )
    )
  );

-- Чтение из бакета: причастный к задаче-папке или admin.
CREATE POLICY "task_files_select" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'task-files'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = ((storage.foldername(name))[1])::uuid
          AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
      )
    )
  );

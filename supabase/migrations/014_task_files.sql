-- Этап: вложения к задачам
-- Приватный Storage-бакет task-files + таблица task_files с RLS.

-- ==================== STORAGE BUCKET ====================
-- Создаёт приватный бакет с лимитом 50 МБ на файл.
-- Идемпотентно: повторный прогон безопасен.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('task-files', 'task-files', false, 52428800)
ON CONFLICT (id) DO NOTHING;

-- Загружать может любой авторизованный пользователь (защита — RLS таблицы task_files).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'task_files_upload'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "task_files_upload"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'task-files')
    $pol$;
  END IF;
END $$;

-- Читать из бакета могут только авторизованные пользователи.
-- Скачивание для всех остальных идёт через signed URL (генерируется на сервере service_role).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'task_files_select'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "task_files_select"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'task-files')
    $pol$;
  END IF;
END $$;

-- ==================== TABLE ====================
CREATE TABLE IF NOT EXISTS task_files (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id     uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by uuid        NOT NULL REFERENCES profiles(id),
  file_path   text        NOT NULL,   -- путь в Storage: {task_id}/{uuid}
  file_name   text        NOT NULL,   -- оригинальное имя файла
  mime_type   text,
  size        bigint,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE task_files ENABLE ROW LEVEL SECURITY;

-- Вставлять может исполнитель или создатель задачи (и только от своего имени).
CREATE POLICY "task_files_insert"
ON task_files
FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM tasks
    WHERE id = task_id
      AND (assigned_to = auth.uid() OR created_by = auth.uid())
  )
);

-- Читать могут: исполнитель, создатель задачи, или admin.
CREATE POLICY "task_files_select"
ON task_files
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = task_id
      AND (
        t.assigned_to = auth.uid()
        OR t.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
  )
);

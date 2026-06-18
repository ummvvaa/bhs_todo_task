-- Этап 6: таблица task_comments (возвраты и история комментариев)
-- Выполнить в Supabase SQL Editor

CREATE TABLE task_comments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  uuid        NOT NULL REFERENCES profiles(id),
  body       text        NOT NULL CHECK (char_length(body) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

-- Читать: исполнитель или автор задачи, либо admin
CREATE POLICY "comments_select" ON task_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_id
        AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Вставлять: только admin (service_role обходит RLS, но явная политика как документация)
CREATE POLICY "comments_insert" ON task_comments
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

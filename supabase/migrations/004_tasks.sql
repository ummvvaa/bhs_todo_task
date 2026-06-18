-- Этап 4: таблица tasks
-- Выполнить в Supabase SQL Editor

CREATE TABLE tasks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text        NOT NULL,
  description  text,
  assigned_to  uuid        REFERENCES profiles(id),
  created_by   uuid        REFERENCES profiles(id),
  due_date     timestamptz,
  status       text        NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open', 'in_review', 'done')),
  completed_at timestamptz,
  is_recurring bool        NOT NULL DEFAULT false,
  recurrence   text        CHECK (recurrence IN ('daily', 'weekly')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Пользователь видит задачи, где он исполнитель ИЛИ автор
CREATE POLICY "tasks_select_own" ON tasks
  FOR SELECT USING (
    assigned_to = auth.uid() OR created_by = auth.uid()
  );

-- Создавать задачи может любой авторизованный (created_by = себя)
CREATE POLICY "tasks_insert_own" ON tasks
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
  );

-- Менять задачу может исполнитель или автор
CREATE POLICY "tasks_update_own" ON tasks
  FOR UPDATE USING (
    assigned_to = auth.uid() OR created_by = auth.uid()
  );

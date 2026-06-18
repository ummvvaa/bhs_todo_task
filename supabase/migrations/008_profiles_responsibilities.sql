-- Этап 11: поле responsibilities в profiles (зона ответственности / навыки сотрудника)
-- Используется ИИ-подбором исполнителей. Заполняет/правит админ на экране «Сотрудники».
-- Выполнить в Supabase SQL Editor.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS responsibilities text;

COMMENT ON COLUMN profiles.responsibilities IS
  'Короткое описание обязанностей и навыков сотрудника. Используется ИИ-подбором исполнителей по смыслу задачи.';

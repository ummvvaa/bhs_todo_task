-- Этап: удаление поля department из profiles
-- Отделов ОПМ/ОРМ в проекте нет — колонка была ошибочной.

ALTER TABLE profiles DROP COLUMN IF EXISTS department;

-- Удаляем поле amocrm_user_id из profiles: импорт из amoCRM больше не используется,
-- сотрудники добавляются вручную через Admin API.
ALTER TABLE profiles DROP COLUMN IF EXISTS amocrm_user_id;

-- Этап 7: автоперенос невыполненных задач + генерация повторяющихся (pg_cron)
-- Выполнить в Supabase SQL Editor.
--
-- Часовой пояс: все расчёты в Asia/Almaty (UTC+5, без перехода на летнее время).
-- timestamptz хранит абсолютный момент, поэтому:
--   * сравнение due_date < now() корректно без приведения пояса;
--   * прибавление interval '1 day' = +24ч, а так как у Алматы нет DST,
--     локальное время суток сохраняется.

-- Расширение pg_cron (в Supabase обычно уже включено через Dashboard → Database → Extensions).
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- 1. Перенос: открытые задачи с истёкшим дедлайном → дедлайн на следующий день.
-- ---------------------------------------------------------------------------
create or replace function public.shift_overdue_tasks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  shifted integer;
begin
  update public.tasks
     set due_date = due_date + interval '1 day'
   where status = 'open'
     and due_date is not null
     and due_date < now();

  get diagnostics shifted = row_count;
  return shifted;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Генерация повторяющихся задач (логика Этапа 5, перенесённая в SQL).
--    Для каждой завершённой регулярной задачи создаём новый экземпляр,
--    если ещё нет активного клона (open/in_review) с тем же title+assigned_to.
--    Новый дедлайн = база + интервал (daily=1 день, weekly=7 дней),
--    где база = max(старый due_date, now()).
-- ---------------------------------------------------------------------------
create or replace function public.generate_recurring_tasks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  created integer;
begin
  with done_recurring as (
    select distinct on (t.title, t.assigned_to)
           t.title, t.description, t.assigned_to, t.created_by,
           t.due_date, t.recurrence
      from public.tasks t
     where t.is_recurring = true
       and t.status = 'done'
       and t.recurrence in ('daily', 'weekly')
     order by t.title, t.assigned_to, t.due_date desc nulls last
  ),
  to_create as (
    select dr.*
      from done_recurring dr
     where not exists (
       select 1
         from public.tasks a
        where a.is_recurring = true
          and a.title = dr.title
          and a.assigned_to is not distinct from dr.assigned_to
          and a.status in ('open', 'in_review')
     )
  ),
  inserted as (
    insert into public.tasks
      (title, description, assigned_to, created_by, due_date,
       is_recurring, recurrence, status)
    select
      tc.title,
      tc.description,
      tc.assigned_to,
      tc.created_by,
      greatest(coalesce(tc.due_date, now()), now())
        + case tc.recurrence
            when 'daily' then interval '1 day'
            else interval '7 days'
          end,
      true,
      tc.recurrence,
      'open'
    from to_create tc
    returning 1
  )
  select count(*) into created from inserted;

  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Ночное обслуживание: перенос + повторяющиеся одним вызовом.
-- ---------------------------------------------------------------------------
create or replace function public.nightly_task_maintenance()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.shift_overdue_tasks();
  perform public.generate_recurring_tasks();
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Расписание pg_cron: каждую ночь в 03:00 по Алматы.
--    pg_cron работает по UTC, поэтому 03:00 Алматы (UTC+5) = 22:00 UTC.
--    Сначала снимаем старое расписание (идемпотентность при повторном прогоне).
-- ---------------------------------------------------------------------------
select cron.unschedule('nightly-task-maintenance')
where exists (
  select 1 from cron.job where jobname = 'nightly-task-maintenance'
);

select cron.schedule(
  'nightly-task-maintenance',
  '0 22 * * *',                              -- 22:00 UTC = 03:00 Asia/Almaty
  $$ select public.nightly_task_maintenance(); $$
);

-- ---------------------------------------------------------------------------
-- Проверка, что cron-задача создалась:
--   select jobid, jobname, schedule, command, active from cron.job;
-- История запусков (после первого срабатывания):
--   select * from cron.job_run_details order by start_time desc limit 10;
-- Ручной прогон обслуживания (не дожидаясь ночи):
--   select public.nightly_task_maintenance();
-- ---------------------------------------------------------------------------

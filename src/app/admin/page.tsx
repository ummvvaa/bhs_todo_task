import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import AssignTaskForm from './assign-task-form'
import RecurringTrigger from './recurring-trigger'
import EmployeesManager, { type EmployeeProfile } from './employees-manager'

export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()

  // Все сотрудники (включая деактивированных) — для управления персоналом
  const { data: allProfiles } = await admin
    .from('profiles')
    .select('id, full_name, email, role, responsibilities, is_active')
    .order('full_name', { ascending: true })

  // Только активные (кроме себя) — для формы назначения задач
  const staffProfiles =
    allProfiles?.filter((p) => p.is_active && p.id !== user!.id) ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Сотрудники
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Управление аккаунтами: добавить, редактировать, деактивировать, сбросить пароль
        </p>
      </div>

      {/* Employees management */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
          Список сотрудников
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Аккаунты создаются через Admin API с email-подтверждением и временным паролем.
          Деактивация сохраняет историю задач.
        </p>
        <EmployeesManager
          profiles={(allProfiles ?? []) as EmployeeProfile[]}
          currentUserId={user!.id}
        />
      </section>

      {/* Assign task */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
          Назначить задачу
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Создать задачу одному или сразу нескольким сотрудникам — для каждого создаётся отдельная задача.
        </p>
        <AssignTaskForm profiles={staffProfiles} />
      </section>

      {/* Recurring */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
          Повторяющиеся задачи
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Генерация новых экземпляров для завершённых регулярных задач. Запускается автоматически ночью.
        </p>
        <RecurringTrigger />
      </section>

    </div>
  )
}

import { createAdminClient } from '@/lib/supabase/admin'
import { getTaskFilesWithUrls } from '@/lib/task-files-server'
import ReviewQueue from '../review-queue'

export default async function ReviewPage() {
  const admin = createAdminClient()

  const [{ data: reviewTasks }, { data: profiles }] = await Promise.all([
    admin
      .from('tasks')
      .select('id, title, description, due_date, assigned_to, created_at')
      .eq('status', 'in_review')
      .order('created_at', { ascending: true }),
    admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('is_active', true)
      .order('full_name'),
  ])

  const taskIds = reviewTasks?.map((t) => t.id) ?? []
  const filesByTask = await getTaskFilesWithUrls(taskIds)

  const tasksWithFiles = (reviewTasks ?? []).map((t) => ({
    ...t,
    task_files: filesByTask[t.id] ?? [],
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Очередь проверки
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Задачи, отправленные сотрудниками на проверку
        </p>
      </div>

      {tasksWithFiles.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-base font-medium text-slate-500 dark:text-slate-400">
            Задач на проверке нет
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            Все задачи проверены
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-5">
          <ReviewQueue tasks={tasksWithFiles} profiles={profiles ?? []} />
        </div>
      )}
    </div>
  )
}

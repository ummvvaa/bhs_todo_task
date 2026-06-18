import { createAdminClient } from '@/lib/supabase/admin'

export type TaskFileWithUrl = {
  id: string
  task_id: string
  file_name: string
  file_path: string
  mime_type: string | null
  size: number | null
  created_at: string
  signed_url: string | null
}

/**
 * Загружает вложения для указанных задач и генерирует signed URL для каждого файла.
 * Используется только в серверных компонентах (service_role обходит RLS Storage).
 */
export async function getTaskFilesWithUrls(
  taskIds: string[],
): Promise<Record<string, TaskFileWithUrl[]>> {
  if (taskIds.length === 0) return {}

  const admin = createAdminClient()

  const { data: taskFiles } = await admin
    .from('task_files')
    .select('id, task_id, file_name, file_path, mime_type, size, created_at')
    .in('task_id', taskIds)
    .order('created_at')

  if (!taskFiles || taskFiles.length === 0) return {}

  const filesWithUrls: TaskFileWithUrl[] = await Promise.all(
    taskFiles.map(async (f) => {
      const { data } = await admin.storage
        .from('task-files')
        .createSignedUrl(f.file_path, 3600, { download: f.file_name })
      return {
        id: f.id,
        task_id: f.task_id,
        file_name: f.file_name,
        file_path: f.file_path,
        mime_type: f.mime_type ?? null,
        size: f.size ?? null,
        created_at: f.created_at,
        signed_url: data?.signedUrl ?? null,
      }
    }),
  )

  const byTask: Record<string, TaskFileWithUrl[]> = {}
  for (const f of filesWithUrls) {
    if (!byTask[f.task_id]) byTask[f.task_id] = []
    byTask[f.task_id].push(f)
  }
  return byTask
}

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Админский Supabase-клиент с service_role-ключом.
 *
 * ВНИМАНИЕ: обходит RLS и имеет полный доступ к базе и Auth Admin API.
 * Использовать ТОЛЬКО на сервере (route handlers / server actions).
 * Никогда не импортировать в клиентские ('use client') компоненты —
 * ключ SUPABASE_SERVICE_ROLE_KEY не должен попасть в браузер.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL не задан в .env.local')
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY не задан в .env.local')
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

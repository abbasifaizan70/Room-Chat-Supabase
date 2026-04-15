import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Read at module init; Vite inlines `import.meta.env.*` at build time. */
function readEnv(): { url: string; anonKey: string } {
  const u = import.meta.env.VITE_SUPABASE_URL
  const k = import.meta.env.VITE_SUPABASE_ANON_KEY
  return {
    url: typeof u === 'string' ? u.trim() : '',
    anonKey: typeof k === 'string' ? k.trim() : '',
  }
}

const env = readEnv()

export const isSupabaseConfigured = Boolean(env.url && env.anonKey)

if (!isSupabaseConfigured) {
  console.warn(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Add them to .env for local dev. For GitHub Pages, add the same names as repository Actions secrets and redeploy.'
  )
}

let client: SupabaseClient | null = null

/**
 * Lazily creates the client so `createClient` never runs at module load
 * (avoids crashes when env was missing at build time).
 * Call only when `isSupabaseConfigured` is true.
 */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('getSupabase() called without Supabase env configuration')
  }
  if (!client) {
    client = createClient(env.url, env.anonKey)
  }
  return client
}

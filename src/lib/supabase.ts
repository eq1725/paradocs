import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from './database.types'

/**
 * V11.17.44 — lazy client init.
 *
 * The previous module-load `createClient(...)` call exploded the CI
 * build (`unhandledRejection: supabaseKey is required`) because
 * `_app.tsx` imports `supabase` from this file, and Next.js's
 * "Collecting page data" phase loads every page module to harvest
 * getStaticProps / getStaticPaths. If `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 * isn't present at that moment (e.g. a CI environment that hasn't
 * been configured with the secret), the constructor throws before
 * any of our page-level fallbacks can intercept.
 *
 * Wrapping the export in a Proxy defers the actual client creation
 * until first property access. Build-time module loading no longer
 * crashes; runtime callers still get a real client because env vars
 * are populated when pages are served.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

let _client: SupabaseClient<Database> | null = null

function getClient(): SupabaseClient<Database> {
  if (_client) return _client
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase env not configured: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.'
    )
  }
  _client = createClient<Database>(supabaseUrl, supabaseAnonKey)
  return _client
}

/**
 * Public anon-key client. Property access lazily instantiates the
 * underlying SupabaseClient — safe to import from modules that get
 * loaded during build without ever being called.
 */
export const supabase: SupabaseClient<Database> = new Proxy(
  {} as SupabaseClient<Database>,
  {
    get(_target, prop, receiver) {
      const client = getClient()
      const value = Reflect.get(client as any, prop, receiver)
      return typeof value === 'function' ? value.bind(client) : value
    },
  }
)

/**
 * Server-side client with service role (for admin operations).
 * Already lazy by construction — only throws when called.
 */
export const createServerClient = (): SupabaseClient<Database> => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server operations')
  }
  return createClient<Database>(supabaseUrl, serviceRoleKey)
}

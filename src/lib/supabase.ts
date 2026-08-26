import { createClient } from '@supabase/supabase-js'

// NOTE: intentionally untyped (no Database generic). The hand-written types in
// database.types.ts don't match supabase-js's exact generic shape, and fighting that isn't
// worth it for a small app — instead each query result is cast to the matching type from
// database.types.ts at the call site. Once you have a real Supabase project, generate real
// types with `npx supabase gen types typescript` and this can go back to being fully typed.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!supabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    'Supabase env vars are missing. Copy .env.example to .env.local and fill in your Supabase project URL + anon key. Using placeholder values for now so the app can still render.',
  )
}

// createClient throws synchronously on an empty URL, which would crash the whole app before the
// login page even renders. Fall back to a harmless placeholder so the UI loads; any real
// Supabase call will then fail with a clear network/auth error instead of a blank white screen.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
)

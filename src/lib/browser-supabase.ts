import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'build-placeholder'

export const supabase = createClient(
  typeof window !== 'undefined' ? `${window.location.origin}/sb` : supabaseUrl,
  supabaseKey,
)

export const realtimeSupabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
    storageKey: 'masidy-realtime-auth',
  },
})

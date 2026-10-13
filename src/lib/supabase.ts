import { createClient } from '@supabase/supabase-js'

// SERVER ONLY (uses the service role key). Never import in client components.
export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function getUser(req: Request) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data } = await admin.auth.getUser(token)
  return data.user
}

export async function appCapReached(userId: string, cap = 20) {
  const { count } = await admin.from('apps').select('id', { count: 'exact', head: true }).eq('owner_id', userId)
  return (count ?? 0) >= cap
}

import { getUser } from '@/lib/supabase'
import { signState } from '@/lib/github'

export async function POST(req: Request) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const q = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    scope: 'repo',
    state: signState(user.id),
    redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/github/callback`,
  })
  return Response.json({ url: `https://github.com/login/oauth/authorize?${q}` })
}

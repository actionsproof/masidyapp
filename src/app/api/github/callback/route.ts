import { admin } from '@/lib/supabase'
import { enc, exchangeCode, readState } from '@/lib/github'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const userId = readState(url.searchParams.get('state') ?? '')
  const code = url.searchParams.get('code')
  const site = process.env.NEXT_PUBLIC_SITE_URL!
  if (!userId || !code) return Response.redirect(`${site}/?github=error`)
  try {
    const { token, login } = await exchangeCode(code)
    await admin.from('github_connections').upsert({ user_id: userId, login, token_enc: enc(token) })
    return Response.redirect(`${site}/?github=1`)
  } catch (e) {
    console.error(e)
    return Response.redirect(`${site}/?github=error`)
  }
}

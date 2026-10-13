import { admin, getUser } from '@/lib/supabase'
import { domains } from '@/lib/providers'
import { BRAND } from '@/lib/brand'

// Admin only. body: { action: 'suspend' | 'unsuspend', appId } or { action: 'grant', userId, credits }
export async function POST(req: Request) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: me } = await admin.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { action, appId, userId, credits } = await req.json()

  if (action === 'suspend' || action === 'unsuspend') {
    const { data: app } = await admin.from('apps').select('*').eq('id', appId).single()
    if (!app) return Response.json({ error: 'App not found' }, { status: 404 })
    await admin.from('apps').update({ suspended: action === 'suspend' }).eq('id', appId)
    const names = [app.subdomain && `${app.subdomain}.${BRAND.rootDomain}`, app.custom_domain].filter(Boolean) as string[]
    if (app.vercel_project_id) {
      for (const n of names) {
        try { action === 'suspend' ? await domains.remove(app.vercel_project_id, n) : await domains.add(app.vercel_project_id, n) }
        catch (e) { console.error(e) }
      }
    }
    return Response.json({ ok: true })
  }

  if (action === 'grant') {
    const n = Number(credits)
    if (!userId || !Number.isInteger(n) || n < 1 || n > 10000) return Response.json({ error: 'Bad input' }, { status: 400 })
    const { data } = await admin.rpc('add_credits', { p_user: userId, p_amount: n, p_event: `admin-${crypto.randomUUID()}` })
    return Response.json({ ok: !!data })
  }
  return Response.json({ error: 'Unknown action' }, { status: 400 })
}

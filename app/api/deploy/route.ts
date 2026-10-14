import { admin, getUser } from '@/lib/supabase'
import { generator, host, domains } from '@/lib/providers'
import { BRAND } from '@/lib/brand'

export const maxDuration = 300

export async function POST(req: Request) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { appId, versionId: pickedVersion } = await req.json()
  const { data: app } = await admin.from('apps').select('*').eq('id', appId).eq('owner_id', user.id).single()
  if (!app || app.suspended) return Response.json({ error: 'App not found' }, { status: 404 })

  const { data: ok } = await admin.rpc('spend_credits', {
    p_user: user.id, p_amount: 2, p_kind: 'deploy', p_app: app.id,
  })
  if (!ok) return Response.json({ error: 'Not enough credits' }, { status: 402 })

  try {
    const versionId = pickedVersion ?? await generator.latestVersion(app.v0_chat_id)
    if (!versionId) throw new Error('No version to deploy')
    const d = await host.deploy(app.v0_chat_id, versionId)
    const v0ProjectId = d.projectId ?? app.v0_project_id
    const vercelProjectId = app.vercel_project_id ?? (v0ProjectId ? await host.vercelProjectId(v0ProjectId) : null)
    await admin.from('deployments').insert({ app_id: app.id, url: d.url, status: 'ready' })
    await admin.from('apps').update({ status: 'live', v0_project_id: v0ProjectId, vercel_project_id: vercelProjectId }).eq('id', app.id)
    // White label: users only ever see a Masidy address, never a supplier address.
    let url: string | null = d.url
    if (app.subdomain) {
      url = `https://${app.subdomain}.${BRAND.rootDomain}`
    } else if (vercelProjectId) {
      const slug = app.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/g, '') || 'app'
      const sub = `${slug}-${Math.random().toString(36).slice(2, 6)}`
      try {
        await domains.add(vercelProjectId, `${sub}.${BRAND.rootDomain}`)
        await admin.from('apps').update({ subdomain: sub }).eq('id', app.id)
        url = `https://${sub}.${BRAND.rootDomain}`
      } catch (e) { console.error(e) }
    }
    return Response.json({ url })
  } catch (e) {
    console.error(e)
    await admin.rpc('refund_credits', { p_user: user.id, p_amount: 2, p_app: app.id })
    return Response.json({ error: 'Deploy failed' }, { status: 500 })
  }
}

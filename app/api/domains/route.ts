import { admin, getUser } from '@/lib/supabase'
import { domains } from '@/lib/providers'
import { dnsRecords } from '@/lib/dns'

const ROOT = process.env.ROOT_DOMAIN!
const RESERVED = ['www', 'app', 'api', 'admin', 'mail', 'dashboard', 'login', 'static', 'docs', 'blog']
const SUB_RE = /^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$/
const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/

// body: { appId, subdomain? , customDomain?, action?: 'verify' | 'remove-custom' }
export async function POST(req: Request) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { appId, subdomain, customDomain, action } = await req.json()
  const { data: app } = await admin.from('apps').select('*').eq('id', appId).eq('owner_id', user.id).single()
  if (!app || app.suspended) return Response.json({ error: 'App not found' }, { status: 404 })
  if (!app.vercel_project_id) return Response.json({ error: 'Deploy the app first' }, { status: 400 })

  try {
    if (action === 'verify' && app.custom_domain) {
      const r: any = await domains.verify(app.vercel_project_id, app.custom_domain)
      if (r.verified) await admin.from('apps').update({ custom_domain_verified: true }).eq('id', app.id)
      return Response.json({ verified: !!r.verified, records: dnsRecords(r.verification) })
    }
    if (action === 'remove-custom' && app.custom_domain) {
      await domains.remove(app.vercel_project_id, app.custom_domain)
      await admin.from('apps').update({ custom_domain: null, custom_domain_verified: false }).eq('id', app.id)
      return Response.json({ ok: true })
    }
    if (subdomain) {
      const sub = String(subdomain).toLowerCase()
      if (!SUB_RE.test(sub) || RESERVED.includes(sub)) return Response.json({ error: 'Invalid or reserved name' }, { status: 400 })
      const { error } = await admin.from('apps').update({ subdomain: sub }).eq('id', app.id)
      if (error) return Response.json({ error: 'Name already taken' }, { status: 409 })
      try { await domains.add(app.vercel_project_id, `${sub}.${ROOT}`) }
      catch (e) { await admin.from('apps').update({ subdomain: app.subdomain }).eq('id', app.id); throw e }
      return Response.json({ url: `https://${sub}.${ROOT}` })
    }
    if (customDomain) {
      const d = String(customDomain).toLowerCase()
      if (!DOMAIN_RE.test(d) || d.endsWith(ROOT)) return Response.json({ error: 'Invalid domain' }, { status: 400 })
      const { error } = await admin.from('apps').update({ custom_domain: d, custom_domain_verified: false }).eq('id', app.id)
      if (error) return Response.json({ error: 'Domain already in use' }, { status: 409 })
      try {
        const r: any = await domains.add(app.vercel_project_id, d)
        if (r.verified) await admin.from('apps').update({ custom_domain_verified: true }).eq('id', app.id)
        return Response.json({ verified: !!r.verified, records: dnsRecords(r.verification) })
      } catch (e) { await admin.from('apps').update({ custom_domain: null }).eq('id', app.id); throw e }
    }
    return Response.json({ error: 'Nothing to do' }, { status: 400 })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Domain update failed' }, { status: 500 })
  }
}

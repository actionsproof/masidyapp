import JSZip from 'jszip'
import { admin, getUser, appCapReached } from '@/lib/supabase'
import { generator, domains, env } from '@/lib/providers'
import { mask } from '@/lib/mask'
import { scrubFiles } from '@/lib/scrub'
import { pushToGithub } from '@/lib/github'
import { scrub } from '@/lib/brand'

export const maxDuration = 120
type Ctx = { params: Promise<{ id: string; action: string }> }

const bad = (error: string, status = 400) => Response.json({ error }, { status })
const safePath = (p: unknown) => typeof p === 'string' && p.length < 200 && !p.startsWith('/') && !p.includes('..') && !p.includes('\\')

async function load(req: Request, id: string) {
  const user = await getUser(req)
  if (!user) return { err: bad('Unauthorized', 401) }
  const { data: app } = await admin.from('apps').select('*').eq('id', id).eq('owner_id', user.id).single()
  if (!app) return { err: bad('App not found', 404) }
  return { user, app }
}

// GET: messages | versions | files | download
export async function GET(req: Request, { params }: Ctx) {
  const { id, action } = await params
  const { user, app, err } = (await load(req, id)) as any
  if (err) return err
  const u = new URL(req.url)
  try {
    if (action === 'messages') {
      const m = await generator.messages(app.v0_chat_id)
      return Response.json({ messages: m.map(x => ({ ...x, text: scrub(x.text) })) })
    }
    if (action === 'versions') {
      const vs = await generator.versions(app.v0_chat_id)
      return Response.json({ versions: await Promise.all(vs.map(async v => ({ ...v, previewUrl: await mask(v.previewUrl) }))) })
    }
    if (action === 'status') {
      const s = await generator.status(app.v0_chat_id)
      let state: string = s.state
      if (app.gen_status === 'generating') {
        if (app.gen_prev_version && s.versionId === app.gen_prev_version && state === 'ready') state = 'generating' // new version not created yet
        if (state === 'generating' && Date.now() - new Date(app.gen_started_at).getTime() > 10 * 60_000) state = 'failed'
        if (state !== 'generating') {
          const { data: claimed } = await admin.from('apps')
            .update({ gen_status: state, gen_charged: 0, gen_started_at: null, status: state === 'ready' ? 'ready' : 'failed' })
            .eq('id', app.id).eq('gen_status', 'generating').select('id')
          if (claimed?.length && state === 'failed' && app.gen_charged > 0)
            await admin.rpc('refund_credits', { p_user: user.id, p_amount: app.gen_charged, p_app: app.id })
        }
      } else state = app.gen_status === 'failed' ? 'failed' : 'ready'
      return Response.json({ status: state, previewUrl: state === 'generating' ? null : await mask(s.previewUrl) })
    }
    if (action === 'env') {
      if (!app.vercel_project_id) return Response.json({ keys: [] })
      return Response.json({ keys: (await env.list(app.vercel_project_id)).map(e => e.key) })
    }
    const version = u.searchParams.get('version') || (await generator.latestVersion(app.v0_chat_id))
    if (!version) return bad('No version yet', 404)
    if (action === 'files') return Response.json({ version, files: scrubFiles(await generator.files(app.v0_chat_id, version), app.name) })
    if (action === 'download') {
      const files = scrubFiles(await generator.files(app.v0_chat_id, version, true), app.name) // includes config files so it runs on its own
      const zip = new JSZip()
      files.forEach(f => zip.file(f.name, f.content))
      const buf = await zip.generateAsync({ type: 'uint8array' })
      return new Response(buf as any, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="masidy-app.zip"' } })
    }
    return bad('Unknown action', 404)
  } catch (e) { console.error(e); return bad('Request failed', 500) }
}

// POST: save | fork | github-push | delete
export async function POST(req: Request, { params }: Ctx) {
  const { id, action } = await params
  const { user, app, err } = (await load(req, id)) as any
  if (err) return err
  const body = await req.json().catch(() => ({}))
  try {
    if (action === 'save') {
      const { version, path, content } = body
      if (!version || !safePath(path) || typeof content !== 'string' || content.length > 200_000) return bad('Invalid file')
      await generator.saveFiles(app.v0_chat_id, version, [{ name: path, content }])
      return Response.json({ ok: true })
    }
    if (action === 'fork') {
      if (!body.version) return bad('Pick a version')
      if (await appCapReached(user.id)) return bad('App limit reached', 403)
      const r = await generator.fork(app.v0_chat_id, body.version)
      const { data } = await admin.from('apps').insert({ owner_id: user.id, name: `${app.name} (copy)`.slice(0, 80), v0_chat_id: r.chatId, status: 'ready' }).select('id').single()
      return Response.json({ appId: data!.id, previewUrl: await mask(r.previewUrl) })
    }
    if (action === 'github-push') {
      const files = scrubFiles(await generator.files(app.v0_chat_id, body.version || (await generator.latestVersion(app.v0_chat_id))!, true), app.name)
      try { return Response.json({ url: await pushToGithub(user.id, app, files) }) }
      catch (e: any) { if (e.message === 'NOT_CONNECTED') return bad('Connect GitHub first'); throw e }
    }
    if (action === 'stop') {
      await admin.from('apps').update({ gen_charged: 0 }).eq('id', app.id) // stopped work is not refunded
      await generator.stop(app.v0_chat_id)
      return Response.json({ ok: true })
    }
    if (action === 'resume') {
      if (app.gen_status !== 'failed') return bad('Nothing to resume')
      await admin.from('apps').update({ gen_status: 'generating', status: 'generating', gen_started_at: new Date().toISOString(), gen_prev_version: null, gen_charged: 0 }).eq('id', app.id)
      await generator.resume(app.v0_chat_id)
      return Response.json({ ok: true })
    }
    if (action === 'env-set' || action === 'env-delete') {
      const { key, value } = body
      if (!app.vercel_project_id) return bad('Deploy the app first')
      if (typeof key !== 'string' || !/^[A-Z_][A-Z0-9_]{0,63}$/.test(key) || key.startsWith('VERCEL')) return bad('Invalid name')
      if (action === 'env-set') {
        if (typeof value !== 'string' || !value || value.length > 4000) return bad('Invalid value')
        await env.set(app.vercel_project_id, key, value)
      } else {
        const hit = (await env.list(app.vercel_project_id)).find(e => e.key === key)
        if (hit) await env.remove(app.vercel_project_id, hit.id)
      }
      return Response.json({ ok: true })
    }
    if (action === 'delete') {
      if (app.vercel_project_id) {
        for (const n of [app.subdomain && `${app.subdomain}.${process.env.ROOT_DOMAIN}`, app.custom_domain].filter(Boolean) as string[]) {
          try { await domains.remove(app.vercel_project_id, n) } catch (e) { console.error(e) }
        }
      }
      await generator.remove(app.v0_chat_id)
      await admin.from('apps').delete().eq('id', app.id)
      return Response.json({ ok: true })
    }
    return bad('Unknown action', 404)
  } catch (e) { console.error(e); return bad('Request failed', 500) }
}

import { admin } from '@/lib/supabase'

// Reverse proxy for live previews. The token is the secret; it expires after 6 hours.
// Limits: no websockets (no hot reload), and assets served from other hosts are not rewritten.
type Ctx = { params: Promise<{ token: string; path?: string[] }> }

async function handle(req: Request, { params }: Ctx) {
  const { token, path } = await params
  const { data: t } = await admin.from('preview_tokens').select('upstream,expires_at').eq('token', token).single()
  if (!t || new Date(t.expires_at) < new Date()) return new Response('Not found', { status: 404 })

  const target = `${t.upstream}/${(path ?? []).join('/')}${new URL(req.url).search}`
  const headers = new Headers()
  for (const k of ['accept', 'accept-language', 'content-type', 'range', 'if-none-match', 'user-agent']) {
    const v = req.headers.get(k); if (v) headers.set(k, v)
  }
  const up = await fetch(target, {
    method: req.method, headers, redirect: 'manual',
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer(),
  })

  const upHost = new URL(t.upstream).host
  const myHost = `${token}.pv.${process.env.ROOT_DOMAIN}`
  const out = new Headers()
  for (const k of ['content-type', 'cache-control', 'etag']) { const v = up.headers.get(k); if (v) out.set(k, v) }
  const loc = up.headers.get('location'); if (loc) out.set('location', loc.split(upHost).join(myHost))

  const ct = up.headers.get('content-type') ?? ''
  if (/text\/html|javascript|text\/css|json|text\/plain/.test(ct)) {
    return new Response((await up.text()).split(upHost).join(myHost), { status: up.status, headers: out })
  }
  return new Response(up.body, { status: up.status, headers: out })
}
export { handle as GET, handle as POST, handle as HEAD }

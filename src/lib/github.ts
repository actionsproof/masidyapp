// SERVER ONLY. GitHub connect + push (Masidy -> user's GitHub repo).
import crypto from 'crypto'
import { admin } from './supabase'

const key = () => Buffer.from(process.env.GITHUB_TOKEN_KEY!, 'base64')

export function enc(text: string) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const e = Buffer.concat([c.update(text, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), e].map(b => b.toString('base64')).join('.')
}
export function dec(s: string) {
  const [iv, tag, e] = s.split('.').map(x => Buffer.from(x, 'base64'))
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(e), d.final()]).toString('utf8')
}

const mac = (u: string, ts: string) => crypto.createHmac('sha256', process.env.GITHUB_TOKEN_KEY!).update(`${u}.${ts}`).digest('hex')
export const signState = (userId: string) => { const ts = String(Date.now()); return `${userId}.${ts}.${mac(userId, ts)}` }
export function readState(state: string) {
  const [u, ts, m] = String(state).split('.')
  if (!u || !ts || !m) return null
  const ok = m.length === mac(u, ts).length && crypto.timingSafeEqual(Buffer.from(m), Buffer.from(mac(u, ts)))
  return ok && Date.now() - Number(ts) < 10 * 60 * 1000 ? u : null
}

async function gh(token: string, path: string, init?: RequestInit) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
  })
  if (!r.ok) throw new Error(`github ${r.status}: ${await r.text()}`)
  return r.json()
}

export async function pushToGithub(userId: string, app: any, files: { name: string; content: string }[]) {
  const { data: conn } = await admin.from('github_connections').select('*').eq('user_id', userId).single()
  if (!conn) throw new Error('NOT_CONNECTED')
  const token = dec(conn.token_enc)
  const owner = conn.login as string

  let repo: string = app.github_repo
  let branch = 'main'
  if (!repo) {
    const slug = app.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'masidy-app'
    for (const name of [`masidy-${slug}`, `masidy-${slug}-${Math.random().toString(36).slice(2, 6)}`]) {
      try {
        const r = await gh(token, '/user/repos', { method: 'POST', body: JSON.stringify({ name, private: true, auto_init: true, description: 'Built with Masidy' }) })
        repo = r.name; branch = r.default_branch; break
      } catch (e: any) { if (!String(e.message).includes('422')) throw e }
    }
    if (!repo) throw new Error('Could not create repository')
    await admin.from('apps').update({ github_repo: repo }).eq('id', app.id)
  } else {
    branch = (await gh(token, `/repos/${owner}/${repo}`)).default_branch
  }

  const base = `/repos/${owner}/${repo}`
  const head = (await gh(token, `${base}/git/ref/heads/${branch}`)).object.sha
  const tree: any[] = []
  for (let i = 0; i < files.length; i += 10) {
    const part = await Promise.all(files.slice(i, i + 10).map(async f => {
      const b = await gh(token, `${base}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: f.content, encoding: 'utf-8' }) })
      return { path: f.name, mode: '100644', type: 'blob', sha: b.sha }
    }))
    tree.push(...part)
  }
  const t = await gh(token, `${base}/git/trees`, { method: 'POST', body: JSON.stringify({ tree }) }) // full snapshot (deleted files disappear too)
  const c = await gh(token, `${base}/git/commits`, { method: 'POST', body: JSON.stringify({ message: 'Update from Masidy', tree: t.sha, parents: [head] }) })
  await gh(token, `${base}/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) })
  return `https://github.com/${owner}/${repo}`
}

export async function exchangeCode(code: string) {
  const r = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error('GitHub code exchange failed')
  const me = await gh(j.access_token, '/user')
  return { token: j.access_token as string, login: me.login as string }
}

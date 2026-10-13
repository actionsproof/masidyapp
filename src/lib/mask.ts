// SERVER ONLY. Hides the generator's preview address behind <token>.pv.<your domain>.
import crypto from 'crypto'
import { admin } from './supabase'

const ALLOWED = (process.env.PREVIEW_UPSTREAM_SUFFIXES ?? '').split(',').map(s => s.trim()).filter(Boolean)

export async function mask(url: string | null) {
  if (!url) return null
  const u = new URL(url)
  if (!ALLOWED.length || !ALLOWED.some(s => u.hostname.endsWith(s))) {
    console.warn('Preview proxy not configured for host:', u.hostname) // falls back to the raw address
    return url
  }
  const token = crypto.randomBytes(12).toString('hex')
  await admin.from('preview_tokens').insert({ token, upstream: u.origin, expires_at: new Date(Date.now() + 6 * 3600_000).toISOString() })
  return `https://${token}.pv.${process.env.ROOT_DOMAIN}${u.pathname}${u.search}`
}

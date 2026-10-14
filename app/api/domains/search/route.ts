import { getUser } from '@/lib/supabase'
import { registrar } from '@/lib/providers'
import { BRAND } from '@/lib/brand'

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/

export async function POST(req: Request) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const name = String((await req.json()).name ?? '').trim().toLowerCase()
  if (!DOMAIN_RE.test(name) || name.endsWith(BRAND.rootDomain)) return Response.json({ error: 'Enter a domain like mybrand.com' }, { status: 400 })
  try {
    const q = await registrar.quote(name)
    return Response.json({ domain: q.domain, available: q.available, priceCents: q.available ? q.priceCents : null })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Search failed' }, { status: 500 })
  }
}

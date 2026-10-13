// SERVER ONLY. Domain search and purchase through Vercel's Registrar API.
// VERIFY response and body field names against https://openapi.vercel.sh/ before going live.
const team = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : ''

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.vercel.com${path}${team}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`registrar ${res.status}: ${await res.text()}`)
  return res.json()
}

// Returns what Vercel charges (cents) and what Masidy charges the user (cents, with markup).
export async function quote(domain: string) {
  const a = await call(`/v1/registrar/domains/${domain}/availability`)
  if (!a.available) return { domain, available: false as const }
  const p = await call(`/v1/registrar/domains/${domain}/price`)
  const dollars = parseFloat(String(p.purchasePrice ?? p.price))
  if (!Number.isFinite(dollars)) throw new Error('Could not read domain price')
  const costCents = Math.round(dollars * 100)
  const markup = Number(process.env.DOMAIN_MARKUP_PERCENT ?? 20)
  return { domain, available: true as const, costCents, priceCents: Math.ceil(costCents * (1 + markup / 100)) }
}

export async function buy(domain: string, costCents: number, c: any) {
  const [firstName, ...rest] = String(c.name ?? '').trim().split(' ')
  return call(`/v1/registrar/domains/${domain}/buy`, {
    method: 'POST',
    body: JSON.stringify({
      autoRenew: true,
      years: 1,
      expectedPrice: costCents / 100,
      contactInformation: {
        firstName: firstName || 'Customer',
        lastName: rest.join(' ') || '-',
        email: c.email,
        phone: c.phone,
        address1: c.address?.line1,
        city: c.address?.city,
        state: c.address?.state,
        zip: c.address?.postal_code,
        country: c.address?.country,
      },
    }),
  })
}

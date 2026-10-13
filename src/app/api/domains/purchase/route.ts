import { admin, getUser } from '@/lib/supabase'
import { registrar } from '@/lib/providers'
import { stripe } from '@/lib/stripe'

export async function POST(req: Request) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { appId, domain } = await req.json()

  const { data: app } = await admin.from('apps').select('*').eq('id', appId).eq('owner_id', user.id).single()
  if (!app || app.suspended) return Response.json({ error: 'App not found' }, { status: 404 })
  if (!app.vercel_project_id) return Response.json({ error: 'Deploy the app first' }, { status: 400 })
  if (app.custom_domain) return Response.json({ error: 'Remove the current custom domain first' }, { status: 400 })

  try {
    const q = await registrar.quote(String(domain).toLowerCase()) // price is re-checked here, never trusted from the browser
    if (!q.available) return Response.json({ error: 'Domain is taken' }, { status: 409 })
    const site = process.env.NEXT_PUBLIC_SITE_URL!
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: q.priceCents, product_data: { name: `${q.domain} (1 year)` } } }],
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },
      metadata: { kind: 'domain', domain: q.domain, appId, costCents: String(q.costCents) },
      success_url: `${site}/?domain=1`,
      cancel_url: `${site}/`,
    })
    return Response.json({ url: session.url })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Could not start purchase' }, { status: 500 })
  }
}

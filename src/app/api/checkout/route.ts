import { getUser } from '@/lib/supabase'
import { stripe, PACKS } from '@/lib/stripe'

export async function POST(req: Request) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { pack } = await req.json()
  const p = PACKS[pack]
  if (!p) return Response.json({ error: 'Unknown pack' }, { status: 400 })

  const site = process.env.NEXT_PUBLIC_SITE_URL!
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: p.priceId, quantity: 1 }],
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    metadata: { pack },
    success_url: `${site}/?paid=1`,
    cancel_url: `${site}/`,
  })
  return Response.json({ url: session.url })
}

import { admin } from '@/lib/supabase'
import { stripe, PACKS } from '@/lib/stripe'
import { fulfillDomain } from '@/lib/fulfill-domain'

export const maxDuration = 60

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')
  const body = await req.text() // raw body is required for signature check
  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return new Response('Bad signature', { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as any
    if (s.metadata?.kind === 'domain') {
      if (s.payment_status !== 'paid') return new Response('ok')
      const { error: dup } = await admin.from('stripe_events').insert({ id: event.id })
      if (dup) return new Response('ok') // already handled
      await fulfillDomain(s)
      return new Response('ok')
    }
    const pack = PACKS[s.metadata?.pack]
    if (s.payment_status === 'paid' && pack && s.client_reference_id) {
      const { error } = await admin.rpc('add_credits', {
        p_user: s.client_reference_id, p_amount: pack.credits, p_event: event.id,
      })
      if (error) { console.error(error); return new Response('Retry', { status: 500 }) }
    }
  }
  return new Response('ok')
}

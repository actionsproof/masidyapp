// SERVER ONLY. Runs after Stripe confirms payment for a domain.
// Buys it, attaches it to the app's project automatically, and refunds on any failure.
import { admin } from './supabase'
import { stripe } from './stripe'
import { registrar, domains } from './providers'

export async function fulfillDomain(s: any) {
  const m = s.metadata
  const userId = s.client_reference_id as string
  const { data: order } = await admin.from('domain_orders')
    .insert({ user_id: userId, app_id: m.appId, domain: m.domain, charged_cents: s.amount_total, stripe_session: s.id })
    .select('id').single()
  try {
    const { data: app } = await admin.from('apps').select('*').eq('id', m.appId).eq('owner_id', userId).single()
    if (!app?.vercel_project_id || app.suspended || app.custom_domain) throw new Error('App not eligible')
    await registrar.buy(m.domain, Number(m.costCents), { ...s.customer_details })
    const r: any = await domains.add(app.vercel_project_id, m.domain)
    await admin.from('apps').update({ custom_domain: m.domain, custom_domain_verified: !!r.verified }).eq('id', app.id)
    await admin.from('domain_orders').update({ status: 'registered' }).eq('id', order!.id)
  } catch (e) {
    console.error(e)
    if (s.payment_intent) await stripe.refunds.create({ payment_intent: s.payment_intent })
    await admin.from('domain_orders').update({ status: 'refunded' }).eq('id', order!.id)
  }
}

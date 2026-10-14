import { admin } from '@/lib/supabase'
import { domains } from '@/lib/providers'

// Vercel Cron calls this every 15 minutes. It marks custom domains verified once DNS is right.
// Limit 10 per run keeps us under Vercel's verification rate limit (50/hour per team).
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Forbidden', { status: 403 })
  const { data } = await admin.from('apps').select('id,custom_domain,vercel_project_id')
    .not('custom_domain', 'is', null).eq('custom_domain_verified', false).not('vercel_project_id', 'is', null)
    .order('domain_checked_at', { ascending: true, nullsFirst: true }).limit(10)
  for (const a of data ?? []) {
    let verified = false
    try { verified = !!((await domains.verify(a.vercel_project_id, a.custom_domain)) as any).verified } catch (e) { console.error(e) }
    await admin.from('apps').update({ custom_domain_verified: verified, domain_checked_at: new Date().toISOString() }).eq('id', a.id)
  }
  await admin.from('preview_tokens').delete().lt('expires_at', new Date().toISOString())
  return Response.json({ checked: data?.length ?? 0 })
}

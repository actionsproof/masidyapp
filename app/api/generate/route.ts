import { admin, getUser, appCapReached } from '@/lib/supabase'
import { generator } from '@/lib/providers'

export const maxDuration = 60
const ATT_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/attachments/`

export async function POST(req: Request) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt, appId, quality, attachments } = await req.json()
  if (typeof prompt !== 'string' || prompt.length < 3 || prompt.length > 2000)
    return Response.json({ error: 'Prompt must be 3-2000 characters' }, { status: 400 })
  if (!process.env.V0_API_KEY)
    return Response.json({ error: 'Generation is not configured yet. Please contact support.' }, { status: 503 })
  const atts: string[] = Array.isArray(attachments) ? attachments.filter((u: any) => typeof u === 'string' && u.startsWith(ATT_PREFIX)).slice(0, 3) : []

  let app: any = null
  if (appId) {
    const { data } = await admin.from('apps').select('*').eq('id', appId).eq('owner_id', user.id).single()
    if (!data || data.suspended) return Response.json({ error: 'App not found' }, { status: 404 })
    if (data.gen_status === 'generating') return Response.json({ error: 'Still working on the last request' }, { status: 409 })
    app = data
  } else if (await appCapReached(user.id)) {
    return Response.json({ error: 'App limit reached' }, { status: 403 })
  }

  const best = quality === 'best'
  const cost = best ? 3 : 1
  const { data: ok } = await admin.rpc('spend_credits', { p_user: user.id, p_amount: cost, p_kind: app ? 'iterate' : 'generate', p_app: app?.id ?? null })
  if (!ok) return Response.json({ error: 'Not enough credits' }, { status: 402 })

  const opts = { model: (best ? process.env.V0_MODEL_BEST : process.env.V0_MODEL_FAST) || undefined, attachments: atts }
  try {
    const gen = { status: 'generating', gen_status: 'generating', gen_charged: cost, gen_started_at: new Date().toISOString() }
    let id = app?.id
    if (app) {
      const prev = await generator.latestVersion(app.v0_chat_id)
      await generator.startIterate(app.v0_chat_id, prompt, opts)
      await admin.from('apps').update({ ...gen, gen_prev_version: prev }).eq('id', app.id)
    } else {
      const r = await generator.startGenerate(prompt, opts)
      const { data } = await admin.from('apps').insert({ owner_id: user.id, name: prompt.slice(0, 60), v0_chat_id: r.chatId, gen_prev_version: null, ...gen }).select('id').single()
      id = data!.id
    }
    return Response.json({ appId: id })
  } catch (e) {
    console.error(e)
    await admin.rpc('refund_credits', { p_user: user.id, p_amount: cost, p_app: app?.id ?? null })
    return Response.json({ error: 'Generation failed' }, { status: 500 })
  }
}

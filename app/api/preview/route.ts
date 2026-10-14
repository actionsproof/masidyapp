import { admin, getUser } from '@/lib/supabase'
import { generator } from '@/lib/providers'
import { mask } from '@/lib/mask'

export async function POST(req: Request) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { appId } = await req.json()
  const { data: app } = await admin.from('apps').select('v0_chat_id').eq('id', appId).eq('owner_id', user.id).single()
  if (!app) return Response.json({ error: 'App not found' }, { status: 404 })
  return Response.json({ previewUrl: await mask(await generator.preview(app.v0_chat_id)) })
}

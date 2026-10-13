import crypto from 'crypto'
import { admin, getUser } from '@/lib/supabase'

const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

// body: { base64, type }. Returns a public address for the image (random name, 4 MB max).
export async function POST(req: Request) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { base64, type } = await req.json()
  const ext = TYPES[type]
  if (!ext || typeof base64 !== 'string' || base64.length > 5_600_000) return Response.json({ error: 'PNG, JPG or WebP up to 4 MB' }, { status: 400 })
  const path = `${user.id}/${crypto.randomBytes(12).toString('hex')}.${ext}`
  const { error } = await admin.storage.from('attachments').upload(path, Buffer.from(base64, 'base64'), { contentType: type })
  if (error) { console.error(error); return Response.json({ error: 'Upload failed' }, { status: 500 }) }
  return Response.json({ url: admin.storage.from('attachments').getPublicUrl(path).data.publicUrl })
}

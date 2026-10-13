import JSZip from 'jszip'
import { admin, getUser, appCapReached } from '@/lib/supabase'
import { generator } from '@/lib/providers'
import { mask } from '@/lib/mask'

export const maxDuration = 120
const SKIP = /^(node_modules|\.git|\.next|\.vercel|dist|build)\//
const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|otf|mp4|mov|mp3|wav|lock)$/i
const REPO_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/

// body: { zipBase64, name } or { repoUrl, branch? }
export async function POST(req: Request) {
  const user = await getUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (await appCapReached(user.id)) return Response.json({ error: 'App limit reached' }, { status: 403 })
  const { zipBase64, repoUrl, branch, name } = await req.json()

  try {
    let r, label = String(name ?? 'Imported app')
    if (typeof repoUrl === 'string') {
      if (!REPO_RE.test(repoUrl)) return Response.json({ error: 'Use a public repo URL like https://github.com/user/repo' }, { status: 400 })
      r = await generator.importRepo(repoUrl.replace(/\/$/, ''), typeof branch === 'string' ? branch : undefined)
      label = repoUrl.split('/').pop() ?? label
    } else if (typeof zipBase64 === 'string' && zipBase64.length < 7_000_000) {
      const zip = await JSZip.loadAsync(Buffer.from(zipBase64, 'base64'))
      const names = Object.keys(zip.files).filter(n => !zip.files[n].dir)
      const top = names.length && names.every(n => n.split('/')[0] === names[0].split('/')[0] && n.includes('/')) ? names[0].split('/')[0] + '/' : ''
      const files: { name: string; content: string }[] = []
      let total = 0
      for (const n of names) {
        const path = top ? n.slice(top.length) : n
        if (!path || path.includes('..') || SKIP.test(path) || BINARY.test(path)) continue
        const content = await zip.files[n].async('string')
        if (content.length > 200_000) continue
        total += content.length
        files.push({ name: path, content })
        if (files.length > 300 || total > 4_000_000) return Response.json({ error: 'Project is too large to import' }, { status: 413 })
      }
      if (!files.length) return Response.json({ error: 'No source files found in the zip' }, { status: 400 })
      r = await generator.importFiles(files)
    } else {
      return Response.json({ error: 'Provide a zip file or a repo URL' }, { status: 400 })
    }
    const { data } = await admin.from('apps').insert({ owner_id: user.id, name: label.slice(0, 80), v0_chat_id: r.chatId, status: 'ready' }).select('id').single()
    return Response.json({ appId: data!.id, previewUrl: await mask(r.previewUrl) })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Import failed' }, { status: 500 })
  }
}

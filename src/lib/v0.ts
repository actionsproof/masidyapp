// ALL v0 calls live here, so switching SDK versions later touches one file.
import { createClient } from 'v0-sdk'

const v0 = createClient({ apiKey: process.env.V0_API_KEY! })

// Docs show slightly different signatures between versions; check types after install.
const shape = (c: any) => ({
  chatId: c.id as string,
  previewUrl: (c.demo ?? null) as string | null,
  versionId: (c.latestVersion?.id ?? null) as string | null,
})

export async function generateApp(prompt: string) {
  return shape(await v0.chats.create({ message: prompt } as any))
}

export async function iterateApp(chatId: string, message: string) {
  return shape(await (v0.chats as any).sendMessage({ chatId, message }))
}

export async function latestVersion(chatId: string) {
  return shape(await (v0.chats as any).getById({ chatId })).versionId
}

export async function deployApp(chatId: string, versionId: string) {
  const d: any = await v0.deployments.create({ chatId, versionId } as any)
  return { deploymentId: d.id as string, url: (d.webUrl ?? null) as string | null, projectId: (d.projectId ?? null) as string | null }
}

export async function getPreview(chatId: string) {
  return shape(await (v0.chats as any).getById({ chatId })).previewUrl
}

// VERIFY: assumes the v0 project exposes its linked Vercel project as `vercelProjectId`.
export async function vercelProjectIdFor(v0ProjectId: string) {
  try {
    const p: any = await (v0.projects as any).getById({ projectId: v0ProjectId })
    return (p.vercelProjectId ?? null) as string | null
  } catch { return null }
}

// ---- chat history, versions, files, fork, import, delete (names VERIFY against installed v0-sdk types) ----
const C = v0.chats as any

export async function listMessages(chatId: string) {
  const r = await C.findMessages({ chatId })
  return ((r.data ?? r) as any[]).map(m => ({ id: m.id, role: m.role, text: String(m.content ?? m.text ?? ''), createdAt: m.createdAt ?? null }))
}

export async function listVersions(chatId: string) {
  const r = await C.findVersions({ chatId })
  return ((r.data ?? r) as any[]).map(v => ({ id: v.id, status: v.status ?? null, createdAt: v.createdAt ?? null, previewUrl: (v.demoUrl ?? null) as string | null }))
}

export async function versionFiles(chatId: string, versionId: string, includeDefaultFiles = false) {
  const v = await C.getVersion({ chatId, versionId, includeDefaultFiles })
  return ((v.files ?? []) as any[]).map(f => ({ name: f.name as string, content: String(f.content ?? '') }))
}

export async function saveFiles(chatId: string, versionId: string, files: { name: string; content: string }[]) {
  await C.updateVersion({ chatId, versionId, files })
}

export async function forkChat(chatId: string, versionId: string) {
  return shape(await C.fork({ chatId, versionId }))
}

export async function importFiles(files: { name: string; content: string }[]) {
  return shape(await (v0.chats as any).init({ type: 'files', files }))
}

export async function importRepo(url: string, branch?: string) {
  return shape(await (v0.chats as any).init({ type: 'repo', repo: { url, branch } }))
}

export async function removeChat(chatId: string) {
  try { await C.delete({ chatId }) } catch (e) { console.error(e) }
}

// ---- async generation, status, stop/resume, models, attachments (VERIFY names/params against v0-sdk types) ----
type Opts = { model?: string; attachments?: string[] }
const params = (message: string, o: Opts) => ({
  message,
  responseMode: 'async',
  ...(o.model ? { modelConfiguration: { modelId: o.model } } : {}),
  ...(o.attachments?.length ? { attachments: o.attachments.map(url => ({ url })) } : {}),
})

export async function startGenerate(prompt: string, o: Opts = {}) {
  const c: any = await (v0.chats as any).create(params(prompt, o))
  return { chatId: c.id as string }
}
export async function startIterate(chatId: string, message: string, o: Opts = {}) {
  await C.sendMessage({ chatId, ...params(message, o) })
}
export async function chatStatus(chatId: string) {
  const c: any = await C.getById({ chatId })
  const s = c.latestVersion?.status
  return {
    state: (s === 'completed' ? 'ready' : s === 'failed' ? 'failed' : 'generating') as 'ready' | 'failed' | 'generating',
    previewUrl: (c.demo ?? c.latestVersion?.demoUrl ?? null) as string | null,
    versionId: (c.latestVersion?.id ?? null) as string | null,
  }
}
async function lastMessageId(chatId: string) {
  const m = (await listMessages(chatId)).filter(x => x.role !== 'user')
  return m.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).at(-1)?.id as string | undefined
}
export async function stopLatest(chatId: string) {
  const messageId = await lastMessageId(chatId); if (messageId) await C.stop({ chatId, messageId })
}
export async function resumeLatest(chatId: string) {
  const messageId = await lastMessageId(chatId); if (messageId) await C.resume({ chatId, messageId })
}

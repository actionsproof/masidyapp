// SERVER ONLY. Domain management through the Vercel SDK (npm i @vercel/sdk).
// VERIFY method names against the installed @vercel/sdk types.
import { Vercel } from '@vercel/sdk'

const vercel = new Vercel({ bearerToken: process.env.VERCEL_TOKEN! })
const teamId = process.env.VERCEL_TEAM_ID || undefined

export const addDomain = (projectId: string, name: string) =>
  vercel.projects.addProjectDomain({ idOrName: projectId, teamId, requestBody: { name } })

export const verifyDomain = (projectId: string, domain: string) =>
  vercel.projects.verifyProjectDomain({ idOrName: projectId, domain, teamId })

export const removeDomain = (projectId: string, domain: string) =>
  vercel.projects.removeProjectDomain({ idOrName: projectId, domain, teamId })

// Environment variables for deployed apps. VERIFY method names against installed @vercel/sdk types.
export const listEnv = async (projectId: string) => {
  const r: any = await (vercel.projects as any).filterProjectEnvs({ idOrName: projectId, teamId })
  return ((r.envs ?? []) as any[]).map(e => ({ id: e.id as string, key: e.key as string }))
}
export const setEnv = (projectId: string, key: string, value: string) =>
  (vercel.projects as any).createProjectEnv({ idOrName: projectId, teamId, upsert: 'true', requestBody: { key, value, type: 'encrypted', target: ['production', 'preview'] } })
export const removeEnv = (projectId: string, id: string) =>
  (vercel.projects as any).removeProjectEnv({ idOrName: projectId, id, teamId })

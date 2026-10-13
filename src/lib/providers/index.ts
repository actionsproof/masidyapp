// Masidy provider layer. The rest of the app never imports a supplier directly.
// To replace a supplier (e.g. use another AI model for generation), change only the wiring here.
import * as v0 from '../v0'
import * as vercel from '../vercel'
import * as reg from '../registrar'

export const generator = {
  generate: v0.generateApp,
  iterate: v0.iterateApp,
  preview: v0.getPreview,
  latestVersion: v0.latestVersion,
  messages: v0.listMessages,
  versions: v0.listVersions,
  files: v0.versionFiles,
  saveFiles: v0.saveFiles,
  fork: v0.forkChat,
  importFiles: v0.importFiles,
  importRepo: v0.importRepo,
  remove: v0.removeChat,
  startGenerate: v0.startGenerate,
  startIterate: v0.startIterate,
  status: v0.chatStatus,
  stop: v0.stopLatest,
  resume: v0.resumeLatest,
}

export const host = {
  deploy: v0.deployApp,
  vercelProjectId: v0.vercelProjectIdFor,
}

export const domains = {
  add: vercel.addDomain,
  verify: vercel.verifyDomain,
  remove: vercel.removeDomain,
}

export const env = { list: vercel.listEnv, set: vercel.setEnv, remove: vercel.removeEnv }

export const registrar = { quote: reg.quote, buy: reg.buy }

// Per-app backends (database/auth for the apps users build). Not connected yet.
// Wire this to a partner API once you have an agreement (see README, launch blockers).
export const backend = {
  provision: async (_appId: string): Promise<never> => {
    throw new Error('Backend provider not configured')
  },
}

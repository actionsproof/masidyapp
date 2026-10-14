'use client'
import { useCallback, useEffect, useState } from 'react'
import { realtimeSupabase, supabase as sb } from '@/lib/browser-supabase'

// Sign-in and data calls go through /sb on our own domain, so the browser never contacts the database supplier directly.
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? ''
const AUTH_REDIRECT = process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL

function authRedirectUrl() {
  if (typeof window !== 'undefined') return `${window.location.origin}/auth/callback`
  return AUTH_REDIRECT || undefined
}

// Masidy address first; the custom domain takes over once DNS is verified.
const primaryUrl = (a: any) => a.custom_domain && a.custom_domain_verified ? `https://${a.custom_domain}` : a.subdomain ? `https://${a.subdomain}.${ROOT}` : null

type Tab = 'preview' | 'code' | 'chat' | 'versions' | 'share'
type WorkspaceSection = 'home' | 'projects' | 'chats' | 'design-systems' | 'templates'

export default function Home() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [prompt, setPrompt] = useState('')
  const [landingFiles, setLandingFiles] = useState<File[]>([])
  const [apps, setApps] = useState<any[]>([])
  const [credits, setCredits] = useState<number | null>(null)
  const [appId, setAppId] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [previewKey, setPreviewKey] = useState(0)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('preview')
  const [files, setFiles] = useState<{ name: string; content: string }[]>([])
  const [fileVersion, setFileVersion] = useState<string | null>(null)
  const [fileSel, setFileSel] = useState<string | null>(null)
  const [fileText, setFileText] = useState('')
  const [chat, setChat] = useState<any[]>([])
  const [versions, setVersions] = useState<any[]>([])
  const [ghUrl, setGhUrl] = useState<string | null>(null)
  const [repoUrl, setRepoUrl] = useState('')
  const [sub, setSub] = useState('')
  const [custom, setCustom] = useState('')
  const [dns, setDns] = useState<any>(null)
  const [buyName, setBuyName] = useState('')
  const [quote, setQuote] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [generating, setGenerating] = useState(false)
  const [quality, setQuality] = useState<'fast' | 'best'>('fast')
  const [attachments, setAttachments] = useState<string[]>([])
  const [envKeys, setEnvKeys] = useState<string[]>([])
  const [envKey, setEnvKey] = useState('')
  const [envVal, setEnvVal] = useState('')
  const [launchAfterAuth, setLaunchAfterAuth] = useState(false)
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection>('home')
  const [projectSearch, setProjectSearch] = useState('')

  const load = useCallback(async () => {
    const a = await sb.from('apps').select('id,name,status,subdomain,custom_domain,custom_domain_verified,github_repo,gen_status').order('created_at', { ascending: false })
    setApps(a.data ?? [])
    const p = await sb.from('profiles').select('credits').single()
    setCredits(p.data?.credits ?? null)
  }, [])

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => { if (session) load() }, [session, load])
  useEffect(() => {
    const userId = session?.user?.id
    const accessToken = session?.access_token
    if (!userId || !accessToken) return

    let hasConnected = false
    let cancelled = false
    let channel: ReturnType<typeof realtimeSupabase.channel> | undefined

    void (async () => {
      await realtimeSupabase.realtime.setAuth(accessToken)
      if (cancelled) return

      channel = realtimeSupabase.channel(`workspace:apps:${userId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'apps',
          filter: `owner_id=eq.${userId}`,
        }, () => { void load() })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            if (hasConnected) void load()
            hasConnected = true
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setMsg('Live app updates are unavailable. Refresh to sync your workspace.')
          }
        })
    })()

    return () => {
      cancelled = true
      if (channel) void realtimeSupabase.removeChannel(channel)
    }
  }, [session?.user?.id, session?.access_token, load])
  useEffect(() => {
    if (!session || !launchAfterAuth || !prompt.trim()) return
    let cancelled = false
    ;(async () => {
      setMsg('Opening your Masidy workspace…')
      for (const file of landingFiles) await attach(file)
      if (!cancelled) {
        setLaunchAfterAuth(false)
        await generate()
      }
    })()
    return () => { cancelled = true }
  }, [session, launchAfterAuth]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // finish sign-in from the email link (the link stays on our own domain)
    const q = new URLSearchParams(location.search)
    const code = q.get('code')
    const tokenHash = q.get('token_hash')
    const type = q.get('type')
    if (code) {
      sb.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) setMsg(error.message)
        else history.replaceState(null, '', '/')
      })
    } else if (tokenHash && type) {
      sb.auth.verifyOtp({ token_hash: tokenHash, type: type as any }).then(({ error }) => {
        if (error) setMsg(error.message)
        else history.replaceState(null, '', '/')
      })
    }
  }, [])

  const auth = () => ({ Authorization: `Bearer ${session.access_token}` })

  async function call(path: string, body: object) {
    setBusy(true); setMsg('')
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() }, body: JSON.stringify(body) })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg(json.error ?? 'Error'); return null }
    return json
  }
  async function get(path: string) {
    const res = await fetch(path, { headers: auth() })
    if (!res.ok) { setMsg((await res.json().catch(() => ({}))).error ?? 'Error'); return null }
    return res
  }

  // load tab data when tab or app changes
  useEffect(() => {
    if (!session || !appId) return
    ;(async () => {
      if (tab === 'chat') { const r = await get(`/api/app/${appId}/messages`); if (r) setChat((await r.json()).messages) }
      if (tab === 'versions') { const r = await get(`/api/app/${appId}/versions`); if (r) setVersions((await r.json()).versions) }
      if (tab === 'share') { const r = await get(`/api/app/${appId}/env`); if (r) setEnvKeys((await r.json()).keys) }
      if (tab === 'code') {
        const r = await get(`/api/app/${appId}/files`)
        if (r) { const j = await r.json(); setFiles(j.files); setFileVersion(j.version); const f = j.files[0]; setFileSel(f?.name ?? null); setFileText(f?.content ?? '') }
      }
    })()
  }, [tab, appId, session]) // eslint-disable-line

  async function open(id: string) {
    const a = apps.find(x => x.id === id)
    setAppId(id); setPreview(null); setDns(null); setGhUrl(a?.github_repo ? 'linked' : null); setTab('preview')
    setLiveUrl(a ? primaryUrl(a) : null)
    const r = await call('/api/preview', { appId: id })
    if (r) setPreview(r.previewUrl)
    if (a?.gen_status === 'generating') poll(id)
  }
  async function poll(id: string) {
    setGenerating(true)
    for (let i = 0; i < 240; i++) {
      await new Promise(r => setTimeout(r, 2500))
      const r = await get(`/api/app/${id}/status`); if (!r) break
      const j = await r.json()
      if (j.status !== 'generating') {
        if (j.previewUrl) { setPreview(j.previewUrl); setPreviewKey(k => k + 1) }
        setMsg(j.status === 'failed' ? 'Generation failed. Your credits were returned.' : '')
        break
      }
    }
    setGenerating(false); load()
  }
  async function generate() {
    const r = await call('/api/generate', { prompt, appId, quality, attachments })
    if (r) { setAppId(r.appId); setPrompt(''); setAttachments([]); setTab('preview'); await load(); poll(r.appId) }
  }
  async function stop() { await call(`/api/app/${appId}/stop`, {}) }
  async function resume() { const r = await call(`/api/app/${appId}/resume`, {}); if (r) poll(appId!) }
  async function attach(f: File) {
    const bytes = new Uint8Array(await f.arrayBuffer()); let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    const r = await call('/api/upload', { base64: btoa(bin), type: f.type })
    if (r) setAttachments(a => [...a, r.url].slice(0, 3))
  }
  async function saveEnv() {
    const r = await call(`/api/app/${appId}/env-set`, { key: envKey, value: envVal })
    if (r) { setEnvKeys(k => Array.from(new Set([...k, envKey]))); setEnvVal(''); setMsg('Saved. Deploy again to apply.') }
  }
  async function removeEnvVar() {
    const r = await call(`/api/app/${appId}/env-delete`, { key: envKey })
    if (r) setEnvKeys(k => k.filter(x => x !== envKey))
  }
  async function deploy(versionId?: string) {
    const r = await call('/api/deploy', { appId, versionId })
    if (r) { setLiveUrl(r.url); load() }
  }
  async function saveFile() {
    const r = await call(`/api/app/${appId}/save`, { version: fileVersion, path: fileSel, content: fileText })
    if (r) { setFiles(fs => fs.map(f => f.name === fileSel ? { ...f, content: fileText } : f)); setPreviewKey(k => k + 1); setMsg('Saved') }
  }
  async function fork(version: string) {
    const r = await call(`/api/app/${appId}/fork`, { version })
    if (r) { await load(); setAppId(r.appId); setPreview(r.previewUrl); setTab('preview') }
  }
  async function download() {
    const r = await get(`/api/app/${appId}/download`); if (!r) return
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = 'masidy-app.zip'; a.click()
  }
  async function githubConnect() { const r = await call('/api/github/connect', {}); if (r?.url) location.href = r.url }
  async function githubPush() { const r = await call(`/api/app/${appId}/github-push`, {}); if (r) setGhUrl(r.url) }
  async function importZip(f: File) {
    const bytes = new Uint8Array(await f.arrayBuffer()); let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    const r = await call('/api/import', { zipBase64: btoa(bin), name: f.name.replace(/\.zip$/i, '') })
    if (r) { await load(); setAppId(r.appId); setPreview(r.previewUrl); setTab('preview') }
  }
  async function importRepo() {
    const r = await call('/api/import', { repoUrl })
    if (r) { await load(); setAppId(r.appId); setPreview(r.previewUrl); setRepoUrl(''); setTab('preview') }
  }
  async function remove() {
    if (!confirm('Delete this app? Its addresses will stop working.')) return
    const r = await call(`/api/app/${appId}/delete`, {})
    if (r) { setAppId(null); setPreview(null); setLiveUrl(null); load() }
  }
  async function buy(pack: string) { const r = await call('/api/checkout', { pack }); if (r?.url) location.href = r.url }
  async function search() { const r = await call('/api/domains/search', { name: buyName }); if (r) setQuote(r) }
  async function purchase() { const r = await call('/api/domains/purchase', { appId, domain: quote.domain }); if (r?.url) location.href = r.url }
  async function domain(body: object) {
    const r = await call('/api/domains', { appId, ...body })
    if (!r) return
    if (r.url) setLiveUrl(r.url)
    if (r.records) setDns(r)
    load()
  }
  function startFromLanding(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim()) return
    setLaunchAfterAuth(true)
    document.getElementById('signin')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setMsg(landingFiles.length ? `Your prompt and ${landingFiles.length} file${landingFiles.length === 1 ? '' : 's'} are ready. Continue with email to open your workspace.` : 'Your prompt is ready. Continue with email to open your workspace.')
  }

  if (!session) return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="Primary navigation">
        <a className="wordmark" href="/" aria-label="Masidy home"><span className="wordmark-mark">M</span> masidy</a>
        <div className="landing-links"><a href="#workflow">How it works</a><a href="#capabilities">Capabilities</a><a href="#signin">Sign in</a></div>
        <a className="nav-cta" href="#signin">Start building <span aria-hidden="true">↗</span></a>
      </nav>
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> The private AI workspace for shipping software</p>
          <h1 id="landing-title">Build the thing<br /><em>you&apos;ve been thinking about.</em></h1>
          <p className="hero-lede">Masidy turns plain language into a real, editable application. Explore the result, refine the code, connect your data, and deploy when it&apos;s ready.</p>
          <form className="landing-composer" onSubmit={startFromLanding}>
            <label htmlFor="landing-prompt">What do you want to build?</label>
            <textarea id="landing-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="A customer portal with sign-in, billing, and a clean dashboard..." rows={3} />
            <div className="composer-actions">
              <label className="attach-action" htmlFor="landing-files">Attach files <span aria-hidden="true">+</span></label>
              <input id="landing-files" type="file" multiple accept=".zip,.pdf,.txt,.md,.csv,.json,.png,.jpg,.jpeg" onChange={e => setLandingFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
              <span className="attachment-count">{landingFiles.length ? `${landingFiles.length} attached` : 'ZIP, docs, images'}</span>
              <button className="composer-submit" type="submit">Start with Masidy <span aria-hidden="true">→</span></button>
            </div>
          </form>
          <div className="hero-actions"><a className="text-cta" href="#workflow">See how it works <span aria-hidden="true">↓</span></a><a className="text-cta" href="#signin">Already have an account? Sign in <span aria-hidden="true">→</span></a></div>
          <p className="trust-line">No setup maze. No provider logos. Just your product, under your brand.</p>
        </div>
        <div className="hero-workspace" aria-label="Preview of the Masidy workspace">
          <div className="window-bar"><span className="window-dots"><i /><i /><i /></span><span>masidy / new project</span><span className="window-status"><span className="live-dot" /> ready</span></div>
          <div className="workspace-body"><aside className="mini-sidebar"><strong>masidy</strong><span className="mini-new">+ New project</span><small>PROJECTS</small><span className="mini-active">SaaS dashboard</span><span>Landing page</span><span>Mobile companion</span><small>WORKSPACE</small><span>Settings</span></aside><div className="mini-main"><div className="mini-prompt"><span>Describe what you want to build...</span><b>↗</b></div><div className="mini-canvas"><div className="canvas-label">LIVE PREVIEW</div><div className="canvas-card"><span className="canvas-kicker">GOOD MORNING, ALEX</span><strong>Your work,<br />in one clear view.</strong><div className="canvas-bars"><i /><i /><i /><i /></div></div></div><div className="mini-tabs"><b>Preview</b><span>Code</span><span>Versions</span><span>Deploy</span></div></div></div>
        </div>
      </section>
      <section className="proof-strip"><span>From first prompt to live product</span><b>01 / imagine</b><b>02 / refine</b><b>03 / ship</b></section>
      <section id="workflow" className="landing-section"><p className="section-index">01 / THE WORKFLOW</p><div><h2>One workspace.<br /><em>Every step.</em></h2><p className="section-copy">Start with a sentence and stay in the flow. Masidy keeps the messy parts—files, data, environments, versions—close at hand without putting them in your way.</p></div></section>
      <section id="capabilities" className="capability-grid"><article><span>01</span><h3>Generate</h3><p>Describe a product or a change. Get a working interface and the foundations behind it.</p></article><article><span>02</span><h3>Shape</h3><p>Use the built-in preview, code editor, chat, and versions to make it yours.</p></article><article><span>03</span><h3>Ship</h3><p>Connect your environment, share a branded URL, and deploy the version you trust.</p></article></section>
      <section id="signin" className="signin-section"><div><p className="eyebrow">Masidy / Build studio</p><h2>Your next project<br /><em>starts here.</em></h2><p>Sign in to open your workspace or create your first project.</p></div><div className="auth-card"><div className="brand-mark" aria-hidden="true">M</div><h3>Open your workspace</h3><p className="auth-copy">We&apos;ll send a secure magic link. No password to remember.</p><form onSubmit={async e => { e.preventDefault(); const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: authRedirectUrl() } }); setMsg(error ? error.message : 'Check your email for the login link') }}><label htmlFor="email">Your email</label><input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" /><button type="submit">Continue with email <span aria-hidden="true">→</span></button></form>{msg && <p className="status-message" role="status">{msg}</p>}</div></section>
      <footer className="landing-footer"><a className="wordmark" href="/" aria-label="Masidy home"><span className="wordmark-mark">M</span> masidy</a><span>Private software creation, made simple.</span><span>© 2026 Masidy</span></footer>
    </main>
  )

  const cur = apps.find(a => a.id === appId)
  const tabs: Tab[] = ['preview', 'code', 'chat', 'versions', 'share']
  const visibleApps = apps.filter(a => a.name.toLowerCase().includes(projectSearch.toLowerCase()))
  const templates = [
    { name: 'SaaS dashboard', description: 'A polished product dashboard with navigation and data cards.', prompt: 'Build a polished SaaS dashboard with a sidebar, top navigation, summary cards, and a responsive analytics view.' },
    { name: 'Landing page', description: 'A focused, responsive marketing page for a product.', prompt: 'Build a modern, responsive product landing page with a clear hero, benefits, social proof, and a strong call to action.' },
    { name: 'Customer portal', description: 'A simple customer area for account and billing tasks.', prompt: 'Build a clean customer portal with account overview, billing details, and an easy-to-use responsive layout.' },
  ]
  const designDirections = [
    { name: 'Quiet minimal', description: 'Restrained color, crisp type, generous spacing.', prompt: 'Use a quiet minimal design system: neutral surfaces, crisp typography, generous spacing, and subtle borders.' },
    { name: 'Warm editorial', description: 'Warm paper tones, expressive type, human details.', prompt: 'Use a warm editorial design system: soft paper backgrounds, expressive typography, warm accent colors, and considered details.' },
    { name: 'Bold product', description: 'Strong contrast, clear hierarchy, confident accents.', prompt: 'Use a bold product design system: high contrast, strong hierarchy, confident accent color, and clear interactive states.' },
  ]

  return (
    <main className="studio-shell">
      <aside className="studio-sidebar">
        <div className="studio-brand"><span className="studio-brand-mark">M</span><strong>masidy&apos;s projects</strong><span className="studio-brand-caret">⌄</span></div>
        <button className="studio-new-chat" onClick={() => { setAppId(null); setPreview(null); setLiveUrl(null); setDns(null); setWorkspaceSection('home'); setTab('preview') }}>New Chat <span>⌄</span></button>
        <label className="studio-search"><span aria-hidden="true">⌕</span><input value={projectSearch} onChange={e => setProjectSearch(e.target.value)} placeholder="Search" aria-label="Search projects" /></label>
        <nav className="studio-nav" aria-label="Workspace">
          {([
            ['home', '⌂', 'Home'],
            ['projects', '▦', 'Projects'],
            ['chats', '☷', 'Chats'],
            ['design-systems', '◈', 'Design Systems'],
            ['templates', '▤', 'Templates'],
          ] as const).map(([section, icon, label]) => (
            <button key={section} className={workspaceSection === section ? 'active' : ''} onClick={() => setWorkspaceSection(section)}>
              <span aria-hidden="true">{icon}</span>{label}
            </button>
          ))}
        </nav>
        <details className="studio-import-menu">
          <summary>Import a project</summary>
          <div className="studio-import-controls">
            <label>ZIP file<input type="file" accept=".zip" onChange={e => e.target.files?.[0] && void importZip(e.target.files[0])} /></label>
            <input value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="Public GitHub repository URL" aria-label="Public GitHub repository URL" />
            <button disabled={busy || !repoUrl} onClick={() => void importRepo()}>Import repository</button>
          </div>
        </details>
        <div className="studio-side-group">
          <h3>Favorites</h3>
          {apps.slice(0, 1).map(a => <button className="studio-side-item" key={a.id} onClick={() => { void open(a.id); setWorkspaceSection('home') }}>☆ <span>{a.name}</span></button>)}
          {!apps.length && <p className="studio-side-empty">Projects you open will show here.</p>}
        </div>
        <div className="studio-side-group studio-project-list">
          <div className="studio-side-heading"><h3>Projects</h3><span>{visibleApps.length}</span></div>
          {visibleApps.map(a => <button className={`studio-side-item ${a.id === appId ? 'selected' : ''}`} key={a.id} onClick={() => { void open(a.id); setWorkspaceSection('home') }}><span className="studio-project-dot">{a.name.slice(0, 1).toUpperCase()}</span><span>{a.name}</span></button>)}
          {!visibleApps.length && <p className="studio-side-empty">{projectSearch ? 'No matching projects.' : 'No projects yet.'}</p>}
        </div>
        <div className="studio-account">
          <div><strong>{session?.user?.email?.split('@')[0] ?? 'Your account'}</strong><span>{credits ?? '…'} credits</span></div>
          <button className="studio-credit-button" onClick={() => buy('starter')} aria-label="Buy 50 credits" title="Buy 50 credits">50</button>
          <button className="studio-credit-button" onClick={() => buy('pro')} aria-label="Buy 200 credits" title="Buy 200 credits">200</button>
          <button className="studio-logout" onClick={() => sb.auth.signOut()}>Log out</button>
        </div>
      </aside>

      <section className="studio-main">
        <header className="studio-topbar">
          <div className="studio-breadcrumb">
            {cur ? <><button onClick={() => setWorkspaceSection('projects')}>{cur.name}</button><span>›</span><span>{workspaceSection === 'home' ? tabs.find(t => t === tab)?.replace(/^./, x => x.toUpperCase()) : workspaceSection.replace('-', ' ')}</span></> : <><span className="studio-avatar">{session?.user?.email?.slice(0, 1).toUpperCase() ?? 'M'}</span><strong>{session?.user?.email?.split('@')[0] ?? 'Your'}&apos;s workspace</strong></>}
          </div>
          {cur && <div className="studio-top-actions"><button className="studio-quiet-button" onClick={() => setTab('share')}>Settings</button><button className="studio-icon-button" onClick={() => setWorkspaceSection('projects')} aria-label="Projects">＋</button><button className="studio-publish" disabled={busy || generating} onClick={() => deploy()}>↗ <span>Publish</span></button></div>}
        </header>

        {workspaceSection === 'home' && !appId && (
          <div className="studio-home">
            <div className="studio-home-content">
              <div className="studio-provider-pill"><span>✳</span> Build with Masidy AI</div>
              <h1>What do you want to create?</h1>
              <div className="studio-composer">
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Ask Masidy to build..." rows={3} aria-label="Describe what you want to build" />
                <div className="studio-composer-actions">
                  <label className="studio-attach-button" title="Attach images">＋<input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => Array.from(e.target.files ?? []).forEach(attach)} /></label>
                  <select value={quality} onChange={e => setQuality(e.target.value as 'fast' | 'best')} aria-label="Generation quality"><option value="fast">Fast · 1 credit</option><option value="best">Best · 3 credits</option></select>
                  <span className="studio-composer-spacer" />
                  <select aria-label="Project type" defaultValue="project"><option value="project">Project</option></select>
                  <button className="studio-generate" disabled={busy || generating || prompt.trim().length < 3} onClick={() => void generate()}>{generating ? 'Working…' : 'Generate'} <span>↗</span></button>
                </div>
              </div>
              {attachments.length > 0 && <div className="studio-attachment-note">{attachments.length} image{attachments.length === 1 ? '' : 's'} attached <button onClick={() => setAttachments([])}>Remove</button></div>}
              {(msg || !apps.length) && <p className="studio-status" role="status">{msg || 'Your projects will appear in the sidebar. Start by describing what you want to build.'}</p>}
              <div className="studio-home-shortcuts"><button onClick={() => setWorkspaceSection('projects')}>Browse projects <span>→</span></button><button onClick={() => setWorkspaceSection('templates')}>Start from a template <span>→</span></button></div>
            </div>
          </div>
        )}

        {workspaceSection === 'projects' && (
          <div className="studio-library">
            <div className="studio-library-heading"><div><p className="studio-kicker">WORKSPACE</p><h1>Your projects</h1><p>Open a project to continue in its preview, editor, chat, and version history.</p></div><button onClick={() => { setAppId(null); setWorkspaceSection('home') }}>＋ New project</button></div>
            {visibleApps.length ? <div className="studio-project-grid">{visibleApps.map(a => <button className="studio-project-card" key={a.id} onClick={() => { void open(a.id); setWorkspaceSection('home') }}><div className="studio-project-card-icon">{a.name.slice(0, 1).toUpperCase()}</div><div><strong>{a.name}</strong><span>{a.status || 'Project'}{a.gen_status === 'generating' ? ' · Generating' : ''}</span></div><span className="studio-card-arrow">↗</span></button>)}</div> : <div className="studio-empty-card"><span>▦</span><h2>No projects yet</h2><p>Create a project from a prompt or import an existing ZIP or public GitHub repository.</p><button onClick={() => { setAppId(null); setWorkspaceSection('home') }}>Create a project</button><details><summary>Import a project instead</summary><div className="studio-import-controls"><label>ZIP file<input type="file" accept=".zip" onChange={e => e.target.files?.[0] && void importZip(e.target.files[0])} /></label><input value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="Public GitHub repository URL" /><button disabled={busy || !repoUrl} onClick={() => void importRepo()}>Import repository</button></div></details></div>}
          </div>
        )}

        {workspaceSection === 'chats' && (
          <div className="studio-library">
            <div className="studio-library-heading"><div><p className="studio-kicker">WORKSPACE</p><h1>Chats</h1><p>Choose a project to view its conversation history.</p></div></div>
            {visibleApps.length ? <div className="studio-project-grid">{visibleApps.map(a => <button className="studio-project-card" key={a.id} onClick={() => { void open(a.id); setWorkspaceSection('home'); setTab('chat') }}><div className="studio-project-card-icon">☷</div><div><strong>{a.name}</strong><span>Open project chat</span></div><span className="studio-card-arrow">→</span></button>)}</div> : <div className="studio-empty-card"><span>☷</span><h2>No project chats</h2><p>Chats are saved with their projects. Create or import a project to get started.</p></div>}
          </div>
        )}

        {workspaceSection === 'templates' && (
          <div className="studio-library">
            <div className="studio-library-heading"><div><p className="studio-kicker">GET STARTED</p><h1>Templates</h1><p>Choose a starting point, then customize it with your own prompt.</p></div></div>
            <div className="studio-template-grid">{templates.map((item, index) => <article className="studio-template-card" key={item.name}><div className={`studio-template-art art-${index + 1}`}><span>{item.name}</span></div><h2>{item.name}</h2><p>{item.description}</p><button onClick={() => { setPrompt(item.prompt); setAppId(null); setWorkspaceSection('home') }}>Use template <span>→</span></button></article>)}</div>
          </div>
        )}

        {workspaceSection === 'design-systems' && (
          <div className="studio-library">
            <div className="studio-library-heading"><div><p className="studio-kicker">DESIGN</p><h1>Design directions</h1><p>Choose a visual direction to add to your next build prompt. These are prompt presets, not saved design-system files.</p></div></div>
            <div className="studio-template-grid">{designDirections.map((item, index) => <article className="studio-template-card" key={item.name}><div className={`studio-template-art direction-${index + 1}`}><span>{item.name}</span></div><h2>{item.name}</h2><p>{item.description}</p><button onClick={() => { setPrompt(current => `${current.trim()}${current.trim() ? '\n\n' : ''}${item.prompt}`); setAppId(null); setWorkspaceSection('home') }}>Use direction <span>→</span></button></article>)}</div>
          </div>
        )}

        {workspaceSection === 'home' && appId && (
          <div className="studio-project-workspace">
            <div className="studio-project-header">
              <div><p className="studio-kicker">{cur?.status || 'PROJECT'}</p><h1>{cur?.name || 'Project'}</h1></div>
              {liveUrl && <a className="studio-live-link" href={liveUrl} target="_blank" rel="noreferrer">Open live app ↗</a>}
            </div>
            <div className="studio-tabbar" role="tablist" aria-label="Project tools">
              {tabs.map(t => <button role="tab" aria-selected={t === tab} className={t === tab ? 'active' : ''} key={t} onClick={() => setTab(t)}>{t === 'preview' ? '◉' : t === 'code' ? '</>' : t === 'chat' ? '☷' : t === 'versions' ? '◷' : '↗'} <span>{t[0].toUpperCase() + t.slice(1)}</span></button>)}
              <span className="studio-tab-spacer" />
              <button className="studio-deploy-secondary" disabled={busy || generating} onClick={() => void deploy()}>Publish</button>
            </div>
            <div className="studio-project-prompt">
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={2} placeholder="Ask for a change to this project..." aria-label="Describe a project change" />
              <div><select value={quality} onChange={e => setQuality(e.target.value as 'fast' | 'best')} aria-label="Generation quality"><option value="fast">Fast · 1 credit</option><option value="best">Best · 3 credits</option></select><label className="studio-attach-button" title="Attach images">＋<input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => Array.from(e.target.files ?? []).forEach(attach)} /></label><button disabled={busy || generating || prompt.trim().length < 3} onClick={() => void generate()}>{generating ? 'Working…' : 'Update project'}</button>{generating && <button className="studio-quiet-button" onClick={() => void stop()}>Stop</button>}{!generating && cur?.gen_status === 'failed' && <button className="studio-quiet-button" onClick={() => void resume()}>Resume</button>}</div>
            </div>
            {msg && <p className="studio-status" role="status">{msg}</p>}
            <div className="studio-project-canvas">
              {tab === 'preview' && (preview ? <iframe key={previewKey} title={`${cur?.name || 'Project'} preview`} src={preview} /> : <div className="studio-loading">Loading project preview…</div>)}
              {tab === 'code' && <div className="studio-code-layout"><div className="studio-file-tree"><h2>Files</h2>{files.map(f => <button className={f.name === fileSel ? 'selected' : ''} key={f.name} onClick={() => { setFileSel(f.name); setFileText(f.content) }}>▤ <span>{f.name}</span></button>)}{!files.length && <p>Loading files…</p>}</div><div className="studio-code-editor"><div className="studio-editor-title">{fileSel || 'Select a file'}</div><textarea value={fileText} onChange={e => setFileText(e.target.value)} spellCheck={false} aria-label="File contents" /><div className="studio-editor-footer"><span>Changes are saved to a new project version.</span><button disabled={busy || !fileSel} onClick={() => void saveFile()}>Save file</button></div></div></div>}
              {tab === 'chat' && <div className="studio-chat-history">{chat.map(m => <article className={`studio-message ${m.role === 'user' ? 'from-user' : ''}`} key={m.id}><strong>{m.role === 'user' ? 'You' : 'Masidy'}</strong><p>{m.text}</p></article>)}{!chat.length && <div className="studio-empty-inline"><h2>No messages yet</h2><p>Start a conversation by describing a change in the prompt above.</p></div>}</div>}
              {tab === 'versions' && <div className="studio-version-list">{versions.map((v, i) => <article className="studio-version-card" key={v.id}><div><strong>Version {versions.length - i}</strong><span>{v.createdAt ? new Date(v.createdAt).toLocaleString() : 'Saved version'}</span></div><div>{v.previewUrl && <button className="studio-quiet-button" onClick={() => { setPreview(v.previewUrl); setPreviewKey(k => k + 1); setTab('preview') }}>Preview</button>}<button className="studio-quiet-button" disabled={busy} onClick={() => void fork(v.id)}>Restore as new app</button><button disabled={busy} onClick={() => void deploy(v.id)}>Publish this version</button></div></article>)}{!versions.length && <div className="studio-empty-inline"><h2>No saved versions</h2><p>Versions will appear here after you save project changes.</p></div>}</div>}
              {tab === 'share' && <div className="studio-settings">
                <section className="studio-settings-card"><h2>Share project</h2><p>Download your project files or push them to a GitHub repository.</p><div className="studio-setting-actions"><button onClick={() => void download()}>Download ZIP</button><button className="studio-quiet-button" onClick={() => void githubConnect()}>Connect GitHub</button><button className="studio-quiet-button" disabled={busy} onClick={() => void githubPush()}>Push to GitHub</button>{ghUrl && ghUrl !== 'linked' && <a href={ghUrl} target="_blank" rel="noreferrer">{ghUrl}</a>}{ghUrl === 'linked' && <span>Linked to a repository.</span>}</div></section>
                <details className="studio-settings-card"><summary>Domains</summary><div className="studio-setting-fields"><div><label>Masidy subdomain</label><div className="studio-inline-field"><input value={sub} onChange={e => setSub(e.target.value)} placeholder="myapp" /><span>.{ROOT}</span><button disabled={busy} onClick={() => void domain({ subdomain: sub })}>Set</button></div></div><div><label>Custom domain</label><div className="studio-inline-field"><input value={custom} onChange={e => setCustom(e.target.value)} placeholder="mydomain.com" /><button disabled={busy} onClick={() => void domain({ customDomain: custom })}>Add</button><button className="studio-quiet-button" disabled={busy} onClick={() => void domain({ action: 'verify' })}>Check DNS</button></div></div><div><label>Find a domain</label><div className="studio-inline-field"><input value={buyName} onChange={e => setBuyName(e.target.value)} placeholder="mybrand.com" /><button disabled={busy} onClick={() => void search()}>Search</button>{quote && (quote.available ? <span>{quote.domain} · ${(quote.priceCents / 100).toFixed(2)}/yr <button disabled={busy} onClick={() => void purchase()}>Buy</button></span> : <span>Domain unavailable</span>)}</div></div>{dns && (dns.verified ? <p>Domain verified.</p> : <div><p>Add these DNS records, then check again.</p>{(dns.records ?? []).map((r: any, i: number) => <pre key={i}>{`Type: ${r.type}\nName: ${r.name}\nValue: ${r.value}`}</pre>)}</div>)}</div></details>
                <details className="studio-settings-card"><summary>Environment variables</summary><p>{envKeys.length ? envKeys.join(', ') : 'None set. Deploy the project before adding keys.'}</p><div className="studio-inline-field"><input value={envKey} onChange={e => setEnvKey(e.target.value.toUpperCase())} placeholder="KEY" /><input value={envVal} onChange={e => setEnvVal(e.target.value)} placeholder="Value" type="password" /><button disabled={busy || !envKey} onClick={() => void saveEnv()}>Save</button><button className="studio-quiet-button" disabled={busy || !envKey} onClick={() => void removeEnvVar()}>Remove</button></div><p>Changes apply the next time you publish.</p></details>
                <section className="studio-settings-card studio-danger-zone"><h2>Delete project</h2><p>This permanently removes the project and its hosted addresses.</p><button className="studio-danger-button" disabled={busy} onClick={() => void remove()}>Delete project</button></section>
              </div>}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

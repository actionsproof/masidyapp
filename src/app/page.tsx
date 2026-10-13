'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// Sign-in and data calls go through /sb on our own domain, so the browser never contacts the database supplier directly.
const sb = createClient(typeof window !== 'undefined' ? `${window.location.origin}/sb` : process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? ''

// Masidy address first; the custom domain takes over once DNS is verified.
const primaryUrl = (a: any) => a.custom_domain && a.custom_domain_verified ? `https://${a.custom_domain}` : a.subdomain ? `https://${a.subdomain}.${ROOT}` : null

type Tab = 'preview' | 'code' | 'chat' | 'versions' | 'share'

export default function Home() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [prompt, setPrompt] = useState('')
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
  useEffect(() => { // finish sign-in from the email link (the link stays on our own domain)
    const q = new URLSearchParams(location.search); const th = q.get('token_hash'); const type = q.get('type')
    if (th && type) sb.auth.verifyOtp({ token_hash: th, type: type as any }).then(() => history.replaceState(null, '', '/'))
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

  if (!session) return (
    <main style={{ maxWidth: 400, margin: '20vh auto', padding: 16 }}>
      <h1>Sign in to Masidy</h1>
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" style={{ width: '100%', padding: 8 }} />
      <button onClick={async () => { await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } }); setMsg('Check your email for the login link') }}>Send magic link</button>
      <p>{msg}</p>
    </main>
  )

  const cur = apps.find(a => a.id === appId)
  const tabs: Tab[] = ['preview', 'code', 'chat', 'versions', 'share']

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16, display: 'grid', gridTemplateColumns: '230px 1fr', gap: 16 }}>
      <aside>
        <h2 style={{ margin: '0 0 8px' }}>Masidy</h2>
        <p>Credits: <b>{credits ?? '...'}</b> <button onClick={() => sb.auth.signOut()}>Log out</button></p>
        <p><button onClick={() => buy('starter')}>Buy 50 credits</button> <button onClick={() => buy('pro')}>Buy 200</button></p>
        <button onClick={() => { setAppId(null); setPreview(null); setLiveUrl(null); setDns(null); setTab('preview') }}>+ New app</button>
        <details><summary>Import</summary>
          <p>Zip file: <input type="file" accept=".zip" onChange={e => e.target.files?.[0] && importZip(e.target.files[0])} /></p>
          <input value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="github.com/user/repo (public)" style={{ width: '100%' }} />
          <button disabled={busy || !repoUrl} onClick={importRepo}>Import repo</button>
        </details>
        <ul style={{ padding: 0, listStyle: 'none' }}>
          {apps.map(a => <li key={a.id}><button style={{ fontWeight: a.id === appId ? 700 : 400 }} onClick={() => open(a.id)}>{a.name} ({a.status})</button></li>)}
        </ul>
      </aside>

      <section>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} style={{ width: '100%', padding: 8 }}
          placeholder={appId ? 'Describe a change...' : 'Describe the app you want...'} />
        <select value={quality} onChange={e => setQuality(e.target.value as any)}>
          <option value="fast">Fast (1 credit)</option><option value="best">Best quality (3 credits)</option>
        </select>{' '}
        <label>Attach images <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => Array.from(e.target.files ?? []).forEach(attach)} /></label>
        {attachments.length > 0 && <span> {attachments.length} attached <button onClick={() => setAttachments([])}>Clear</button></span>}{' '}
        <button disabled={busy || generating || prompt.length < 3} onClick={() => generate()}>{generating ? 'Working...' : appId ? 'Update' : 'Generate'}</button>
        {generating && <button onClick={stop}>Stop</button>}
        {!generating && cur?.gen_status === 'failed' && <button onClick={resume}>Resume</button>}
        {appId && <button disabled={busy} onClick={() => deploy()}>Deploy live (2 credits)</button>}
        <span> {msg}</span>
        {liveUrl && <p>Live: <a href={liveUrl} target="_blank">{liveUrl}</a></p>}

        {appId && (
          <>
            <div style={{ margin: '12px 0' }}>{tabs.map(t => <button key={t} onClick={() => setTab(t)} style={{ fontWeight: t === tab ? 700 : 400, textTransform: 'capitalize' }}>{t}</button>)}</div>

            {tab === 'preview' && (preview ? <iframe key={previewKey} src={preview} style={{ width: '100%', height: '65vh', border: '1px solid #ccc' }} /> : <p>Loading preview...</p>)}

            {tab === 'code' && (
              <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 8 }}>
                <ul style={{ padding: 0, listStyle: 'none', maxHeight: '60vh', overflow: 'auto' }}>
                  {files.map(f => <li key={f.name}><button style={{ fontWeight: f.name === fileSel ? 700 : 400 }} onClick={() => { setFileSel(f.name); setFileText(f.content) }}>{f.name}</button></li>)}
                </ul>
                <div>
                  <textarea value={fileText} onChange={e => setFileText(e.target.value)} spellCheck={false} style={{ width: '100%', height: '55vh', fontFamily: 'monospace', fontSize: 13 }} />
                  <button disabled={busy || !fileSel} onClick={saveFile}>Save file</button>
                </div>
              </div>
            )}

            {tab === 'chat' && (
              <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
                {chat.map(m => <div key={m.id} style={{ margin: '8px 0', padding: 8, background: m.role === 'user' ? '#eef' : '#f6f6f6', whiteSpace: 'pre-wrap' }}><b>{m.role === 'user' ? 'You' : 'Masidy'}</b><br />{m.text}</div>)}
                {!chat.length && <p>No messages yet.</p>}
              </div>
            )}

            {tab === 'versions' && (
              <ul style={{ padding: 0, listStyle: 'none' }}>
                {versions.map((v, i) => (
                  <li key={v.id} style={{ margin: '6px 0' }}>
                    Version {versions.length - i} {v.createdAt && `(${new Date(v.createdAt).toLocaleString()})`}{' '}
                    {v.previewUrl && <button onClick={() => { setPreview(v.previewUrl); setPreviewKey(k => k + 1); setTab('preview') }}>Preview</button>}
                    <button disabled={busy} onClick={() => fork(v.id)}>Restore as new app</button>
                    <button disabled={busy} onClick={() => deploy(v.id)}>Deploy this</button>
                  </li>
                ))}
              </ul>
            )}

            {tab === 'share' && (
              <div>
                <p><button onClick={download}>Download as zip</button></p>
                <p>
                  <button onClick={githubConnect}>Connect GitHub</button>{' '}
                  <button disabled={busy} onClick={githubPush}>Push to GitHub</button>{' '}
                  {ghUrl && ghUrl !== 'linked' && <a href={ghUrl} target="_blank">{ghUrl}</a>}
                  {ghUrl === 'linked' && <span>Linked to a repo. Push again to update it.</span>}
                </p>
                <details>
                  <summary>Domains</summary>
                  <div><input value={sub} onChange={e => setSub(e.target.value)} placeholder="myapp" />.{ROOT}
                    <button disabled={busy} onClick={() => domain({ subdomain: sub })}>Set</button></div>
                  <div><input value={custom} onChange={e => setCustom(e.target.value)} placeholder="mydomain.com" />
                    <button disabled={busy} onClick={() => domain({ customDomain: custom })}>Add</button>
                    <button disabled={busy} onClick={() => domain({ action: 'verify' })}>Check DNS</button></div>
                  <div><input value={buyName} onChange={e => setBuyName(e.target.value)} placeholder="Find a domain: mybrand.com" />
                    <button disabled={busy} onClick={search}>Search</button>
                    {quote && (quote.available ? <span> {quote.domain} ${(quote.priceCents / 100).toFixed(2)}/yr <button disabled={busy} onClick={purchase}>Buy</button></span> : <span> taken</span>)}</div>
                  {dns && (dns.verified ? <p>Domain verified.</p> : (
                    <div>
                      <p>Add these records at your domain provider, then press Check DNS. It can take a few hours.</p>
                      {(dns.records ?? []).map((r: any, i: number) => <pre key={i}>{`Type: ${r.type}\nName: ${r.name}\nValue: ${r.value}`}</pre>)}
                      <p>Use the CNAME for a subdomain, or the A record for a root domain.</p>
                    </div>
                  ))}
                </details>
                <details>
                  <summary>Environment variables</summary>
                  <p>{envKeys.length ? envKeys.join(', ') : 'None set. Deploy the app first, then add keys here.'}</p>
                  <input value={envKey} onChange={e => setEnvKey(e.target.value.toUpperCase())} placeholder="KEY" />
                  <input value={envVal} onChange={e => setEnvVal(e.target.value)} placeholder="value" type="password" />
                  <button disabled={busy || !envKey} onClick={saveEnv}>Save</button>
                  <button disabled={busy || !envKey} onClick={removeEnvVar}>Remove</button>
                  <p>Changes apply the next time you deploy.</p>
                </details>
                <p><button disabled={busy} onClick={remove} style={{ color: 'crimson' }}>Delete app</button></p>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}

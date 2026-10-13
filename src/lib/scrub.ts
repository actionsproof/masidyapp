// Removes supplier names from generated files WITHOUT breaking code:
// only package name, generator meta tag, comments, and docs are touched. Imports, URLs and config stay as they are.
const NAMES = /(?<![@\w/.-])(v0(?:\.dev|\.app)?|vercel|supabase)(?![\w/-])/gi
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'masidy-app'

export function scrubFiles(files: { name: string; content: string }[], appName: string) {
  return files.map(f => {
    let c = f.content
    const n = f.name.toLowerCase()
    if (n === 'package.json') {
      try { const j = JSON.parse(c); if (typeof j.name === 'string' && /v0|vercel/i.test(j.name)) { j.name = slug(appName); c = JSON.stringify(j, null, 2) } } catch {}
    } else if (/\.(md|mdx|txt)$/.test(n)) {
      c = c.replace(NAMES, 'Masidy')
    } else if (/\.(tsx?|jsx?|mjs|cjs|css|html)$/.test(n)) {
      c = c.replace(/(<meta[^>]*name=["']generator["'][^>]*content=["'])[^"']*(["'])/gi, '$1Masidy$2')
      c = c.split('\n').map(l => /^\s*(\/\/|\/\*|\*|#|<!--)/.test(l) ? l.replace(NAMES, 'Masidy') : l).join('\n')
    }
    return { ...f, content: c }
  })
}

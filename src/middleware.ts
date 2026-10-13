import { NextResponse, type NextRequest } from 'next/server'

// Preview proxy: <token>.pv.<root domain> is served by /api/pv/<token>/...
export function middleware(req: NextRequest) {
  const m = (req.headers.get('host') ?? '').match(/^([a-f0-9]{24})\.pv\./)
  if (!m) return
  const u = req.nextUrl.clone()
  u.pathname = `/api/pv/${m[1]}${req.nextUrl.pathname}`
  return NextResponse.rewrite(u)
}
export const config = { matcher: '/:path*' }

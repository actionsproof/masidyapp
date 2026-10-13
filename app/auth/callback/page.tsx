'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient('/sb', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'build-placeholder')
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const tokenHash = params.get('token_hash')
    const type = params.get('type')

    const finish = async () => {
      const result = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : tokenHash && type
          ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any })
          : { error: new Error('This sign-in link is missing its verification code.') }
      if (result.error) setError(result.error.message)
      else router.replace('/')
    }
    finish()
  }, [router])

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <section style={{ maxWidth: 460, textAlign: 'center' }}>
        {error ? <><h1>Sign-in link unavailable</h1><p>{error}</p><a href="/">Return to Masidy</a></> : <><h1>Signing you in</h1><p>Securely returning you to Masidy…</p></>}
      </section>
    </main>
  )
}

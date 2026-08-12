'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ThroughballLogo } from '@/components/brand/ThroughballLogo'

type Mode = 'password' | 'magic'

// Brand chrome tokens (Throughball — the product front door).
const B = {
  parchment: '#F6F1E8',
  warmWhite: '#FFFDF9',
  cream:     '#FBF6EC',
  ink:       '#1A1A1A',
  muted:     '#6B655A',
  faint:     '#8A8478',
  border:    '#E2DBC9',
  borderDeep:'#C9C2B2',
  pitch:     '#1F6B48',
  danger:    '#9A0B23',
  dangerSoft:'#FCE4E8',
}

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('password')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (mode === 'password') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      router.push('/get-recruited')
      router.refresh()
    } else {
      // Magic-link redirect must be the FULL callback path on the canonical
      // origin. window.location.origin proved unreliable here — the sent email's
      // redirect_to came through as the bare root (no /auth/callback), landing
      // users on marketing instead of the code-exchange route. Pin to an explicit
      // site URL; NEXT_PUBLIC_SITE_URL overrides for preview/local and the future
      // Throughball domain.
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://finnsoccer.com'
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${siteUrl}/auth/callback`,
        },
      })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setSuccess(`Magic link sent to ${email} — check your inbox and click the link to sign in.`)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: B.parchment,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, boxSizing: 'border-box',
    }}>
      <div style={{
        background: B.warmWhite,
        border: `1px solid ${B.border}`,
        borderRadius: 18,
        boxShadow: '0 24px 60px rgba(26,26,26,0.10)',
        padding: 'clamp(28px, 5vw, 40px)',
        width: '100%', maxWidth: 384, boxSizing: 'border-box',
      }}>
        {/* Front door — the brand, not a person */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 28 }}>
          <ThroughballLogo size={24} treatment="ink" />
          <p style={{ margin: '18px 0 0', fontSize: 13, color: B.muted, letterSpacing: '-0.01em', lineHeight: 1.5 }}>
            The assist for your kid&apos;s recruiting.
          </p>
        </div>

        {/* Mode toggle */}
        <div style={{
          display: 'flex', gap: 3, padding: 3, marginBottom: 20,
          background: B.cream, borderRadius: 999, border: `1px solid ${B.border}`,
        }}>
          {(['password', 'magic'] as Mode[]).map(m => {
            const on = mode === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); setSuccess(null) }}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 999, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: on ? 700 : 550, fontFamily: 'inherit', letterSpacing: '-0.01em',
                  background: on ? B.ink : 'transparent',
                  color: on ? B.cream : B.muted,
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {m === 'password' ? 'Password' : 'Magic Link'}
              </button>
            )
          })}
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={fieldStyle}
              placeholder="you@example.com"
            />
          </div>

          {mode === 'password' && (
            <div>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={fieldStyle}
                placeholder="••••••••"
              />
            </div>
          )}

          {mode === 'magic' && (
            <p style={{ fontSize: 12.5, color: B.faint, lineHeight: 1.5, margin: 0 }}>
              We&apos;ll email you a one-click sign-in link. No password needed.
            </p>
          )}

          {error && (
            <p style={{ fontSize: 13, color: B.danger, background: B.dangerSoft, borderRadius: 8, padding: '9px 12px', margin: 0, lineHeight: 1.4 }}>
              {error}
            </p>
          )}

          {success && (
            <p style={{ fontSize: 13, color: B.pitch, background: B.cream, border: `1px solid ${B.border}`, borderRadius: 8, padding: '9px 12px', margin: 0, lineHeight: 1.4 }}>
              {success}
            </p>
          )}

          {!success && (
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 999, border: 'none',
                background: B.pitch, color: B.cream,
                fontSize: 14, fontWeight: 700, fontFamily: 'inherit', letterSpacing: '-0.01em',
                cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {loading
                ? (mode === 'magic' ? 'Sending…' : 'Signing in…')
                : (mode === 'magic' ? 'Send magic link' : 'Sign in')}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: B.muted,
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
}

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', boxSizing: 'border-box',
  border: `1px solid ${B.border}`, borderRadius: 9,
  fontSize: 14, fontFamily: 'inherit', background: B.warmWhite, color: B.ink,
  outline: 'none',
}

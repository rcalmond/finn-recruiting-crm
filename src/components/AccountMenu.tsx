'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Brand chrome tokens (Throughball — Pitch Green accent).
const A = {
  parchment: '#F6F1E8',
  warmWhite: '#FFFDF9',
  cream:     '#FBF6EC',
  ink:       '#1A1A1A',
  muted:     '#6B655A',
  faint:     '#8A8478',
  border:    '#E2DBC9',
  pitch:     '#1F6B48',
}

/**
 * Nav account menu — the app's home for account actions. Rehomed from
 * DashboardClient (/pipeline) in Pipeline removal Pass 2 so sign-out no longer
 * lives only on a soon-to-be-deleted page. Opens upward (both the desktop
 * sidebar footer and the mobile bottom nav sit at the bottom of the viewport).
 */
export default function AccountMenu({
  email,
  displayName,
  variant,
}: {
  email: string
  displayName?: string
  variant: 'sidebar' | 'mobile'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  function handleChangePassword() {
    setOpen(false)
    router.push('/auth/update-password')
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            bottom: '100%',
            [variant === 'mobile' ? 'right' : 'left']: 0,
            marginBottom: 8,
            minWidth: 200,
            background: A.warmWhite,
            border: `1px solid ${A.border}`,
            borderRadius: 12,
            boxShadow: '0 12px 32px rgba(26,26,26,0.14)',
            padding: 6,
            zIndex: 60,
          }}
        >
          <div style={{
            padding: '8px 10px 6px',
            fontSize: 11, color: A.faint, fontWeight: 600,
            letterSpacing: -0.1, wordBreak: 'break-all',
          }}>
            {email || 'Signed in'}
          </div>
          <div style={{ height: 1, background: A.border, margin: '4px 2px' }} />
          <MenuItem label="Change password" onClick={handleChangePassword} />
          <MenuItem label={signingOut ? 'Signing out…' : 'Sign out'} onClick={handleSignOut} />
        </div>
      )}

      {variant === 'sidebar' ? (
        <button
          onClick={() => setOpen(o => !o)}
          aria-label="Account menu"
          style={{
            all: 'unset', boxSizing: 'border-box', width: '100%',
            padding: '12px 14px',
            borderTop: `1px solid ${A.border}`,
            display: 'flex', alignItems: 'center', gap: 10,
            cursor: 'pointer',
            background: open ? A.cream : 'transparent',
            transition: 'background 0.15s',
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: A.pitch, color: A.cream,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, flexShrink: 0,
          }}>FA</div>
          <div style={{ lineHeight: 1.25, minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 650, color: A.ink }}>{displayName || 'Account'}</div>
            <div style={{ fontSize: 11, color: A.muted }}>Class of &apos;27 · LWB</div>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{
            transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0,
          }}>
            <path d="M3 4.5L6 7.5L9 4.5" stroke={A.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <button
          onClick={() => setOpen(o => !o)}
          aria-label="Account menu"
          style={{
            all: 'unset', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          }}
        >
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: open ? A.pitch : A.ink, color: A.cream,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700,
          }}>FA</div>
          <span style={{ fontSize: 11, fontWeight: open ? 700 : 500, color: open ? A.ink : A.muted }}>
            Account
          </span>
        </button>
      )}
    </div>
  )
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      role="menuitem"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', boxSizing: 'border-box', width: '100%',
        padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
        fontSize: 13, fontWeight: 550, letterSpacing: -0.1,
        color: hover ? '#1F6B48' : '#1A1A1A',
        background: hover ? '#FBF6EC' : 'transparent',
        transition: 'background 0.12s, color 0.12s',
      }}
    >
      {label}
    </button>
  )
}

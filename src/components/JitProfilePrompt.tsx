'use client'

/**
 * JitProfilePrompt — a just-in-time, dismissible nudge toward an empty profile
 * echo field, shown at the moment the field would matter (Profile v2 §3).
 *
 * NEVER blocks: the fail-safe empty behavior IS the fallback — generation
 * proceeds untouched whether the prompt is dismissed, followed, or ignored.
 * One appearance per surface per session (sessionStorage key) — a nudge, not
 * a nag.
 */
import { useState } from 'react'
import Link from 'next/link'

export function jitSeen(key: string): boolean {
  try { return sessionStorage.getItem(`jit-${key}`) === '1' } catch { return true }
}
function markSeen(key: string) {
  try { sessionStorage.setItem(`jit-${key}`, '1') } catch { /* no-op */ }
}

export default function JitProfilePrompt({
  surfaceKey,
  message,
  linkLabel,
  anchor,
  dismissLabel,
}: {
  /** sessionStorage discriminator — one appearance per surface per session. */
  surfaceKey: string
  message: string
  linkLabel: string
  /** Field anchor on the profile page, e.g. 'preparation-notes'. */
  anchor: string
  dismissLabel: string
}) {
  const [dismissed, setDismissed] = useState(() => jitSeen(surfaceKey))
  if (dismissed) return null
  const dismiss = () => { markSeen(surfaceKey); setDismissed(true) }
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      background: '#F4F8F5', border: '1px solid #CFE0D5', borderRadius: 10,
      padding: '10px 12px', margin: '0 0 12px', fontSize: 12.5, lineHeight: 1.5, color: '#3A4A40',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {message}{' '}
        <Link href={`/settings/player#${anchor}`} onClick={dismiss}
          style={{ color: '#1F6B48', fontWeight: 650, textDecoration: 'underline' }}>
          {linkLabel}
        </Link>
        <span style={{ color: '#8A9890' }}> · </span>
        <button onClick={dismiss} style={{
          all: 'unset', cursor: 'pointer', color: '#5A6A60', fontWeight: 600,
          textDecoration: 'underline',
        }}>{dismissLabel}</button>
      </div>
      <button onClick={dismiss} aria-label="Dismiss" style={{
        all: 'unset', cursor: 'pointer', color: '#8A9890', fontWeight: 700, lineHeight: 1,
      }}>×</button>
    </div>
  )
}

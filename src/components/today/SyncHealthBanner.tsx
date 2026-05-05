'use client'

import Link from 'next/link'
import type { GmailHealth } from '@/lib/gmail-health'

const STYLES = {
  warning: {
    bg: '#FEF3C7',
    border: '#FCD34D',
    text: '#92400E',
    link: '#B45309',
  },
  critical: {
    bg: '#FEE2E2',
    border: '#FCA5A5',
    text: '#991B1B',
    link: '#C8102E',
  },
}

export default function SyncHealthBanner({ health }: { health: GmailHealth }) {
  if (health.isHealthy || health.severity === 'none') return null

  const style = STYLES[health.severity]

  return (
    <div style={{
      margin: '0 clamp(28px, 4vw, 56px) 12px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderRadius: 8,
        background: style.bg, border: `1px solid ${style.border}`,
        gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: style.text }}>
          {health.reason}
        </span>
        <Link href="/settings/gmail" style={{
          fontSize: 12, fontWeight: 600, color: style.link,
          textDecoration: 'none',
        }}>Reconnect →</Link>
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import type { SourceHealth } from '@/lib/ingestion-health'

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

export default function SyncHealthBanner({ sources }: { sources: SourceHealth[] }) {
  const unhealthy = sources.filter(s => !s.isHealthy && s.severity !== 'none')
  if (unhealthy.length === 0) return null

  // Worst severity wins
  const worstSeverity = unhealthy.some(s => s.severity === 'critical') ? 'critical' : 'warning'
  const style = STYLES[worstSeverity]

  // Single issue: show its message directly
  // Multiple issues: aggregate
  const message = unhealthy.length === 1
    ? unhealthy[0].message
    : `${unhealthy.length} ingestion warnings — ${unhealthy.map(s => s.source === 'gmail' ? 'Gmail' : 'SendGrid').join(' and ')}`

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
          {message}
        </span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {unhealthy.map(s => s.actionUrl && s.actionLabel ? (
            <ActionLink
              key={s.source}
              url={s.actionUrl}
              label={s.actionLabel}
              color={style.link}
              external={s.actionUrl.startsWith('http')}
            />
          ) : null)}
        </div>
      </div>
    </div>
  )
}

function ActionLink({ url, label, color, external }: {
  url: string; label: string; color: string; external?: boolean
}) {
  if (external) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 12, fontWeight: 600, color, textDecoration: 'none' }}
      >{label} →</a>
    )
  }
  return (
    <Link href={url} style={{ fontSize: 12, fontWeight: 600, color, textDecoration: 'none' }}>
      {label} →
    </Link>
  )
}

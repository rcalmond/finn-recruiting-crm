'use client'

import type { ContactLogEntry, School } from '@/lib/types'

const LV = {
  paper:    '#F6F1E8',
  ink:      '#0E0E0E',
  inkLo:    '#7A7570',
  inkMute:  '#A8A39B',
  line:     '#E2DBC9',
  tealDeep: '#006A65',
}

interface Props {
  items: Array<{ entry: ContactLogEntry; school: School }>
  onUndo: (entryId: string) => Promise<void>
}

function formatHandledTime(handledAt: string): string {
  const d = new Date(handledAt)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 12) return `${diffHr}h ago`

  // Same day: show time
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  }

  return 'Yesterday'
}

function getWhat(entry: ContactLogEntry): string {
  if (entry.summary) {
    // Truncate to first ~40 chars of summary
    const clean = entry.summary.replace(/\n+/g, ' ').trim()
    return clean.length > 40 ? clean.slice(0, 40) + '...' : clean
  }
  return 'handled'
}

// ── Check circle SVG ─────────────────────────────────────────────────────────

function CheckCircle() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="7" cy="7" r="6.25" stroke={LV.tealDeep} strokeWidth="1.4" />
      <path d="M4 7.4L6.2 9.4L10 5.4" stroke={LV.tealDeep}
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function HandledSection({ items, onUndo }: Props) {
  if (items.length === 0) return null

  return (
    <section style={{
      margin: 'clamp(28px, 3vw, 40px) clamp(28px, 4vw, 56px) 0',
    }}>
      {/* Kicker */}
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.24em',
        textTransform: 'uppercase', color: LV.inkMute,
        marginBottom: 12,
      }}>Recently handled</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(({ entry, school }) => (
          <div key={entry.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 16px', borderRadius: 10,
            background: LV.paper, border: `1px solid ${LV.line}`,
            opacity: 0.62,
          }}>
            <CheckCircle />

            {/* Body line */}
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
              <span style={{ fontWeight: 650, color: LV.ink }}>
                {school.short_name || school.name}
              </span>
              {entry.coach_name && (
                <span style={{ color: LV.inkLo }}> · {entry.coach_name}</span>
              )}
              <span style={{ color: LV.inkMute }}> · {getWhat(entry)}</span>
            </div>

            {/* Timestamp */}
            {entry.handled_at && (
              <span style={{
                fontSize: 11, color: LV.inkMute, fontWeight: 600,
                flexShrink: 0, whiteSpace: 'nowrap',
              }}>{formatHandledTime(entry.handled_at)}</span>
            )}

            {/* Undo */}
            <button
              onClick={() => onUndo(entry.id)}
              style={{
                padding: '4px 10px', borderRadius: 6,
                border: `1px solid ${LV.line}`, background: '#fff',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit', color: LV.tealDeep,
                flexShrink: 0,
              }}
            >Undo</button>
          </div>
        ))}
      </div>
    </section>
  )
}

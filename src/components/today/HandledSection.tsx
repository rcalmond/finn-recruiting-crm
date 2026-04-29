'use client'

import type { ContactLogEntry, School } from '@/lib/types'

const LV = {
  paper: '#F6F1E8',
  ink: '#0E0E0E',
  inkLo: '#7A7570',
  inkMute: '#A8A39B',
  line: '#E2DBC9',
  tealDeep: '#006A65',
}

interface Props {
  items: Array<{ entry: ContactLogEntry; school: School }>
  onUndo: (entryId: string) => Promise<void>
}

export default function HandledSection({ items, onUndo }: Props) {
  if (items.length === 0) return null

  return (
    <section style={{
      margin: 'clamp(24px, 3vw, 36px) clamp(16px, 5vw, 56px) 0',
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10,
        marginBottom: 12,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.15em',
          textTransform: 'uppercase', color: LV.inkMute,
        }}>Recently handled</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(({ entry, school }) => (
          <div key={entry.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 16px', borderRadius: 10,
            background: LV.paper, border: `1px solid ${LV.line}`,
            opacity: 0.6,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 12, fontWeight: 600, color: LV.ink,
                }}>{school.short_name || school.name}</span>
                {entry.coach_name && (
                  <span style={{ fontSize: 11, color: LV.inkLo }}>· {entry.coach_name}</span>
                )}
              </div>
            </div>
            <button
              onClick={() => onUndo(entry.id)}
              style={{
                padding: '4px 10px', borderRadius: 6,
                border: `1px solid ${LV.line}`, background: '#fff',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
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

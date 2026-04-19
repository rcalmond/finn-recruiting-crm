'use client'

import { useRouter } from 'next/navigation'
import type { ActionItem } from '@/lib/types'
import { daysBetween } from '@/lib/utils'

interface Props {
  items: ActionItem[]
  today: string
}

const INITIAL_LIMIT = 5

const LV = {
  paper: '#F6F1E8',
  ink: '#0E0E0E',
  inkMid: '#4A4A4A',
  inkLo: '#7A7570',
  line: '#E2DBC9',
  red: '#C8102E',
  teal: '#00B2A9',
  tealDeep: '#006A65',
  gold: '#F6EB61',
  goldDeep: '#C8B22E',
  goldInk: '#5A4E0F',
}

type Urgency = 'overdue' | 'today' | 'soon' | 'later'

function getUrgency(dueDate: string, today: string): Urgency {
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'today'
  const daysUntil = -daysBetween(dueDate)
  return daysUntil <= 3 ? 'soon' : 'later'
}

function dueLabel(dueDate: string, today: string): string {
  if (dueDate < today) return 'Overdue'
  if (dueDate === today) return 'Today'
  const [y, m, d] = dueDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' })
}

const URGENCY_STYLE: Record<Urgency, {
  dotFill: string
  dotBorder: string
  badgeBg: string
  badgeColor: string
  badgePad: string
}> = {
  overdue: { dotFill: LV.red,   dotBorder: LV.red,      badgeBg: LV.red,          badgeColor: '#fff',         badgePad: '4px 11px' },
  today:   { dotFill: LV.ink,   dotBorder: LV.ink,      badgeBg: LV.ink,          badgeColor: '#fff',         badgePad: '4px 11px' },
  soon:    { dotFill: '#fff',   dotBorder: LV.teal,     badgeBg: 'transparent',   badgeColor: LV.tealDeep,    badgePad: '4px 0'    },
  later:   { dotFill: '#fff',   dotBorder: LV.goldDeep, badgeBg: 'transparent',   badgeColor: LV.goldInk,     badgePad: '4px 0'    },
}

function weekRange(today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  const end   = new Date(y, m - 1, d + 6)
  const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

export default function WeekSection({ items, today }: Props) {
  const router = useRouter()

  if (items.length === 0) return null

  const visible = items.slice(0, INITIAL_LIMIT)
  const total = items.length
  const hasMore = total > INITIAL_LIMIT

  return (
    <section style={{
      margin: 'clamp(32px, 5vw, 52px) clamp(16px, 5vw, 56px) 0',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap',
        marginBottom: 20,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '0.15em',
          color: LV.ink, textTransform: 'uppercase',
          padding: '4px 0', borderTop: `2px solid ${LV.ink}`,
        }}>№ 03</div>
        <div style={{
          fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 700,
          letterSpacing: '-0.03em', color: LV.ink, fontStyle: 'italic',
        }}>This week</div>
        <div style={{
          fontSize: 13, color: LV.inkLo, fontWeight: 600,
        }}>{total}</div>
        <div style={{
          marginLeft: 'auto', fontSize: 11, color: LV.inkLo,
          textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700,
        }}>{weekRange(today)}</div>
      </div>

      {/* Rows */}
      <div style={{
        background: LV.paper,
        border: `1px solid ${LV.line}`,
        borderRadius: 14, overflow: 'hidden',
      }}>
        {visible.map((item, i) => {
          const urgency = getUrgency(item.due_date!, today)
          const u = URGENCY_STYLE[urgency]
          const label = dueLabel(item.due_date!, today)
          const schoolName = item.school?.short_name || item.school?.name || '—'
          const schoolId = item.school?.id

          return (
            <div
              key={item.id}
              onClick={() => schoolId && router.push(`/schools/${schoolId}`)}
              style={{
                display: 'grid',
                gridTemplateColumns: '14px minmax(120px, 180px) 1fr auto',
                gap: 'clamp(10px, 2vw, 20px)',
                alignItems: 'center',
                padding: 'clamp(12px, 2vw, 14px) clamp(16px, 3vw, 24px)',
                borderTop: i === 0 ? 'none' : `1px solid ${LV.line}`,
                cursor: schoolId ? 'pointer' : 'default',
              }}
              className="week-row"
            >
              {/* Status dot */}
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: u.dotFill,
                border: `2px solid ${u.dotBorder}`,
                flexShrink: 0,
              }}/>

              {/* School */}
              <div style={{
                fontSize: 'clamp(14px, 2vw, 16px)', fontWeight: 700,
                color: LV.ink, letterSpacing: '-0.02em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{schoolName}</div>

              {/* Action (hidden on mobile) */}
              <div style={{
                fontSize: 13, color: LV.inkMid, letterSpacing: '-0.01em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} className="week-action">{item.action}</div>

              {/* Due badge */}
              <div style={{
                padding: u.badgePad,
                borderRadius: 999,
                background: u.badgeBg,
                color: u.badgeColor,
                fontSize: 11, fontWeight: 700,
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}>{label}</div>

              {/* Mobile: action below (spans cols 2–4) */}
              <div style={{
                gridColumn: '2 / 5',
                fontSize: 13, color: LV.inkMid,
                letterSpacing: '-0.01em',
                marginTop: -8,
              }} className="week-action-mobile">{item.action}</div>
            </div>
          )
        })}

        {/* See all link */}
        {hasMore && (
          <div style={{
            padding: 'clamp(12px, 2vw, 14px) clamp(16px, 3vw, 24px)',
            borderTop: `1px solid ${LV.line}`,
            textAlign: 'center',
          }}>
            <button
              onClick={() => router.push('/pipeline?tab=actions')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, color: LV.ink,
                letterSpacing: '-0.01em', fontFamily: 'inherit',
                padding: '4px 0',
              }}
            >
              See all {total} items
            </button>
          </div>
        )}
      </div>

      <style>{`
        @media (min-width: 641px) {
          .week-action-mobile { display: none !important; }
        }
        @media (max-width: 640px) {
          .week-row { grid-template-columns: 14px 1fr auto !important; }
          .week-action { display: none !important; }
        }
        .week-row:hover { background: rgba(0,0,0,0.025); }
      `}</style>
    </section>
  )
}

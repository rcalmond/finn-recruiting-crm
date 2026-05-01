'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { PipelineSchool, PipelineStatus } from '@/lib/pipeline-rail'

const LV = {
  paper:    '#F6F1E8',
  paperDeep:'#EFE8D8',
  ink:      '#0E0E0E',
  inkLo:    '#7A7570',
  inkMute:  '#A8A39B',
  line:     '#E2DBC9',
  red:      '#C8102E',
  teal:     '#00B2A9',
  tealDeep: '#006A65',
  goldDeep: '#C8B22E',
  goldText: '#8A6F0E',
}

const STATUS_TONE: Record<PipelineStatus, { dot: string; label: string }> = {
  HOT:     { dot: LV.red,      label: LV.red },
  ACTIVE:  { dot: LV.teal,     label: LV.tealDeep },
  WARMING: { dot: LV.goldDeep, label: LV.goldText },
  COLD:    { dot: LV.inkMute,  label: LV.inkMute },
}

const TIER_STYLE: Record<string, { bg: string; color: string }> = {
  A: { bg: '#FEE2E2', color: '#991B1B' },
  B: { bg: '#DBEAFE', color: '#1E40AF' },
}

const GROUP_ORDER: PipelineStatus[] = ['HOT', 'ACTIVE', 'WARMING', 'COLD']

interface Props {
  items: PipelineSchool[]
  mobile?: boolean
}

export default function PipelineRail({ items, mobile }: Props) {
  const router = useRouter()

  const grouped = GROUP_ORDER
    .map(status => ({
      status,
      items: items.filter(i => i.status === status),
    }))
    .filter(g => g.items.length > 0)

  return (
    <aside
      id="pipeline-rail"
      style={{
        width: mobile ? '100%' : 320,
        flexShrink: 0,
        padding: mobile
          ? 'clamp(28px, 5vw, 36px) clamp(20px, 5vw, 28px) 24px'
          : 'clamp(24px, 3vw, 36px) 28px 24px 8px',
        borderLeft: mobile ? 'none' : `1px solid ${LV.line}`,
        background: mobile ? LV.paperDeep : 'transparent',
        borderTop: mobile ? `1px solid ${LV.line}` : 'none',
      }}
    >
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 14,
        marginBottom: 16,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: LV.inkLo,
          padding: '4px 0', borderTop: `2px solid ${LV.inkLo}`,
        }}>Pipeline</div>
        <div style={{
          fontSize: 24, fontWeight: 700,
          letterSpacing: '-0.03em', color: LV.ink, fontStyle: 'italic',
        }}>Activity.</div>
      </div>

      {/* Rows card */}
      <div style={{
        background: '#fff',
        border: `1px solid ${LV.line}`,
        borderRadius: 14,
        padding: '6px 16px',
      }}>
        {grouped.map((g, gi) => (
          <div key={g.status}>
            {/* Group label */}
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
              color: STATUS_TONE[g.status].label,
              textTransform: 'uppercase',
              padding: gi === 0 ? '12px 0 4px' : '14px 0 4px',
              borderTop: gi > 0 ? `1px solid ${LV.line}` : 'none',
              marginTop: gi > 0 ? 4 : 0,
            }}>{g.status}</div>

            {/* Rows */}
            {g.items.map((item, ri) => (
              <PipelineRow
                key={item.school.id}
                item={item}
                divider={ri > 0}
                onClick={() => router.push(`/schools/${item.school.id}`)}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Footnote */}
      <div style={{
        marginTop: 14, fontSize: 11, color: LV.inkMute,
        textAlign: 'center', letterSpacing: 0.1,
      }}>
        Tier A · B only — view all in{' '}
        <Link href="/schools" style={{
          color: LV.tealDeep, fontWeight: 700,
          textDecoration: 'none',
        }}>Schools →</Link>
      </div>
    </aside>
  )
}

// ── Pipeline row with hover state ────────────────────────────────────────────

function PipelineRow({ item, divider, onClick }: {
  item: PipelineSchool
  divider: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const tone = STATUS_TONE[item.status]

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 4px',
        cursor: 'pointer',
        borderTop: divider ? `1px solid ${LV.line}` : 'none',
        background: hovered ? LV.paper : 'transparent',
        borderRadius: hovered ? 6 : 0,
        transition: 'background 100ms ease',
      }}
    >
      {/* Status dot */}
      <span style={{
        width: 7, height: 7, borderRadius: 99,
        background: tone.dot,
        flexShrink: 0,
      }} />

      {/* School name + tier badge */}
      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{
          fontSize: 13.5, fontWeight: 650, color: LV.ink,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{item.school.short_name || item.school.name}</span>
        <TierBadge tier={item.school.category} />
      </div>
    </div>
  )
}

// ── Tier badge ───────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: string }) {
  const t = TIER_STYLE[tier] ?? { bg: '#F3F4F6', color: '#374151' }
  return (
    <span style={{
      background: t.bg, color: t.color,
      fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
      padding: '2px 7px', borderRadius: 4,
      lineHeight: 1.4, flexShrink: 0,
    }}>{tier}</span>
  )
}

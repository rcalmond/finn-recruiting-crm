'use client'

import { useRouter } from 'next/navigation'
import type { School, ContactLogEntry, SchoolConversationSummary, RecommendedActionCategory } from '@/lib/types'
import { classifySchoolRecency, SCHOOL_RECENCY_STYLE } from '@/lib/school-recency-state'

const SD = {
  paper: '#F6F1E8', paperDeep: '#EFE8D8',
  ink: '#0E0E0E', inkSoft: '#1F1F1F', inkMid: '#4A4A4A',
  inkLo: '#7A7570', inkMute: '#A8A39B',
  line: '#E2DBC9', line2: '#D3CAB3',
  teal: '#00B2A9', tealDeep: '#006A65', tealSoft: '#D7F0ED',
  red: '#C8102E',
}

const CATEGORY_BADGE_COLORS: Record<RecommendedActionCategory, { bg: string; text: string }> = {
  reply:     { bg: SD.tealSoft, text: SD.tealDeep },
  follow_up: { bg: '#DBEAFE', text: '#1E40AF' },
  check_in:  { bg: '#FEF3C7', text: '#92400E' },
  new_topic: { bg: '#E0E7FF', text: '#3730A3' },
  introduce: { bg: '#DCFCE7', text: '#166534' },
  wait:      { bg: '#F3F4F6', text: '#374151' },
}

const TIER_DOT_COLOR: Record<string, string> = {
  A: SD.ink,
  B: SD.inkMid,
  C: SD.inkMute,
}

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return 'Updated just now'
  if (hours < 24) return `Updated ${hours}h ago`
  const days = Math.floor(hours / 24)
  return `Updated ${days}d ago`
}

interface Props {
  school: School
  summary: SchoolConversationSummary | null
  contactLog: ContactLogEntry[]
}

export default function HomeSchoolCard({ school, summary, contactLog }: Props) {
  const router = useRouter()
  const recencyResult = classifySchoolRecency(school, contactLog)
  const recencyStyle = recencyResult.state ? SCHOOL_RECENCY_STYLE[recencyResult.state] : null

  return (
    <div
      onClick={() => router.push(`/schools/${school.id}`)}
      style={{
        background: '#fff',
        border: `1px solid ${SD.line}`,
        borderRadius: 12,
        padding: '16px 18px',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s ease',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: SD.ink }}>{school.name}</span>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: TIER_DOT_COLOR[school.category] ?? SD.inkMute,
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
        </div>
        {recencyStyle && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 7px',
              borderRadius: 6,
              backgroundColor: recencyStyle.bgColor,
              color: recencyStyle.textColor,
              whiteSpace: 'nowrap',
            }}
          >
            {recencyStyle.label}
          </span>
        )}
      </div>

      {/* Summary text */}
      <div
        style={{
          fontSize: 13,
          color: summary ? SD.inkMid : SD.inkLo,
          lineHeight: 1.55,
          marginTop: 8,
          fontStyle: summary ? 'normal' : 'italic',
        }}
      >
        {summary ? summary.summary : 'No conversations yet.'}
      </div>

      {/* Recommended action row */}
      {summary && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              padding: '2px 5px',
              borderRadius: 4,
              backgroundColor: CATEGORY_BADGE_COLORS[summary.recommended_action.category]?.bg ?? '#F3F4F6',
              color: CATEGORY_BADGE_COLORS[summary.recommended_action.category]?.text ?? '#374151',
              whiteSpace: 'nowrap',
            }}
          >
            {summary.recommended_action.category.replace('_', ' ')}
          </span>
          <span style={{ fontSize: 12, color: SD.inkLo, flex: 1 }}>
            {summary.recommended_action.description}
          </span>
        </div>
      )}

      {/* Footer */}
      {summary && (
        <div style={{ marginTop: 8, fontSize: 10, color: SD.inkMute }}>
          {relativeTime(summary.generated_at)}
        </div>
      )}
    </div>
  )
}

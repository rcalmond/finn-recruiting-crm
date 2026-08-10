'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RecommendedAction, RecommendedActionCategory, SchoolConversationSummary } from '@/lib/types'

// ─── Design tokens (match SchoolDetailClient) ──────────────────────────────

const SD = {
  paper:     '#F6F1E8',
  paperDeep: '#EFE8D8',
  ink:       '#0E0E0E',
  inkSoft:   '#1F1F1F',
  inkMid:    '#4A4A4A',
  inkLo:     '#7A7570',
  inkMute:   '#A8A39B',
  line:      '#E2DBC9',
  line2:     '#D3CAB3',
  teal:      '#00B2A9',
  tealDeep:  '#006A65',
  tealSoft:  '#D7F0ED',
}

const CATEGORY_BADGE: Record<RecommendedActionCategory, { bg: string; color: string; label: string }> = {
  reply:     { bg: SD.tealSoft, color: SD.tealDeep, label: 'Reply' },
  follow_up: { bg: '#DBEAFE', color: '#1E40AF', label: 'Follow up' },
  check_in:  { bg: '#FEF3C7', color: '#92400E', label: 'Check in' },
  new_topic: { bg: '#E0E7FF', color: '#3730A3', label: 'New topic' },
  introduce: { bg: '#DCFCE7', color: '#166534', label: 'Introduce' },
  wait:      { bg: '#F3F4F6', color: '#374151', label: 'Wait' },
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  schoolId: string
  schoolName: string
  onDraft: (kind: 'fresh' | 'reply', entryId?: string, channel?: string, recommendedAction?: RecommendedAction) => void
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(isoStr: string): string {
  const now = Date.now()
  const then = new Date(isoStr).getTime()
  const diffMs = now - then
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1) return 'Updated just now'
  if (diffMins < 60) return `Updated ${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `Updated ${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `Updated ${diffDays}d ago`
}

function actionButton(category: RecommendedActionCategory): { label: string; bg: string; color: string; border?: string } {
  switch (category) {
    case 'reply':
      return { label: 'Draft reply', bg: SD.teal, color: '#fff' }
    case 'follow_up':
      return { label: 'Draft follow-up', bg: SD.ink, color: '#fff' }
    case 'check_in':
      return { label: 'Draft check-in', bg: SD.ink, color: '#fff' }
    case 'new_topic':
      return { label: 'Draft email', bg: SD.ink, color: '#fff' }
    case 'introduce':
      return { label: 'Draft intro', bg: SD.ink, color: '#fff' }
    case 'wait':
      return { label: 'Send check-in anyway', bg: 'transparent', color: SD.inkLo, border: `1px solid ${SD.line}` }
  }
}

// ─── Component ──────────────────────────────────────────────────────────────
//
// DEPRECATED (2026-08-09): the "Show alternatives" disclosure was removed from
// this card. It lazy-loaded the per-school message plan (school_message_plan
// suggestions) with drag-to-reorder — a heavier surface that fought the card's
// role as the page hero. The message-plan tables, API route, and generator are
// UNTOUCHED and remain reachable via the Communications Plan deep-link; only
// this card's UI entry point is gone. The message-plan suggestions were the
// only thing generated on demand here (via an explicit "Generate/Update
// suggestions" click), so nothing generates them automatically now. The
// conversation-summary generator never produced an "alternatives" field, so no
// always-on token cost existed to slim.

export default function ConversationSummaryCard({ schoolId, schoolName: _schoolName, onDraft }: Props) {
  const [summary, setSummary] = useState<SchoolConversationSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // ── Fetch summary on mount ──────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('school_conversation_summary')
        .select('*')
        .eq('school_id', schoolId)
        .maybeSingle()
      if (!cancelled) {
        setSummary(data as SchoolConversationSummary | null)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [schoolId])

  // ── Refresh / Generate summary ──────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch(`/api/schools/${schoolId}/conversation-summary`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setSummary(data as SchoolConversationSummary)
      }
    } finally {
      setRefreshing(false)
    }
  }, [schoolId])

  // ── Loading state ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ fontSize: 13, color: SD.inkLo, padding: '12px 0' }}>
        Loading...
      </div>
    )
  }

  // ── Empty state ─────────────────────────────────────────────────────────

  if (!summary) {
    return (
      <div style={{
        background: SD.paperDeep, border: `1px solid ${SD.line}`,
        borderRadius: 14, padding: 24, textAlign: 'center',
      }}>
        <div style={{ fontSize: 14, color: SD.inkLo, marginBottom: 14 }}>
          Summary not generated yet.
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            padding: '8px 20px', borderRadius: 7, border: 'none',
            background: refreshing ? SD.line : SD.ink,
            color: refreshing ? SD.inkMute : '#fff',
            fontSize: 13, fontWeight: 600,
            cursor: refreshing ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {refreshing ? 'Generating...' : 'Generate summary'}
        </button>
      </div>
    )
  }

  // ── Main render ─────────────────────────────────────────────────────────

  const action = summary.recommended_action
  const btn = actionButton(action.category)
  const badge = CATEGORY_BADGE[action.category]

  return (
    <div>
      {/* 1. Summary text */}
      <p style={{
        margin: '0 0 14px', fontSize: 14, color: SD.ink,
        lineHeight: 1.6,
      }}>
        {summary.summary}
      </p>

      {/* 2. Recommended action card */}
      <div style={{
        background: '#fff', border: `1px solid ${SD.line}`,
        borderRadius: 10, padding: '14px 16px', marginBottom: 14,
      }}>
        {/* Top row: badge + description */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            textTransform: 'uppercase', background: badge.bg, color: badge.color,
            flexShrink: 0, marginTop: 2,
          }}>
            {badge.label}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: SD.ink, flex: 1 }}>
            {action.description}
          </span>
        </div>

        {/* Rationale */}
        <div style={{
          fontSize: 12, color: SD.inkLo, fontStyle: 'italic',
          lineHeight: 1.5, marginBottom: 12,
        }}>
          {action.rationale}
        </div>

        {/* Action button */}
        <button
          onClick={() => onDraft(action.category === 'reply' ? 'reply' : 'fresh', undefined, undefined, action)}
          style={{
            padding: '7px 16px', borderRadius: 6,
            border: btn.border ?? 'none',
            background: btn.bg, color: btn.color,
            fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {btn.label}
        </button>
      </div>

      {/* Offer detection chip */}
      {action.possible_offer && (
        <a
          href="/get-in"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 8, marginBottom: 14,
            background: '#2E2B28', color: '#F6F1E8',
            textDecoration: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, lineHeight: 1.4,
          }}
        >
          <span style={{ fontSize: 14 }}>$</span>
          <span style={{ flex: 1 }}>
            {action.possible_offer_note ?? 'Looks like an offer'} — record it in Get In →
          </span>
        </a>
      )}

      {/* 3. Footer row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 11, color: SD.inkMute }}>
          {relativeTime(summary.generated_at)}
        </span>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            padding: '3px 10px', borderRadius: 5,
            border: `1px solid ${SD.line}`, background: 'transparent',
            fontSize: 11, fontWeight: 600, color: SD.inkMute,
            cursor: refreshing ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', opacity: refreshing ? 0.5 : 1,
          }}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </div>
  )
}

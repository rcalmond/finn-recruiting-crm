'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RecommendedAction, RecommendedActionCategory, SchoolConversationSummary, Message, SchoolMessagePlanSuggestion, MessageType } from '@/lib/types'

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
  red:       '#C8102E',
  redDeep:   '#9A0B23',
  redInk:    '#FFE4E8',
  redSoft:   '#FCE4E8',
  teal:      '#00B2A9',
  tealDeep:  '#006A65',
  tealSoft:  '#D7F0ED',
  gold:      '#F6EB61',
  goldDeep:  '#C8B22E',
  goldSoft:  '#FBF3C4',
  goldInk:   '#5A4E0F',
}

const TYPE_STYLES: Record<MessageType, { bg: string; color: string; label: string }> = {
  update:   { bg: '#DCFCE7', color: '#166534', label: 'Update' },
  question: { bg: '#DBEAFE', color: '#1E40AF', label: 'Question' },
}

type SuggestionTiming = 'send_now' | 'after_event' | 'wait'
const TIMING_STYLES: Record<SuggestionTiming, { bg: string; color: string; label: string }> = {
  send_now:    { bg: '#DCFCE7', color: '#166534', label: 'Send now' },
  after_event: { bg: '#FEF3C7', color: '#92400E', label: 'After event' },
  wait:        { bg: '#F3F4F6', color: '#374151', label: 'Wait' },
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
  onDraft: (kind: 'fresh' | 'reply', entryId?: string, channel?: string) => void
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

// ─── Suggestion plan types ──────────────────────────────────────────────────

interface PlanData {
  id: string
  school_id: string
  finn_notes: string | null
  suggestions: { items: SchoolMessagePlanSuggestion[] } | null
  suggestions_generated_at: string | null
  manual_order: string[] | null
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ConversationSummaryCard({ schoolId, schoolName, onDraft }: Props) {
  const [summary, setSummary] = useState<SchoolConversationSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Alternatives section
  const [altOpen, setAltOpen] = useState(false)
  const [altPlan, setAltPlan] = useState<PlanData | null>(null)
  const [altMessages, setAltMessages] = useState<Message[]>([])
  const [altLoading, setAltLoading] = useState(false)
  const [altGenerating, setAltGenerating] = useState(false)
  const [altShowExtras, setAltShowExtras] = useState(false)
  const [altLoaded, setAltLoaded] = useState(false)

  // Drag state for alternatives
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

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

  // ── Alternatives lazy-load ──────────────────────────────────────────────

  const fetchAlternatives = useCallback(async () => {
    setAltLoading(true)
    try {
      const [planRes, supabase] = await Promise.all([
        fetch(`/api/schools/${schoolId}/message-plan`),
        Promise.resolve(createClient()),
      ])
      if (planRes.ok) {
        const data = await planRes.json()
        setAltPlan(data.plan)
      }
      const { data: msgs } = await supabase.from('messages').select('*').eq('status', 'active')
      if (msgs) setAltMessages(msgs as Message[])
      setAltLoaded(true)
    } finally {
      setAltLoading(false)
    }
  }, [schoolId])

  function handleToggleAlternatives() {
    const next = !altOpen
    setAltOpen(next)
    if (next && !altLoaded) {
      fetchAlternatives()
    }
  }

  async function handleUpdateSuggestions() {
    setAltGenerating(true)
    try {
      const res = await fetch(`/api/schools/${schoolId}/message-plan`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setAltPlan(data.plan)
      }
    } finally {
      setAltGenerating(false)
    }
  }

  // ── Drag-to-reorder (HTML5 DnD) ────────────────────────────────────────

  const altSuggestions = altPlan?.suggestions?.items ?? []
  const msgMap = new Map(altMessages.map(m => [m.id, m]))
  const primaryItems = altSuggestions.filter(s => s.tier !== 'extra')
  const extraItems = altSuggestions.filter(s => s.tier === 'extra')

  const orderedPrimary = (() => {
    const order = altPlan?.manual_order
    if (!order || order.length === 0) {
      return [...primaryItems].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
    }
    const orderMap = new Map(order.map((id, idx) => [id, idx]))
    const inOrder = primaryItems.filter(s => orderMap.has(s.message_id))
      .sort((a, b) => orderMap.get(a.message_id)! - orderMap.get(b.message_id)!)
    const notInOrder = primaryItems.filter(s => !orderMap.has(s.message_id))
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
    return [...inOrder, ...notInOrder]
  })()

  const orderedExtras = [...extraItems].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))

  function handleDragStart(idx: number) { setDragIdx(idx) }
  function handleDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); setDragOverIdx(idx) }
  function handleDragLeave() { setDragOverIdx(null) }
  async function handleDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null); setDragOverIdx(null); return
    }
    const newOrder = [...orderedPrimary]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(targetIdx, 0, moved)
    setDragIdx(null); setDragOverIdx(null)

    const newManualOrder = newOrder.map(s => s.message_id)
    setAltPlan(prev => prev ? { ...prev, manual_order: newManualOrder } : prev)
    await fetch(`/api/schools/${schoolId}/message-plan`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manual_order: newManualOrder }),
    })
  }
  function handleDragEnd() { setDragIdx(null); setDragOverIdx(null) }

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
          onClick={() => onDraft(action.category === 'reply' ? 'reply' : 'fresh')}
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

      {/* 3. Footer row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
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

      {/* 4. Show alternatives disclosure */}
      <div>
        <button
          onClick={handleToggleAlternatives}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 6, padding: 0,
            fontSize: 12, fontWeight: 600, color: SD.tealDeep,
          }}
        >
          <span style={{
            fontSize: 10, display: 'inline-block',
            transform: altOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
          }}>&#9660;</span>
          {altOpen ? 'Hide alternatives' : 'Show alternatives'}
        </button>

        {altOpen && (
          <div style={{ marginTop: 10 }}>
            {altLoading ? (
              <div style={{ fontSize: 12, color: SD.inkLo, padding: '8px 0' }}>
                Loading suggestions...
              </div>
            ) : orderedPrimary.length === 0 && !altGenerating ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 12, color: SD.inkLo, marginBottom: 10 }}>
                  No suggestions generated yet.
                </div>
                <button
                  onClick={handleUpdateSuggestions}
                  disabled={altGenerating}
                  style={{
                    padding: '7px 16px', borderRadius: 6, border: 'none',
                    background: SD.ink, color: '#fff', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Generate suggestions
                </button>
              </div>
            ) : altGenerating ? (
              <div style={{ fontSize: 12, color: SD.inkLo, padding: '12px 0', textAlign: 'center' }}>
                Analyzing conversation and inventory...
              </div>
            ) : (
              <>
                {/* Primary list (draggable) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {orderedPrimary.map((s, i) => {
                    const msg = msgMap.get(s.message_id)
                    if (!msg) return null
                    const ts = TYPE_STYLES[msg.type] ?? TYPE_STYLES.update
                    const tm = TIMING_STYLES[s.timing] ?? TIMING_STYLES.send_now
                    return (
                      <div
                        key={s.message_id}
                        draggable
                        onDragStart={() => handleDragStart(i)}
                        onDragOver={(e) => handleDragOver(e, i)}
                        onDragLeave={handleDragLeave}
                        onDrop={e => { e.preventDefault(); handleDrop(i) }}
                        onDragEnd={handleDragEnd}
                        style={{
                          padding: '10px 12px', background: '#fff',
                          borderRadius: 8, border: `1px solid ${dragOverIdx === i ? SD.teal : SD.line}`,
                          opacity: dragIdx === i ? 0.4 : 1,
                          cursor: 'grab',
                          transition: 'border-color 0.1s, opacity 0.1s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ color: SD.inkMute, fontSize: 14, cursor: 'grab', userSelect: 'none', flexShrink: 0 }}>&#10303;</span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                            textTransform: 'uppercase', background: ts.bg, color: ts.color,
                          }}>{ts.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: SD.ink, flex: 1 }}>{msg.title}</span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                            textTransform: 'uppercase', background: tm.bg, color: tm.color, flexShrink: 0,
                          }}>{tm.label}</span>
                        </div>
                        <div style={{ fontSize: 12, color: SD.inkMid, lineHeight: 1.5, paddingLeft: 22 }}>{s.reasoning}</div>
                      </div>
                    )
                  })}
                </div>

                {/* Show more / Hide extras toggle */}
                {orderedExtras.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <button
                      onClick={() => setAltShowExtras(v => !v)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 12, fontWeight: 600, color: SD.tealDeep, padding: '4px 0',
                      }}
                    >
                      {altShowExtras ? 'Hide extras' : `Show more (${orderedExtras.length})`}
                    </button>

                    {altShowExtras && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                        {orderedExtras.map(s => {
                          const msg = msgMap.get(s.message_id)
                          if (!msg) return null
                          const ts = TYPE_STYLES[msg.type] ?? TYPE_STYLES.update
                          const tm = TIMING_STYLES[s.timing] ?? TIMING_STYLES.send_now
                          return (
                            <div
                              key={s.message_id}
                              style={{
                                padding: '10px 12px', background: SD.paper,
                                borderRadius: 8, border: `1px solid ${SD.line}`,
                                opacity: 0.7,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{
                                  fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                                  textTransform: 'uppercase', background: ts.bg, color: ts.color,
                                }}>{ts.label}</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: SD.inkMid, flex: 1 }}>{msg.title}</span>
                                <span style={{
                                  fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                                  textTransform: 'uppercase', background: tm.bg, color: tm.color, flexShrink: 0,
                                }}>{tm.label}</span>
                              </div>
                              <div style={{ fontSize: 12, color: SD.inkMid, lineHeight: 1.5 }}>{s.reasoning}</div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Update suggestions button */}
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={handleUpdateSuggestions}
                    disabled={altGenerating}
                    style={{
                      padding: '4px 12px', borderRadius: 5, border: `1px solid ${SD.line}`,
                      background: '#fff', fontSize: 11, fontWeight: 600, cursor: altGenerating ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', color: SD.inkMute, opacity: altGenerating ? 0.5 : 1,
                    }}
                  >
                    {altGenerating ? 'Updating...' : 'Update suggestions'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

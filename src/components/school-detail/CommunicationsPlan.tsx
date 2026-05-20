'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Message, MessageType, Category, SchoolMessagePlanSuggestion } from '@/lib/types'

// Design tokens — match SchoolDetailClient's SD
const SD = {
  paper: '#F6F1E8', ink: '#0E0E0E', inkMid: '#4A4A4A',
  inkLo: '#7A7570', inkMute: '#A8A39B', line: '#E2DBC9',
  white: '#fff', teal: '#00B2A9', tealDeep: '#006A65', red: '#C8102E',
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

const TIER_COLORS: Record<Category, { bg: string; color: string }> = {
  A: { bg: '#FEE2E2', color: '#991B1B' },
  B: { bg: '#FEF3C7', color: '#92400E' },
  C: { bg: '#E0E7FF', color: '#3730A3' },
  Nope: { bg: '#F3F4F6', color: '#6B7280' },
}

interface CoverageRow {
  id: string
  message_id: string
  school_id: string
  contact_log_id: string | null
  detected_at: string
  notes: string | null
  message: Message | null
  contact_log: { date: string; summary: string | null } | null
}

interface PlanData {
  id: string
  school_id: string
  finn_notes: string | null
  suggestions: { items: SchoolMessagePlanSuggestion[] } | null
  suggestions_generated_at: string | null
  manual_order: string[] | null
}

interface QARow {
  id: string
  school_id: string
  question: string
  answer: string
  created_at: string
}

interface Props {
  schoolId: string
}

export default function CommunicationsPlan({ schoolId }: Props) {
  const [plan, setPlan] = useState<PlanData | null>(null)
  const [coverage, setCoverage] = useState<CoverageRow[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [coverageOpen, setCoverageOpen] = useState(false)
  const [showExtras, setShowExtras] = useState(false)
  const [notes, setNotes] = useState('')
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Q&A state
  const [qaHistory, setQaHistory] = useState<QARow[]>([])
  const [qaInput, setQaInput] = useState('')
  const [qaLoading, setQaLoading] = useState(false)

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const fetchPlan = useCallback(async () => {
    const res = await fetch(`/api/schools/${schoolId}/message-plan`)
    if (!res.ok) return
    const data = await res.json()
    setPlan(data.plan)
    setCoverage(data.coverage ?? [])
    if (data.plan?.finn_notes) setNotes(data.plan.finn_notes)
    setLoading(false)
  }, [schoolId])

  const fetchQA = useCallback(async () => {
    const res = await fetch(`/api/schools/${schoolId}/strategy-question`)
    if (!res.ok) return
    const data = await res.json()
    setQaHistory(data.questions ?? [])
  }, [schoolId])

  useEffect(() => {
    fetchPlan()
    fetchQA()
    const supabase = (async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const sb = createClient()
      const { data } = await sb.from('messages').select('*').eq('status', 'active')
      if (data) setMessages(data as Message[])
      return sb
    })()
    return () => { supabase.then(sb => sb.removeAllChannels()) }
  }, [fetchPlan, fetchQA])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/schools/${schoolId}/message-plan`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setPlan(data.plan)
      }
    } finally {
      setGenerating(false)
    }
  }

  function handleNotesChange(value: string) {
    setNotes(value)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(async () => {
      await fetch(`/api/schools/${schoolId}/message-plan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finn_notes: value }),
      })
    }, 1000)
  }

  async function handleAsk() {
    if (!qaInput.trim() || qaLoading) return
    setQaLoading(true)
    try {
      const res = await fetch(`/api/schools/${schoolId}/strategy-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: qaInput.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.question) {
          setQaHistory(prev => [data.question, ...prev].slice(0, 5))
          setQaInput('')
        }
      }
    } finally {
      setQaLoading(false)
    }
  }

  // ── Suggestion ordering ──────────────────────────────────────────────────

  const allSuggestions = plan?.suggestions?.items ?? []
  const msgMap = new Map(messages.map(m => [m.id, m]))

  const primaryItems = allSuggestions.filter(s => s.tier !== 'extra')
  const extraItems = allSuggestions.filter(s => s.tier === 'extra')

  // Apply manual_order to primary items
  const orderedPrimary = (() => {
    const order = plan?.manual_order
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

  // ── Drag-to-reorder (HTML5 DnD) ──────────────────────────────────────────

  function handleDragStart(idx: number) {
    setDragIdx(idx)
  }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDragOverIdx(idx)
  }
  function handleDragLeave() {
    setDragOverIdx(null)
  }
  async function handleDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null); setDragOverIdx(null); return
    }
    const newOrder = [...orderedPrimary]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(targetIdx, 0, moved)
    setDragIdx(null); setDragOverIdx(null)

    const newManualOrder = newOrder.map(s => s.message_id)
    // Optimistic: update plan state immediately
    setPlan(prev => prev ? { ...prev, manual_order: newManualOrder } : prev)
    // Persist
    await fetch(`/api/schools/${schoolId}/message-plan`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manual_order: newManualOrder }),
    })
  }
  function handleDragEnd() {
    setDragIdx(null); setDragOverIdx(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) return null

  return (
    <section style={{ marginBottom: 32 }}>
      {/* Section header */}
      <h2 style={{
        margin: '0 0 18px', fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 700,
        letterSpacing: '-0.04em', color: SD.ink, fontStyle: 'italic',
      }}>Communications plan.</h2>

      {/* ── 1. Coverage (collapsible) ─────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setCoverageOpen(o => !o)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 8, padding: 0,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: SD.ink }}>
            What this coach has heard ({coverage.length})
          </span>
          <span style={{
            fontSize: 11, color: SD.inkMute,
            transform: coverageOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s', display: 'inline-block',
          }}>&#9660;</span>
        </button>

        {coverageOpen && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {coverage.length === 0 ? (
              <div style={{ fontSize: 12, color: SD.inkLo, fontStyle: 'italic', padding: '4px 0' }}>
                Nothing detected as covered yet.
              </div>
            ) : [...coverage]
              .sort((a, b) => {
                const da = a.contact_log?.date ?? a.detected_at
                const db2 = b.contact_log?.date ?? b.detected_at
                return db2.localeCompare(da)
              })
              .map(c => {
              const msg = c.message
              if (!msg) return null
              const ts = TYPE_STYLES[msg.type] ?? TYPE_STYLES.update
              const contactDate = c.contact_log?.date
              const excerpt = c.contact_log?.summary?.slice(0, 60)
              return (
                <div key={c.id} style={{
                  padding: '8px 12px', background: SD.white, borderRadius: 6,
                  border: `1px solid ${SD.line}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                      textTransform: 'uppercase', background: ts.bg, color: ts.color,
                    }}>{ts.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: SD.ink, flex: 1 }}>{msg.title}</span>
                    <span style={{ fontSize: 11, color: SD.inkLo }}>
                      {contactDate ? new Date(contactDate + 'T00:00:00').toLocaleDateString() : new Date(c.detected_at).toLocaleDateString()}
                    </span>
                    {c.contact_log_id && (
                      <a
                        href={`#contact-log-${c.contact_log_id}`}
                        onClick={(e) => {
                          e.preventDefault()
                          const el = document.getElementById(`contact-log-${c.contact_log_id}`)
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                            el.style.transition = 'background 0.3s'
                            el.style.background = '#FEF3C7'
                            setTimeout(() => { el.style.background = '' }, 1500)
                          }
                        }}
                        style={{ fontSize: 10, color: SD.teal, textDecoration: 'none', flexShrink: 0 }}
                      >source</a>
                    )}
                  </div>
                  {excerpt && (
                    <div style={{
                      fontSize: 11, color: SD.inkMute, marginTop: 4,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      &ldquo;{excerpt}{(c.contact_log?.summary?.length ?? 0) > 60 ? '...' : ''}&rdquo;
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 2. Suggested next messages ────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: SD.ink }}>Suggested next messages</span>
          {orderedPrimary.length > 0 && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              title="Regenerate based on the latest conversation"
              style={{
                padding: '4px 12px', borderRadius: 5, border: `1px solid ${SD.line}`,
                background: SD.white, fontSize: 11, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', color: SD.inkMute, opacity: generating ? 0.5 : 1,
              }}
            >
              {generating ? 'Updating...' : 'Update suggestions'}
            </button>
          )}
        </div>

        {orderedPrimary.length === 0 && !generating ? (
          <div style={{ textAlign: 'center', padding: '20px 16px' }}>
            <div style={{ fontSize: 13, color: SD.inkLo, marginBottom: 12 }}>
              No suggestions generated yet.
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                padding: '8px 20px', borderRadius: 7, border: 'none',
                background: SD.ink, color: SD.white, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Generate suggestions
            </button>
          </div>
        ) : generating ? (
          <div style={{ textAlign: 'center', padding: '20px 16px' }}>
            <div style={{ fontSize: 13, color: SD.inkLo }}>Analyzing conversation and inventory...</div>
          </div>
        ) : (
          <>
            {/* Primary list (draggable) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {orderedPrimary.map((s, i) => (
                <SuggestionRow
                  key={s.message_id}
                  suggestion={s}
                  message={msgMap.get(s.message_id) ?? null}
                  draggable
                  isDragging={dragIdx === i}
                  isDragOver={dragOverIdx === i}
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDragLeave={handleDragLeave}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>

            {/* Show me more / Hide extras toggle */}
            {orderedExtras.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => setShowExtras(v => !v)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 12, fontWeight: 600, color: SD.tealDeep, padding: '4px 0',
                  }}
                >
                  {showExtras ? 'Hide extras' : `Show me more (${orderedExtras.length})`}
                </button>

                {showExtras && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                    {orderedExtras.map(s => (
                      <SuggestionRow
                        key={s.message_id}
                        suggestion={s}
                        message={msgMap.get(s.message_id) ?? null}
                        muted
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {plan?.suggestions_generated_at && (
              <div style={{ fontSize: 10, color: SD.inkMute, marginTop: 8 }}>
                Generated {new Date(plan.suggestions_generated_at).toLocaleDateString()}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 3. Anything else to cover ─────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: SD.ink, display: 'block', marginBottom: 6 }}>
          Anything else to cover
        </span>
        <textarea
          value={notes}
          onChange={e => handleNotesChange(e.target.value)}
          placeholder="Add anything you want upcoming emails to cover that isn't suggested above — specific points, context, things on your mind."
          rows={3}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 6,
            border: `1px solid ${SD.line}`, fontSize: 13, fontFamily: 'inherit',
            color: SD.ink, resize: 'vertical', boxSizing: 'border-box',
            background: SD.white, outline: 'none',
          }}
        />
      </div>

      {/* ── 4. Ask about this school ──────────────────────────────────────── */}
      <div>
        <span style={{ fontSize: 13, fontWeight: 700, color: SD.ink, display: 'block', marginBottom: 6 }}>
          Ask about this school
        </span>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            value={qaInput}
            onChange={e => setQaInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk() } }}
            placeholder="Should I push for a call? Is this going cold?"
            disabled={qaLoading}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 6,
              border: `1px solid ${SD.line}`, fontSize: 13, fontFamily: 'inherit',
              color: SD.ink, background: SD.white, outline: 'none',
            }}
          />
          <button
            onClick={handleAsk}
            disabled={qaLoading || !qaInput.trim()}
            style={{
              padding: '8px 16px', borderRadius: 6, border: 'none',
              background: qaLoading || !qaInput.trim() ? SD.line : SD.ink,
              color: qaLoading || !qaInput.trim() ? SD.inkMute : SD.white,
              fontSize: 13, fontWeight: 600, cursor: qaLoading || !qaInput.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            {qaLoading ? 'Thinking...' : 'Ask'}
          </button>
        </div>

        {qaHistory.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {qaHistory.map(qa => (
              <div key={qa.id} style={{
                padding: '10px 14px', background: SD.white, borderRadius: 8,
                border: `1px solid ${SD.line}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: SD.ink, marginBottom: 4 }}>
                  {qa.question}
                </div>
                <div style={{ fontSize: 12, color: SD.inkMid, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {qa.answer}
                </div>
                <div style={{ fontSize: 10, color: SD.inkMute, marginTop: 6 }}>
                  {new Date(qa.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    timeZone: 'America/Denver',
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ── Suggestion row component ────────────────────────────────────────────────

function SuggestionRow({
  suggestion: s,
  message: msg,
  draggable: isDraggable,
  muted,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  suggestion: SchoolMessagePlanSuggestion
  message: Message | null
  draggable?: boolean
  muted?: boolean
  isDragging?: boolean
  isDragOver?: boolean
  onDragStart?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: () => void
  onDrop?: () => void
  onDragEnd?: () => void
}) {
  if (!msg) return null
  const ts = TYPE_STYLES[msg.type] ?? TYPE_STYLES.update
  const tm = TIMING_STYLES[s.timing] ?? TIMING_STYLES.send_now

  return (
    <div
      draggable={isDraggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop?.() }}
      onDragEnd={onDragEnd}
      style={{
        padding: '10px 12px', background: muted ? SD.paper : SD.white,
        borderRadius: 8, border: `1px solid ${isDragOver ? SD.teal : SD.line}`,
        opacity: isDragging ? 0.4 : muted ? 0.7 : 1,
        cursor: isDraggable ? 'grab' : 'default',
        transition: 'border-color 0.1s, opacity 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        {isDraggable && (
          <span style={{ color: SD.inkMute, fontSize: 14, cursor: 'grab', userSelect: 'none', flexShrink: 0 }}>⠿</span>
        )}
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
          textTransform: 'uppercase', background: ts.bg, color: ts.color,
        }}>{ts.label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: muted ? SD.inkMid : SD.ink, flex: 1 }}>{msg.title}</span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
          textTransform: 'uppercase', background: tm.bg, color: tm.color, flexShrink: 0,
        }}>{tm.label}</span>
      </div>
      <div style={{ fontSize: 12, color: SD.inkMid, lineHeight: 1.5, paddingLeft: isDraggable ? 22 : 0 }}>{s.reasoning}</div>
    </div>
  )
}

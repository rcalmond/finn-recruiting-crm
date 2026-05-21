'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Message, MessageType, SchoolMessagePlanSuggestion } from '@/lib/types'

// ─── Mode types ──────────────────────────────────────────────────────────────

type DraftModalMode =
  | { kind: 'fresh'; schoolId: string; coachId: string; schoolName: string; coachName?: string }
  | { kind: 'reply'; schoolId: string; coachId: string; schoolName: string; coachName?: string;
      replyToContactLogId: string; inboundChannel?: string }
  | { kind: 'campaign'; schoolId: string; coachId: string; schoolName: string; coachName?: string;
      coachRole?: string; schoolTier?: string; campaignId: string;
      renderedBody: string; channelRec?: 'gmail' | 'sr' | null;
      hasMessageSet?: boolean; isArchived?: boolean }

export interface TaskContext {
  type: 'send_reel' | 'general'
  metadata?: {
    reelUrl?: string
    reelTitle?: string
  }
}

interface DraftModalProps {
  mode: DraftModalMode
  userId: string
  onClose: () => void
  onSent?: (channel?: 'gmail' | 'sr') => void
  onDismissed?: () => void  // campaign mode only
  taskContext?: TaskContext
}

// ─── Plan data types ────────────────────────────────────────────────────────

interface PlanData {
  suggestions: { items: SchoolMessagePlanSuggestion[] } | null
  finn_notes: string | null
  manual_order: string[] | null
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

// ─── Stages ──────────────────────────────────────────────────────────────────

type Stage =
  | 'loading'   // Loading plan data
  | 'pick'      // Plan loaded, Finn picks what to cover
  | 'generate'  // Generating email
  | 'review'    // Email ready for review/edit/send

// ─── Component ───────────────────────────────────────────────────────────────

export default function DraftModal({ mode, userId, onClose, onSent, onDismissed, taskContext }: DraftModalProps) {
  const isCampaign = mode.kind === 'campaign'
  const isReply = mode.kind === 'reply'
  const isFresh = mode.kind === 'fresh'
  const campaignHasMessageSet = isCampaign && mode.hasMessageSet
  const campaignIsArchived = isCampaign && mode.isArchived

  const [stage, setStage] = useState<Stage>(isCampaign ? (campaignHasMessageSet ? 'generate' : 'review') : 'loading')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState(isCampaign && !campaignHasMessageSet ? mode.renderedBody : '')
  const [cachedBody, setCachedBody] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedBody, setCopiedBody] = useState(false)
  const [copiedSubject, setCopiedSubject] = useState(false)
  const [ccCopied, setCcCopied] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [regenHint, setRegenHint] = useState('')

  // Plan-driven state (fresh/reply only)
  const [planData, setPlanData] = useState<PlanData | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [showExtras, setShowExtras] = useState(false)
  const [coverageNotes, setCoverageNotes] = useState('')

  // ── Load plan data for fresh/reply ──────────────────────────────────────

  const loadPlan = useCallback(async () => {
    if (isCampaign) return
    setStage('loading')
    try {
      const [planRes, msgRes] = await Promise.all([
        fetch(`/api/schools/${mode.schoolId}/message-plan`),
        (async () => {
          const { createClient } = await import('@/lib/supabase/client')
          const sb = createClient()
          return sb.from('messages').select('*').eq('status', 'active')
        })(),
      ])
      const planJson = planRes.ok ? await planRes.json() : { plan: null }
      const plan = planJson.plan as PlanData | null
      setPlanData(plan)
      if (plan?.finn_notes) setCoverageNotes(plan.finn_notes)
      if (msgRes.data) setMessages(msgRes.data as Message[])

      // Pre-check send_now items
      const items = plan?.suggestions?.items ?? []
      const primaryItems = items.filter(s => s.tier !== 'extra')
      const preChecked = new Set(
        primaryItems.filter(s => s.timing === 'send_now').map(s => s.message_id)
      )
      setCheckedIds(preChecked)
      setStage('pick')
    } catch {
      setStage('pick') // Still allow manual coverage notes
    }
  }, [mode.schoolId, isCampaign])

  useEffect(() => { if (!isCampaign) loadPlan() }, [loadPlan, isCampaign])

  // ── Campaign LLM draft: fetch or generate on mount ────────────────────────

  const fetchCampaignDraft = useCallback(async (regenerate = false, hint?: string) => {
    if (!isCampaign) return
    setStage('generate')
    setGenerating(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        campaignId: mode.campaignId,
        schoolId: mode.schoolId,
        coachId: mode.coachId,
        regenerate,
      }
      if (hint?.trim()) payload.hint = hint.trim()
      const res = await fetch('/api/campaigns/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Generation failed')

      if (json.fallback) {
        setBody(mode.renderedBody)
        setCachedBody(mode.renderedBody)
      } else if (json.draft) {
        setBody(json.draft.body)
        setCachedBody(json.draft.body)
        if (json.draft.subject) setSubject(json.draft.subject)
      }
      setStage('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
      setBody(mode.renderedBody)
      setCachedBody(mode.renderedBody)
      setStage('review')
    } finally {
      setGenerating(false)
    }
  }, [isCampaign, mode])

  useEffect(() => {
    if (campaignHasMessageSet) fetchCampaignDraft(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Ordered suggestions ──────────────────────────────────────────────────

  const allSuggestions = planData?.suggestions?.items ?? []
  const msgMap = new Map(messages.map(m => [m.id, m]))

  const primaryItems = allSuggestions.filter(s => s.tier !== 'extra')
  const extraItems = allSuggestions.filter(s => s.tier === 'extra')

  const orderedPrimary = (() => {
    const order = planData?.manual_order
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

  // ── Generate email (fresh/reply — plan-driven) ──────────────────────────

  async function handleGenerate() {
    setStage('generate')
    setError(null)
    setSubject('')
    setBody('')
    try {
      // Build coverage items from checked messages
      const coverageItems = Array.from(checkedIds)
        .map(id => {
          const msg = msgMap.get(id)
          if (!msg) return null
          return { title: msg.title, type: msg.type, notes: msg.notes }
        })
        .filter(Boolean) as Array<{ title: string; type: string; notes: string | null }>

      const payload: Record<string, unknown> = {
        schoolId: mode.schoolId,
        coachId: mode.coachId,
      }
      if (coverageItems.length > 0) payload.coverageItems = coverageItems
      if (coverageNotes.trim()) payload.coverageNotes = coverageNotes.trim()
      if (isReply) payload.replyToContactLogId = mode.replyToContactLogId
      if (taskContext) payload.taskContext = taskContext

      // Fallback: if nothing checked and no notes, pass a generic brief
      if (coverageItems.length === 0 && !coverageNotes.trim()) {
        payload.brief = 'General check-in and update'
      }

      const res = await fetch('/api/draft-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Generation failed')

      if (json.subject) setSubject(json.subject)
      setBody(json.body ?? '')
      setCachedBody(json.body ?? '')
      setStage('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
      setStage('pick')
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function handleMarkSent(channel: 'gmail' | 'sr') {
    if (isCampaign) {
      setSending(channel)
      setError(null)
      try {
        const res = await fetch(`/api/campaigns/${mode.campaignId}/schools/${mode.schoolId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'mark_sent', channel }),
        })
        const json = await res.json()
        if (!res.ok) { setError(json.error ?? 'Failed'); return }
        onSent?.(channel)
        onClose()
      } finally {
        setSending(null)
      }
    } else {
      onSent?.(channel)
      onClose()
    }
  }

  async function handleDismiss() {
    if (!isCampaign) return
    setSending('dismiss')
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${mode.campaignId}/schools/${mode.schoolId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed'); return }
      onDismissed?.()
      onClose()
    } finally {
      setSending(null)
    }
  }

  async function handleCampaignPersonalize() {
    if (!isCampaign) return
    const savedBody = body
    setGenerating(true)
    setError(null)
    setBody('')
    try {
      const res = await fetch('/api/campaigns/personalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: mode.schoolId,
          coachId: mode.coachId,
          renderedBody: savedBody,
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        setBody(savedBody)
        setError(json.error ?? 'Generation failed')
        return
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setBody(accumulated)
      }
      accumulated += decoder.decode()
      setBody(accumulated)
    } catch (e) {
      setBody(savedBody)
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  function handleStartOver() {
    if (isCampaign && cachedBody !== null) {
      setBody(cachedBody)
    } else if (!isCampaign) {
      // Go back to pick stage
      setStage('pick')
      setBody('')
      setSubject('')
      setCachedBody(null)
    }
  }

  async function handleCampaignRegenerate() {
    const hint = regenHint.trim() || undefined
    setRegenHint('')
    await fetchCampaignDraft(true, hint)
  }

  // ── Campaign subject (templated) ──────────────────────────────────────────

  const campaignSubject = isCampaign
    ? `Finn Almond | Left Wingback | Class of 2027 | ${mode.schoolName}`
    : ''

  // ── Can generate? ─────────────────────────────────────────────────────────

  const canGenerate = checkedIds.size > 0 || coverageNotes.trim().length > 0

  // ── Toggle checkbox ────────────────────────────────────────────────────────

  function toggleCheck(messageId: string) {
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (next.has(messageId)) next.delete(messageId)
      else next.add(messageId)
      return next
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#fff', borderRadius: 12, width: '100%', maxWidth: 600,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          flexShrink: 0,
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              {isCampaign ? 'Campaign Draft' : isReply ? 'Draft Reply' : 'Draft Email'}
            </h3>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              <span>{mode.schoolName}</span>
              {isCampaign && mode.schoolTier && (
                <span style={{
                  marginLeft: 6, padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                  background: mode.schoolTier === 'A' ? '#FEE2E2' : mode.schoolTier === 'B' ? '#DBEAFE' : '#F3F4F6',
                  color: mode.schoolTier === 'A' ? '#991B1B' : mode.schoolTier === 'B' ? '#1E40AF' : '#374151',
                }}>{mode.schoolTier}</span>
              )}
              {mode.coachName && (
                <span> &middot; {mode.coachName}{isCampaign && mode.coachRole ? ` (${mode.coachRole})` : ''}</span>
              )}
            </div>
            {isReply && mode.inboundChannel && (
              <div style={{
                fontSize: 11, color: '#0d9488', marginTop: 4, fontWeight: 600,
              }}>
                Coach sent via {mode.inboundChannel} — reply via {mode.inboundChannel} to continue thread
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: 20, cursor: 'pointer',
              color: '#94a3b8', padding: 4, lineHeight: 1,
            }}
          >&times;</button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: 24,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {/* Error */}
          {error && (
            <div style={{
              fontSize: 12.5, color: '#dc2626', background: '#fef2f2',
              borderRadius: 6, padding: '10px 14px', border: '1px solid #fecaca',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ flex: 1 }}>Generation failed.</span>
              <button
                onClick={() => { setError(null); handleGenerate() }}
                style={{
                  padding: '3px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                  background: '#dc2626', color: '#fff',
                }}
              >
                Retry
              </button>
              <button
                onClick={() => setError(null)}
                style={{
                  padding: '3px 10px', borderRadius: 5, border: '1px solid #fecaca',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                  background: '#fff', color: '#dc2626',
                }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ── Loading plan ──────────────────────────────────────────── */}
          {stage === 'loading' && (
            <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Loading plan...
            </div>
          )}

          {/* ── Pick: plan-driven checklist (fresh/reply) ─────────────── */}
          {stage === 'pick' && !isCampaign && (
            <>
              {orderedPrimary.length > 0 && (
                <div>
                  <Label>What to cover</Label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                    {orderedPrimary.map(s => {
                      const msg = msgMap.get(s.message_id)
                      if (!msg) return null
                      const ts = TYPE_STYLES[msg.type] ?? TYPE_STYLES.update
                      const tm = TIMING_STYLES[s.timing] ?? TIMING_STYLES.send_now
                      const checked = checkedIds.has(s.message_id)
                      return (
                        <label
                          key={s.message_id}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                            padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                            border: `1px solid ${checked ? '#7c3aed' : '#e2e8f0'}`,
                            background: checked ? '#f5f3ff' : '#fff',
                            transition: 'border-color 0.1s, background 0.1s',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCheck(s.message_id)}
                            style={{ marginTop: 2, accentColor: '#7c3aed' }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                                textTransform: 'uppercase', background: ts.bg, color: ts.color,
                              }}>{ts.label}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{msg.title}</span>
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                                textTransform: 'uppercase', background: tm.bg, color: tm.color,
                              }}>{tm.label}</span>
                            </div>
                            {s.reasoning && (
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, lineHeight: 1.4 }}>
                                {s.reasoning.length > 120 ? s.reasoning.slice(0, 120) + '...' : s.reasoning}
                              </div>
                            )}
                          </div>
                        </label>
                      )
                    })}
                  </div>

                  {/* Show plan extras */}
                  {orderedExtras.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <button
                        onClick={() => setShowExtras(v => !v)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 11, fontWeight: 600, color: '#6366f1', padding: '4px 0',
                          fontFamily: 'inherit',
                        }}
                      >
                        {showExtras ? 'Hide extras' : `Show plan extras (${orderedExtras.length})`}
                      </button>
                      {showExtras && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                          {orderedExtras.map(s => {
                            const msg = msgMap.get(s.message_id)
                            if (!msg) return null
                            const ts = TYPE_STYLES[msg.type] ?? TYPE_STYLES.update
                            const checked = checkedIds.has(s.message_id)
                            return (
                              <label
                                key={s.message_id}
                                style={{
                                  display: 'flex', alignItems: 'flex-start', gap: 10,
                                  padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                                  border: `1px solid ${checked ? '#7c3aed' : '#f1f5f9'}`,
                                  background: checked ? '#f5f3ff' : '#f8fafc',
                                  opacity: 0.8,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleCheck(s.message_id)}
                                  style={{ marginTop: 2, accentColor: '#7c3aed' }}
                                />
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{
                                      fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                                      textTransform: 'uppercase', background: ts.bg, color: ts.color,
                                    }}>{ts.label}</span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{msg.title}</span>
                                  </div>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {orderedPrimary.length === 0 && (
                <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                  No plan suggestions yet. Generate them on the school page, or describe what to cover below.
                </div>
              )}

              <div>
                <Label>Anything else to cover</Label>
                <textarea
                  value={coverageNotes}
                  onChange={e => setCoverageNotes(e.target.value)}
                  rows={3}
                  placeholder="Add specific points, context, or things on your mind for this email..."
                  style={{ ...fieldStyle, resize: 'vertical', marginTop: 4 }}
                />
              </div>
            </>
          )}

          {/* ── Generating ────────────────────────────────────────────── */}
          {stage === 'generate' && (
            <div style={{
              padding: '40px 0', textAlign: 'center', color: '#94a3b8',
              fontSize: 13,
            }}>
              {campaignHasMessageSet ? 'Generating personalized draft...' : 'Generating draft...'}
            </div>
          )}

          {/* ── Review ────────────────────────────────────────────────── */}
          {stage === 'review' && (
            <>
              {/* Subject (fresh only) */}
              {isFresh && (
                <div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: 4,
                  }}>
                    <Label>Subject</Label>
                    <button
                      onClick={() => copyToClipboard(subject, setCopiedSubject)}
                      style={copyBtnStyle(copiedSubject)}
                    >
                      {copiedSubject ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    style={fieldStyle}
                  />
                </div>
              )}

              {/* Subject helper (reply) */}
              {isReply && (
                <div style={{
                  fontSize: 12, color: '#94a3b8', fontStyle: 'italic',
                  background: '#f8fafc', padding: '8px 12px', borderRadius: 6,
                  border: '1px solid #f1f5f9',
                }}>
                  Re: (uses your email client's thread subject)
                </div>
              )}

              {/* Subject (campaign) */}
              {isCampaign && (
                <div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: 4,
                  }}>
                    <Label>Subject</Label>
                    <button
                      onClick={() => copyToClipboard(campaignSubject, setCopiedSubject)}
                      style={copyBtnStyle(copiedSubject)}
                    >
                      {copiedSubject ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div style={{
                    ...fieldStyle,
                    background: '#f8fafc', color: '#334155',
                    cursor: 'default', userSelect: 'text',
                  }}>
                    {campaignSubject}
                  </div>
                </div>
              )}

              {/* CC reminder */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 6,
                background: '#F0F4FF', border: '1px solid #C7D2FE',
                fontSize: 12, color: '#4338CA', lineHeight: 1.4,
              }}>
                <span style={{ flexShrink: 0 }}>CC</span>
                <code
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText('finn@in.finnsoccer.com')
                      setCcCopied(true)
                      setTimeout(() => setCcCopied(false), 2000)
                    } catch { /* noop */ }
                  }}
                  title="Click to copy"
                  style={{
                    background: ccCopied ? '#DCFCE7' : '#E0E7FF',
                    padding: '1px 5px', borderRadius: 3,
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    fontSize: 11.5, cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {ccCopied ? 'copied!' : 'finn@in.finnsoccer.com'}
                </code>
                <span>so it shows up in your school timeline</span>
              </div>

              {/* Channel recommendation (campaign only) */}
              {isCampaign && mode.channelRec && (
                <div style={{
                  padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  background: mode.channelRec === 'gmail' ? '#DCFCE7' : mode.channelRec === 'sr' ? '#DBEAFE' : '#f8fafc',
                  color: mode.channelRec === 'gmail' ? '#16A34A' : mode.channelRec === 'sr' ? '#0369A1' : '#7A7570',
                }}>
                  {mode.channelRec === 'gmail' ? 'Recommended: Gmail' : mode.channelRec === 'sr' ? 'Recommended: SR' : 'No recommendation'}
                </div>
              )}

              {/* Body */}
              <div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 4,
                }}>
                  <Label>
                    {isCampaign ? 'Message — editable (per-school only, does not update template)' : 'Body'}
                  </Label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {isCampaign && !campaignHasMessageSet && (
                      <button
                        onClick={handleCampaignPersonalize}
                        disabled={generating || sending !== null}
                        title="Fill [Finn: ...] placeholders with AI-generated content"
                        style={{
                          ...copyBtnStyle(false),
                          opacity: generating || sending !== null ? 0.5 : 1,
                          cursor: generating || sending !== null ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {generating ? 'Generating...' : 'Personalize with AI'}
                      </button>
                    )}
                    <button
                      onClick={() => copyToClipboard(body, setCopiedBody)}
                      style={copyBtnStyle(copiedBody)}
                    >
                      {copiedBody ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                <textarea
                  value={body}
                  onChange={e => !generating && setBody(e.target.value)}
                  readOnly={generating}
                  rows={12}
                  style={{
                    ...fieldStyle, resize: generating ? 'none' : 'vertical',
                    lineHeight: 1.6,
                    color: generating ? '#94a3b8' : '#0f172a',
                  }}
                />
              </div>

              {/* Regenerate with hint (campaign + message_set only) */}
              {isCampaign && campaignHasMessageSet && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={regenHint}
                    onChange={e => setRegenHint(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !generating) handleCampaignRegenerate() }}
                    placeholder="What should change? (e.g., 'shorter', 'lead with camp')"
                    disabled={generating || sending !== null}
                    style={{
                      flex: 1, padding: '6px 10px', borderRadius: 6,
                      border: '1px solid #e2e8f0', fontSize: 12,
                      fontFamily: 'inherit', outline: 'none',
                      color: '#334155', background: '#fff',
                    }}
                  />
                  <button
                    onClick={handleCampaignRegenerate}
                    disabled={generating || sending !== null}
                    style={{
                      ...copyBtnStyle(false),
                      opacity: generating || sending !== null ? 0.5 : 1,
                      cursor: generating || sending !== null ? 'not-allowed' : 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {generating ? 'Generating...' : 'Regenerate'}
                  </button>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {campaignIsArchived && (
                  <div style={{
                    fontSize: 12, color: '#6B7280', background: '#F3F4F6',
                    padding: '8px 12px', borderRadius: 6, fontWeight: 600,
                  }}>
                    This campaign is archived. Unarchive to send.
                  </div>
                )}
                {!campaignIsArchived && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleMarkSent('gmail')}
                    disabled={sending !== null || generating}
                    style={{
                      ...actionBtn('#059669', '#fff'),
                      opacity: sending !== null || generating ? 0.5 : 1,
                      cursor: sending !== null || generating ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {sending === 'gmail' ? 'Marking...' : 'Mark as sent via Gmail'}
                  </button>
                  <button
                    onClick={() => handleMarkSent('sr')}
                    disabled={sending !== null || generating}
                    style={{
                      ...actionBtn('#2563eb', '#fff'),
                      opacity: sending !== null || generating ? 0.5 : 1,
                      cursor: sending !== null || generating ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {sending === 'sr' ? 'Marking...' : 'Mark as sent via SR'}
                  </button>
                </div>}

                {isCampaign && (
                  <button
                    onClick={handleDismiss}
                    disabled={sending !== null || generating}
                    style={{
                      padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      cursor: sending !== null || generating ? 'not-allowed' : 'pointer',
                      border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#C8102E',
                      opacity: sending !== null || generating ? 0.5 : 1,
                      alignSelf: 'flex-start',
                    }}
                  >
                    {sending === 'dismiss' ? 'Dismissing...' : 'Dismiss from this campaign'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid #f1f5f9',
          display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0,
        }}>
          <button onClick={onClose} style={cancelBtnStyle}>Close</button>

          {stage === 'pick' && (
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              style={{
                ...generateBtnStyle,
                opacity: canGenerate ? 1 : 0.5,
                cursor: canGenerate ? 'pointer' : 'not-allowed',
              }}
            >
              Generate
            </button>
          )}

          {stage === 'review' && !isCampaign && (
            <button
              onClick={handleStartOver}
              style={{ ...generateBtnStyle, background: '#475569' }}
            >
              Start over
            </button>
          )}

          {stage === 'review' && isCampaign && cachedBody !== null && body !== cachedBody && (
            <button
              onClick={handleStartOver}
              disabled={generating}
              style={{ ...generateBtnStyle, background: '#475569', opacity: generating ? 0.5 : 1 }}
            >
              Revert to draft
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Utility components ──────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b',
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      {children}
    </span>
  )
}

function copyBtnStyle(copied: boolean): React.CSSProperties {
  return {
    padding: '3px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
    fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
    background: copied ? '#059669' : '#eff6ff',
    color: copied ? '#fff' : '#2563eb',
    transition: 'background 0.2s',
  }
}

function actionBtn(bg: string, color: string): React.CSSProperties {
  return {
    padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: bg, color,
  }
}

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
  fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#0f172a',
  outline: 'none', boxSizing: 'border-box',
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#f1f5f9', color: '#475569',
}

const generateBtnStyle: React.CSSProperties = {
  padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#7c3aed', color: '#fff',
}

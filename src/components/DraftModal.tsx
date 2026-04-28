'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { todayStr } from '@/lib/utils'

// ─── Mode types ──────────────────────────────────────────────────────────────

type DraftModalMode =
  | { kind: 'fresh'; schoolId: string; coachId: string; schoolName: string; coachName?: string }
  | { kind: 'reply'; schoolId: string; coachId: string; schoolName: string; coachName?: string;
      replyToContactLogId: string; inboundChannel?: string }

interface DraftModalProps {
  mode: DraftModalMode
  userId: string
  onClose: () => void
  onSent?: () => void
}

// ─── Stages ──────────────────────────────────────────────────────────────────

type Stage =
  | 'suggest'   // Stage 1: loading topics
  | 'pick'      // Stage 1: topics loaded, Finn picks or writes brief
  | 'generate'  // Stage 2: generating email
  | 'review'    // Stage 3: email ready for review/edit/send

// ─── Component ───────────────────────────────────────────────────────────────

export default function DraftModal({ mode, userId, onClose, onSent }: DraftModalProps) {
  const [stage, setStage] = useState<Stage>('suggest')
  const [topics, setTopics] = useState<string[]>([])
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [brief, setBrief] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copiedBody, setCopiedBody] = useState(false)
  const [copiedSubject, setCopiedSubject] = useState(false)
  const [logState, setLogState] = useState<'idle' | 'logging' | 'logged'>('idle')

  const isReply = mode.kind === 'reply'
  const isFresh = mode.kind === 'fresh'

  // ── Stage 1: fetch topic suggestions on mount ─────────────────────────────

  const fetchTopics = useCallback(async () => {
    setStage('suggest')
    setError(null)
    try {
      const res = await fetch('/api/draft-email/suggest-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: mode.schoolId,
          coachId: mode.coachId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load topics')
      setTopics(json.topics ?? [])
      setStage('pick')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load topics')
      setStage('pick') // still allow manual brief
    }
  }, [mode.schoolId, mode.coachId])

  useEffect(() => { fetchTopics() }, [fetchTopics])

  // ── Stage 2: generate email ───────────────────────────────────────────────

  async function handleGenerate() {
    setStage('generate')
    setError(null)
    setSubject('')
    setBody('')
    try {
      const payload: Record<string, unknown> = {
        schoolId: mode.schoolId,
        coachId: mode.coachId,
      }
      if (selectedTopic) payload.selectedTopic = selectedTopic
      if (brief.trim()) payload.brief = brief.trim()
      if (isReply) payload.replyToContactLogId = mode.replyToContactLogId

      const res = await fetch('/api/draft-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Generation failed')

      if (json.subject) setSubject(json.subject)
      setBody(json.body ?? '')
      setStage('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
      setStage('pick')
    }
  }

  // ── Stage 3: actions ──────────────────────────────────────────────────────

  function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleMarkSent() {
    // Fresh + reply modes: no DB write. CC pipeline captures the real send.
    // Just close and notify parent.
    onSent?.()
    onClose()
  }

  async function handleLogOutreach() {
    if (!body) return
    setLogState('logging')
    const supabase = createClient()
    // Fix pre-existing bug: write body (first 140 chars), not subject
    const summaryText = body.length > 140 ? body.slice(0, 140) + '...' : body
    await supabase.from('contact_log').insert({
      school_id: mode.schoolId,
      date: todayStr(),
      channel: 'Email',
      direction: 'Outbound',
      summary: summaryText,
      coach_name: mode.coachName ?? null,
      created_by: userId,
    })
    setLogState('logged')
    onSent?.()
  }

  async function handleRegenerate() {
    setSelectedTopic(null)
    setBrief('')
    await fetchTopics()
  }

  // ── Can generate? ─────────────────────────────────────────────────────────

  const canGenerate = !!selectedTopic || brief.trim().length > 0

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
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
              {isReply ? 'Draft Reply' : 'Draft Email'}
            </h3>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {mode.schoolName}
              {mode.coachName && ` — ${mode.coachName}`}
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
            }}>
              {error}
            </div>
          )}

          {/* ── Stage 1: Suggest / Pick ────────────────────────────────── */}
          {(stage === 'suggest' || stage === 'pick') && (
            <>
              {stage === 'suggest' && (
                <div style={{
                  padding: '24px 0', textAlign: 'center', color: '#94a3b8',
                  fontSize: 13,
                }}>
                  Suggesting topics...
                </div>
              )}

              {stage === 'pick' && topics.length > 0 && (
                <div>
                  <Label>Suggested topics</Label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                    {topics.map((topic, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedTopic(selectedTopic === topic ? null : topic)}
                        style={{
                          padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                          border: selectedTopic === topic
                            ? '2px solid #7c3aed'
                            : '1px solid #e2e8f0',
                          background: selectedTopic === topic ? '#f5f3ff' : '#fff',
                          fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
                          color: '#1e293b', fontWeight: selectedTopic === topic ? 600 : 400,
                          lineHeight: 1.4,
                        }}
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label>
                  {topics.length > 0
                    ? 'Or describe what you want this email to do'
                    : 'Describe what you want this email to do'}
                </Label>
                <textarea
                  value={brief}
                  onChange={e => setBrief(e.target.value)}
                  rows={3}
                  placeholder={isReply
                    ? "e.g. Thank them for the invite, confirm interest, share upcoming schedule..."
                    : "e.g. Follow up on Arizona conversation, mention Olimpico, ask about 2027 recruiting..."
                  }
                  style={{
                    ...fieldStyle, resize: 'vertical', marginTop: 4,
                  }}
                />
              </div>
            </>
          )}

          {/* ── Stage 2: Generating ────────────────────────────────────── */}
          {stage === 'generate' && (
            <div style={{
              padding: '40px 0', textAlign: 'center', color: '#94a3b8',
              fontSize: 13,
            }}>
              Generating draft...
            </div>
          )}

          {/* ── Stage 3: Review ────────────────────────────────────────── */}
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

              {/* Body */}
              <div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 4,
                }}>
                  <Label>Body</Label>
                  <button
                    onClick={() => copyToClipboard(body, setCopiedBody)}
                    style={copyBtnStyle(copiedBody)}
                  >
                    {copiedBody ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={12}
                  style={{
                    ...fieldStyle, resize: 'vertical', lineHeight: 1.6,
                  }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Mark as sent */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={handleMarkSent} style={actionBtn('#059669', '#fff')}>
                    Mark as sent via Gmail
                  </button>
                  <button onClick={handleMarkSent} style={actionBtn('#2563eb', '#fff')}>
                    Mark as sent via SR
                  </button>
                </div>

                {/* Log outreach */}
                {logState === 'logged' ? (
                  <div style={{ fontSize: 12.5, color: '#059669', fontWeight: 600 }}>
                    Logged to contact log.
                  </div>
                ) : (
                  <button
                    onClick={handleLogOutreach}
                    disabled={logState === 'logging'}
                    style={{
                      padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0',
                      background: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                      fontFamily: 'inherit', color: '#475569',
                      opacity: logState === 'logging' ? 0.5 : 1,
                      alignSelf: 'flex-start',
                    }}
                  >
                    {logState === 'logging' ? 'Logging...' : 'Log this outreach'}
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

          {(stage === 'pick') && (
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

          {stage === 'review' && (
            <button
              onClick={handleRegenerate}
              style={{ ...generateBtnStyle, background: '#475569' }}
            >
              Start over
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

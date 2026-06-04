'use client'

import { useState, useRef } from 'react'
import type { School, Coach } from '@/lib/types'

type ModalState = 'setup' | 'confirm_existing' | 'generating' | 'complete' | 'error'

interface ExistingDoc {
  assetId: string
  name: string
  createdAt: string
}

interface CompleteResult {
  docId: string
  school: string
  coach: string
  questionCount: number
  toolCalls: number
  usage: { inputTokens: number; outputTokens: number }
}

const PROGRESS_STAGES: Record<string, { label: string; pct: number }> = {
  context:   { label: 'Loading school context',  pct: 10 },
  research:  { label: 'Researching',             pct: 50 },
  pdf:       { label: 'Building PDF',            pct: 85 },
  upload:    { label: 'Saving',                  pct: 95 },
}

interface Props {
  school: School
  coaches: Coach[]
  onClose: () => void
  onGenerated?: () => void
}

export default function PrepForCallModal({ school, coaches, onClose, onGenerated }: Props) {
  const activeCoaches = coaches.filter(c => c.is_active)
  const defaultCoach = activeCoaches.find(c => c.is_primary)
    ?? activeCoaches.find(c => c.role === 'Head Coach')
    ?? activeCoaches[0]

  const [state, setState] = useState<ModalState>('setup')
  const [selectedCoachId, setSelectedCoachId] = useState(defaultCoach?.id ?? '')
  const [framingNotes, setFramingNotes] = useState('')
  const [progressMessage, setProgressMessage] = useState('')
  const [progressPct, setProgressPct] = useState(0)
  const [result, setResult] = useState<CompleteResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [existingDoc, setExistingDoc] = useState<ExistingDoc | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function handleGenerate() {
    setState('generating')
    setProgressMessage('Starting...')
    setProgressPct(5)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/prep-for-call/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: school.id,
          coachId: selectedCoachId,
          framingNotes: framingNotes.trim() || undefined,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => 'Unknown error')
        throw new Error(text)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // keep incomplete line

        let eventName = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventName = line.slice(7).trim()
          } else if (line.startsWith('data: ') && eventName) {
            try {
              const data = JSON.parse(line.slice(6))
              handleSSEEvent(eventName, data)
            } catch { /* skip malformed */ }
            eventName = ''
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return
      const msg = err instanceof Error ? err.message : 'Generation failed'
      setErrorMsg(msg)
      setState('error')
    }
  }

  function handleSSEEvent(event: string, data: Record<string, unknown>) {
    switch (event) {
      case 'progress': {
        const stage = data.stage as string
        const message = data.message as string
        const stageInfo = PROGRESS_STAGES[stage]
        setProgressMessage(message)
        if (stageInfo) setProgressPct(stageInfo.pct)
        break
      }
      case 'existing': {
        setExistingDoc({
          assetId: data.assetId as string,
          name: data.name as string,
          createdAt: data.createdAt as string,
        })
        // Don't interrupt — server continues generating
        break
      }
      case 'complete': {
        setResult({
          docId: data.docId as string,
          school: data.school as string,
          coach: data.coach as string,
          questionCount: data.questionCount as number,
          toolCalls: (data.toolCalls as number) ?? 0,
          usage: data.usage as { inputTokens: number; outputTokens: number },
        })
        setProgressPct(100)
        setState('complete')
        onGenerated?.()
        break
      }
      case 'error': {
        setErrorMsg(data.message as string)
        setState('error')
        break
      }
    }
  }

  function handleDownload() {
    if (!result) return
    window.open(`/api/call-prep-docs/${result.docId}`, '_blank')
  }

  const selectedCoach = activeCoaches.find(c => c.id === selectedCoachId)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Prep for call</h3>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {school.name}
            </div>
          </div>
          {state !== 'generating' && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', padding: 4, lineHeight: 1 }}>&times;</button>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          {/* ── Setup state ── */}
          {state === 'setup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                Generate a research-backed call prep document. Includes school background, coach profile, roster analysis, and tailored questions.
              </div>

              {/* Coach selector */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                  Who is Finn calling?
                </label>
                <select
                  value={selectedCoachId}
                  onChange={e => setSelectedCoachId(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 6,
                    border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit',
                    background: '#fff', color: '#0f172a',
                  }}
                >
                  {activeCoaches.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.role ?? 'Unknown role'}
                      {c.is_primary ? ' (primary)' : ''}
                    </option>
                  ))}
                </select>
                {selectedCoach?.needs_review && (
                  <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>
                    This coach may have departed the program (needs_review flag).
                  </div>
                )}
              </div>

              {/* Framing notes */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                  Framing notes <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span>
                </label>
                <textarea
                  value={framingNotes}
                  onChange={e => setFramingNotes(e.target.value)}
                  placeholder={'e.g., "This is a first call", "New coach hired last week", "Finn already mentioned the position transition"'}
                  rows={3}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 6,
                    border: '1px solid #d1d5db', fontSize: 13, fontFamily: 'inherit',
                    resize: 'vertical', lineHeight: 1.5, color: '#0f172a',
                  }}
                />
              </div>

              {/* Time estimate */}
              <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '4px 0' }}>
                Takes 1-3 minutes. Opus drives its own web research (15-25 queries), reads full conversation history, and generates the document.
              </div>

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={!selectedCoachId || activeCoaches.length === 0}
                style={{
                  padding: '11px 24px', borderRadius: 8, border: 'none',
                  cursor: selectedCoachId ? 'pointer' : 'not-allowed',
                  fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                  background: '#7c3aed', color: '#fff',
                  opacity: selectedCoachId ? 1 : 0.5,
                }}
              >
                Generate prep document
              </button>

              {activeCoaches.length === 0 && (
                <div style={{ fontSize: 13, color: '#dc2626', textAlign: 'center' }}>
                  No active coaches on file for this school.
                </div>
              )}
            </div>
          )}

          {/* ── Generating state ── */}
          {state === 'generating' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: 20 }}>
              {/* Progress bar */}
              <div style={{ width: '100%', maxWidth: 360 }}>
                <div style={{ height: 6, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
                    width: `${progressPct}%`,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
              <div style={{ fontSize: 14, color: '#64748b', textAlign: 'center' }}>
                {progressMessage}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                Opus is driving its own research. This takes 1-3 minutes.
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ── Complete state ── */}
          {state === 'complete' && result && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '24px 0' }}>
              {/* Success icon */}
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24,
              }}>
                ✓
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
                  Prep document ready
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  {result.school} — {result.coach}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  {result.questionCount} questions · {result.toolCalls} research queries · Saved to asset library
                </div>
              </div>

              {/* Download button */}
              <button
                onClick={handleDownload}
                style={{
                  padding: '10px 28px', borderRadius: 8, border: 'none',
                  cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                  background: '#7c3aed', color: '#fff',
                }}
              >
                Download prep doc
              </button>

              {/* Token usage */}
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                Opus: {result.usage.inputTokens.toLocaleString()} input / {result.usage.outputTokens.toLocaleString()} output tokens
              </div>

              {/* Regenerate option */}
              <button
                onClick={() => { setState('setup'); setResult(null) }}
                style={{
                  padding: '6px 16px', borderRadius: 6,
                  border: '1px solid #e2e8f0', background: '#fff',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit', color: '#64748b',
                }}
              >
                Regenerate with different notes
              </button>
            </div>
          )}

          {/* ── Error state ── */}
          {state === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 24px' }}>
              <div style={{
                fontSize: 13, color: '#dc2626', background: '#fef2f2',
                borderRadius: 8, padding: '14px 18px', border: '1px solid #fecaca',
                maxWidth: 400, textAlign: 'center', lineHeight: 1.5,
              }}>
                {errorMsg}
              </div>
              <button
                onClick={() => { setState('setup'); setErrorMsg('') }}
                style={{
                  padding: '8px 20px', borderRadius: 6,
                  border: '1px solid #e2e8f0', background: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit', color: '#475569',
                }}
              >
                Try again
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

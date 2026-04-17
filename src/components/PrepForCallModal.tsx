'use client'

import { useState } from 'react'
import type { School, PrepResult, OverrideStatus, QuestionCategory } from '@/lib/types'
import { useQuestions, useContactLog } from '@/hooks/useRealtimeData'

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  'Formation & Fit':       { bg: '#eff6ff', text: '#2563eb' },
  'Roster & Playing Time': { bg: '#f0fdf4', text: '#059669' },
  'Development':           { bg: '#fdf4ff', text: '#9333ea' },
  'Culture':               { bg: '#fff7ed', text: '#ea580c' },
  'Academics & Aid':       { bg: '#fefce8', text: '#ca8a04' },
}

type ModalState = 'idle' | 'loading' | 'ready'

interface Props {
  school: School
  onClose: () => void
}

export default function PrepForCallModal({ school, onClose }: Props) {
  const { questions, loading: questionsLoading } = useQuestions()
  const { entries } = useContactLog(school.id)
  const recentLogs = entries.slice(0, 5)

  const [state, setState] = useState<ModalState>('idle')
  const [prep, setPrep] = useState<PrepResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [priorityOpen, setPriorityOpen] = useState(true)
  const [answeredOpen, setAnsweredOpen] = useState(false)
  const [skipOpen, setSkipOpen] = useState(false)

  async function handleGenerate() {
    setState('loading')
    setError(null)
    try {
      const res = await fetch('/api/prep-for-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school, recentLogs, globalQuestions: questions }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Prep failed')
      setPrep(data as PrepResult)
      setState('ready')
      setPriorityOpen(true)
      setAnsweredOpen(false)
      setSkipOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setState('idle')
    }
  }

  function handlePrint() {
    if (!prep) return
    const questionMap = new Map(questions.map(q => [q.id, q]))
    const priorityItems = prep.overrides
      .filter(o => o.status === 'priority')
      .map(o => ({ override: o, question: questionMap.get(o.question_id) }))
      .filter(x => x.question)

    const html = `<!DOCTYPE html><html><head><title>Prep Sheet — ${school.name}</title>
<style>
  body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; color: #111; font-size: 14px; line-height: 1.6; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
  .summary { background: #fffbeb; border-left: 3px solid #f59e0b; padding: 12px 16px; margin-bottom: 28px; font-size: 13px; line-height: 1.6; }
  h2 { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #555; border-bottom: 1px solid #eee; padding-bottom: 4px; margin: 24px 0 12px; }
  .q { margin-bottom: 16px; }
  .q-text { font-weight: bold; font-size: 14px; margin-bottom: 4px; }
  .q-note { font-size: 12px; color: #666; font-style: italic; }
  .q-rationale { font-size: 12px; color: #444; margin-top: 4px; }
  .badge { display: inline-block; font-size: 10px; font-weight: bold; padding: 1px 6px; border-radius: 3px; margin-right: 6px; background: #f1f5f9; color: #475569; }
  @media print { body { margin: 20px; } }
</style></head><body>
<h1>${school.name}</h1>
<div class="meta">${school.division}${school.conference ? ' · ' + school.conference : ''} · ${school.status}${school.head_coach ? ' · ' + school.head_coach : ''}</div>
${prep.call_summary ? `<div class="summary">${prep.call_summary}</div>` : ''}
<h2>Ask these (${priorityItems.length})</h2>
${priorityItems.map(({ override, question }) => `
<div class="q">
  <div class="q-text"><span class="badge">${question!.category}</span>${question!.question}</div>
  ${override.context_note ? `<div class="q-note">${override.context_note}</div>` : ''}
  ${question!.rationale ? `<div class="q-rationale">${question!.rationale}</div>` : ''}
</div>`).join('')}
${prep.school_specific_questions.length > 0 ? `
<h2>Questions for ${school.name} only (${prep.school_specific_questions.length})</h2>
${prep.school_specific_questions.map(q => `
<div class="q">
  <div class="q-text"><span class="badge">${q.category}</span>${q.question_text}</div>
  ${q.rationale ? `<div class="q-rationale">${q.rationale}</div>` : ''}
</div>`).join('')}` : ''}
</body></html>`

    const w = window.open('', '_blank', 'width=800,height=700')
    if (w) { w.document.write(html); w.document.close(); w.print() }
  }

  const questionMap = new Map(questions.map(q => [q.id, q]))

  const byStatus = (status: OverrideStatus) =>
    (prep?.overrides ?? [])
      .filter(o => o.status === status)
      .map(o => ({ override: o, question: questionMap.get(o.question_id) }))
      .filter(x => x.question)

  const priorityItems = byStatus('priority')
  const answeredItems = byStatus('answered')
  const skipItems = byStatus('skip')

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Prep for call</h3>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {school.name}{school.head_coach ? ` · ${school.head_coach}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {state === 'ready' && (
              <>
                <button onClick={handlePrint} style={ghostBtnStyle}>Print prep sheet</button>
                <button onClick={handleGenerate} style={ghostBtnStyle}>Regenerate</button>
              </>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', padding: 4, lineHeight: 1 }}>&times;</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          {/* State 1 — idle */}
          {state === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', gap: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
                  Ready to analyze {school.name}
                </div>
                <div style={{ fontSize: 13, color: '#64748b', maxWidth: 380 }}>
                  Claude will review your notes and contact history, triage the question bank, and suggest school-specific questions.
                </div>
                {recentLogs.length > 0 && (
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                    Using {recentLogs.length} contact log {recentLogs.length === 1 ? 'entry' : 'entries'} and {questions.length} questions.
                  </div>
                )}
              </div>
              {error && (
                <div style={{ fontSize: 12.5, color: '#dc2626', background: '#fef2f2', borderRadius: 6, padding: '10px 14px', border: '1px solid #fecaca', maxWidth: 380, textAlign: 'center' }}>
                  {error}
                </div>
              )}
              <button
                onClick={handleGenerate}
                disabled={questionsLoading || questions.length === 0}
                style={{ padding: '10px 24px', borderRadius: 7, border: 'none', cursor: questionsLoading ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', background: '#7c3aed', color: '#fff', opacity: questionsLoading ? 0.5 : 1 }}
              >
                {questionsLoading ? 'Loading questions...' : 'Generate prep'}
              </button>
            </div>
          )}

          {/* State — loading */}
          {state === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', gap: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#7c3aed', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ fontSize: 14, color: '#64748b' }}>Analyzing your conversation history...</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* State 2 — ready */}
          {state === 'ready' && prep && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Call summary */}
              {prep.call_summary && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '14px 16px', fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>
                  {prep.call_summary}
                </div>
              )}

              {/* Priority section */}
              <Section
                title="Ask these"
                count={priorityItems.length}
                open={priorityOpen}
                onToggle={() => setPriorityOpen(o => !o)}
                accentColor="#7c3aed"
              >
                {priorityItems.map(({ override, question }) => (
                  <QuestionCard
                    key={override.question_id}
                    questionText={question!.question}
                    category={question!.category as QuestionCategory}
                    rationale={question!.rationale}
                    contextNote={override.context_note}
                    status="priority"
                  />
                ))}
                {priorityItems.length === 0 && <EmptyNote text="No priority questions identified." />}
              </Section>

              {/* Answered section */}
              <Section
                title="Already covered"
                count={answeredItems.length}
                open={answeredOpen}
                onToggle={() => setAnsweredOpen(o => !o)}
                accentColor="#059669"
              >
                {answeredItems.map(({ override, question }) => (
                  <QuestionCard
                    key={override.question_id}
                    questionText={question!.question}
                    category={question!.category as QuestionCategory}
                    rationale={question!.rationale}
                    contextNote={override.context_note}
                    status="answered"
                  />
                ))}
                {answeredItems.length === 0 && <EmptyNote text="Nothing marked as answered yet." />}
              </Section>

              {/* Skip section */}
              <Section
                title="Skip for now"
                count={skipItems.length}
                open={skipOpen}
                onToggle={() => setSkipOpen(o => !o)}
                accentColor="#94a3b8"
                muted
              >
                {skipItems.map(({ override, question }) => (
                  <QuestionCard
                    key={override.question_id}
                    questionText={question!.question}
                    category={question!.category as QuestionCategory}
                    rationale={question!.rationale}
                    contextNote={override.context_note}
                    status="skip"
                  />
                ))}
                {skipItems.length === 0 && <EmptyNote text="No questions marked to skip." />}
              </Section>

              {/* School-specific questions */}
              {prep.school_specific_questions.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                    Questions for {school.short_name || school.name} only
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {prep.school_specific_questions.map((q, i) => (
                      <QuestionCard
                        key={i}
                        questionText={q.question_text}
                        category={q.category as QuestionCategory}
                        rationale={q.rationale}
                        contextNote={null}
                        status="priority"
                        isSchoolSpecific
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Section ─────────────────────────────────────────────────────────────────

function Section({ title, count, open, onToggle, accentColor, muted, children }: {
  title: string
  count: number
  open: boolean
  onToggle: () => void
  accentColor: string
  muted?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: muted ? '#fafbfc' : '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 3, height: 16, borderRadius: 2, background: accentColor, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: muted ? '#94a3b8' : '#0f172a' }}>{title}</span>
          <span style={{ fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#64748b', borderRadius: 4, padding: '1px 6px' }}>{count}</span>
        </div>
        <span style={{ fontSize: 11, color: '#94a3b8', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #f1f5f9' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Question card ────────────────────────────────────────────────────────────

function QuestionCard({ questionText, category, rationale, contextNote, status, isSchoolSpecific }: {
  questionText: string
  category: QuestionCategory
  rationale: string | null | undefined
  contextNote: string | null
  status: OverrideStatus
  isSchoolSpecific?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const color = CATEGORY_COLORS[category] ?? { bg: '#f1f5f9', text: '#475569' }
  const isMuted = status === 'skip'

  return (
    <div
      style={{ background: isMuted ? '#fafbfc' : '#fff', borderRadius: 7, border: '1px solid #f1f5f9', padding: '12px 14px', opacity: isMuted ? 0.7 : 1 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: color.bg, color: color.text, flexShrink: 0, whiteSpace: 'nowrap', marginTop: 1 }}>
          {category}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.45 }}>
            {questionText}
            {isSchoolSpecific && (
              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', borderRadius: 3, padding: '1px 5px' }}>School-specific</span>
            )}
          </div>
          {contextNote && (
            <div style={{ fontSize: 12, color: status === 'answered' ? '#059669' : '#64748b', marginTop: 4, fontStyle: 'italic' }}>
              {contextNote}
            </div>
          )}
          {rationale && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#94a3b8', fontFamily: 'inherit', padding: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {expanded ? 'Hide rationale ▲' : 'Why ask this ▼'}
            </button>
          )}
          {expanded && rationale && (
            <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.6, marginTop: 6, paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
              {rationale}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyNote({ text }: { text: string }) {
  return <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: '4px 0' }}>{text}</div>
}

const ghostBtnStyle: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#475569',
}

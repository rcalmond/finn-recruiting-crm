'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Question, QuestionCategory } from '@/lib/types'
import { useQuestions } from '@/hooks/useRealtimeData'

const LV = {
  paper: '#F6F1E8',
  ink: '#0E0E0E',
  inkMid: '#4A4A4A',
  inkLo: '#7A7570',
  inkMute: '#A8A39B',
  line: '#E2DBC9',
  inputBorder: '#D3CAB3',
  tealDeep: '#006A65',
  tealSoft: '#D7F0ED',
  red: '#C8102E',
  goldSoft: '#FEF9E7',
  goldLine: '#F5E6A3',
  goldInk: '#7A6010',
}

const CATEGORIES: QuestionCategory[] = [
  'Formation & Fit',
  'Roster & Playing Time',
  'Development',
  'Culture',
  'Academics & Aid',
]

// LV-mapped category badge colors
const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  'Formation & Fit':       { bg: LV.tealSoft,  text: LV.tealDeep },
  'Roster & Playing Time': { bg: '#D7EFE0',    text: '#2D6A4F'   },
  'Development':           { bg: '#E9D9FA',    text: '#5B21B6'   },
  'Culture':               { bg: '#FDEBD0',    text: '#A04000'   },
  'Academics & Aid':       { bg: LV.goldSoft,  text: LV.goldInk  },
}

type FilterTab = 'All' | QuestionCategory | 'My Questions'

export default function QuestionsPanel() {
  const { questions, loading, insertQuestion, updateQuestion, deleteQuestion } = useQuestions()
  const [activeTab, setActiveTab] = useState<FilterTab>('All')
  const [modal, setModal] = useState<{ mode: 'add' } | { mode: 'edit'; question: Question } | null>(null)

  const filtered = questions.filter(q => {
    if (activeTab === 'All') return true
    if (activeTab === 'My Questions') return q.is_custom
    return q.category === activeTab
  })

  const tabs: FilterTab[] = ['All', ...CATEGORIES, 'My Questions']

  return (
    <div style={{
      minHeight: '100vh',
      background: LV.paper,
      padding: 'clamp(28px, 4vw, 48px) clamp(20px, 5vw, 56px)',
      fontFamily: "'Inter', -apple-system, sans-serif",
      color: LV.ink,
    }}>
      {/* Page header */}
      <div style={{ marginBottom: 'clamp(24px, 3vw, 36px)', maxWidth: 720 }}>
        <Link href="/library" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, fontWeight: 700, color: LV.inkLo,
          textDecoration: 'none', letterSpacing: '0.08em',
          textTransform: 'uppercase', marginBottom: 14,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5m5-6-6 6 6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Library
        </Link>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{
              margin: '0 0 6px',
              fontSize: 'clamp(40px, 6vw, 64px)',
              fontWeight: 700, letterSpacing: 'clamp(-2px, -0.03em, -3px)',
              color: LV.ink, fontStyle: 'italic', lineHeight: 1,
            }}>
              Questions.
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: LV.inkLo }}>
              {questions.length} questions · {questions.filter(q => q.is_custom).length} custom
            </p>
          </div>

          <button
            onClick={() => setModal({ mode: 'add' })}
            style={{
              padding: '9px 18px', borderRadius: 999, border: 'none',
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
              fontFamily: 'inherit', background: LV.red, color: '#fff',
              letterSpacing: '-0.01em', flexShrink: 0, alignSelf: 'flex-end',
            }}
          >
            + Add Question
          </button>
        </div>
      </div>

      {/* Category filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24, maxWidth: 720 }}>
        {tabs.map(tab => {
          const on = activeTab === tab
          const count = tab === 'All' ? null
            : tab === 'My Questions' ? questions.filter(q => q.is_custom).length
            : questions.filter(q => q.category === tab).length
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
                fontSize: 12, fontWeight: on ? 700 : 600, fontFamily: 'inherit',
                border: `1px solid ${on ? LV.ink : LV.line}`,
                background: on ? LV.ink : '#fff',
                color: on ? '#fff' : LV.inkMid,
                transition: 'all 0.12s',
                letterSpacing: '-0.01em',
              }}
            >
              {tab}
              {count != null && (
                <span style={{ marginLeft: 5, opacity: on ? 0.65 : 0.6, fontWeight: 600 }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720 }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: LV.inkLo, fontSize: 14 }}>
            Loading…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{
            padding: '32px 20px', textAlign: 'center', color: LV.inkMute,
            background: '#fff', borderRadius: 10,
            border: `1px dashed ${LV.line}`, fontSize: 13,
          }}>
            {activeTab === 'My Questions'
              ? 'No custom questions yet. Click + Add Question to create one.'
              : 'No questions in this category.'}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(q => (
            <QuestionCard
              key={q.id}
              question={q}
              onEdit={() => setModal({ mode: 'edit', question: q })}
              onDelete={() => deleteQuestion(q.id)}
            />
          ))}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <QuestionModal
          mode={modal.mode}
          question={modal.mode === 'edit' ? modal.question : undefined}
          onClose={() => setModal(null)}
          onSave={async (data) => {
            if (modal.mode === 'edit') {
              await updateQuestion(modal.question.id, data)
            } else {
              await insertQuestion({ ...data, is_custom: true, sort_order: null })
            }
            setModal(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Question card ────────────────────────────────────────────────────────────

function QuestionCard({ question: q, onEdit, onDelete }: {
  question: Question; onEdit: () => void; onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const colors = CATEGORY_COLORS[q.category] ?? { bg: LV.paper, text: LV.inkMid }

  return (
    <div style={{
      background: '#fff', borderRadius: 10,
      border: `1px solid ${LV.line}`, overflow: 'hidden',
    }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}
      >
        {/* Category badge */}
        <span style={{
          padding: '3px 9px', borderRadius: 999,
          fontSize: 10, fontWeight: 800,
          background: colors.bg, color: colors.text,
          flexShrink: 0, whiteSpace: 'nowrap', marginTop: 1,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          {q.category}
        </span>

        {/* Question text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 650, color: LV.ink, lineHeight: 1.45 }}>
            {q.question}
          </div>
          {q.is_custom && (
            <span style={{
              fontSize: 10, fontWeight: 800, color: LV.tealDeep,
              background: LV.tealSoft, borderRadius: 999,
              padding: '2px 7px', marginTop: 5, display: 'inline-block',
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
              Custom
            </span>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {!confirmDelete ? (
            <>
              <button onClick={onEdit} style={actionBtn(LV.paper, LV.inkMid)}>Edit</button>
              <button onClick={() => setConfirmDelete(true)} style={actionBtn('#FAD9D9', LV.red)}>✕</button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 11, color: LV.red, fontWeight: 600 }}>Delete?</span>
              <button onClick={onDelete} style={actionBtn(LV.red, '#fff')}>Yes</button>
              <button onClick={() => setConfirmDelete(false)} style={actionBtn(LV.paper, LV.inkMid)}>No</button>
            </>
          )}
          <span style={{ fontSize: 10, color: LV.inkMute, marginLeft: 4 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Rationale (expanded) */}
      {expanded && (
        <div style={{ padding: '0 16px 14px', borderTop: `1px solid ${LV.line}` }}>
          <div style={{
            fontSize: 10, fontWeight: 800, color: LV.inkMute,
            textTransform: 'uppercase', letterSpacing: '0.1em',
            margin: '10px 0 6px',
          }}>
            Why ask this
          </div>
          <div style={{ fontSize: 13, color: LV.inkMid, lineHeight: 1.6 }}>
            {q.rationale || (
              <span style={{ fontStyle: 'italic', color: LV.inkMute }}>No rationale added.</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function actionBtn(bg: string, color: string): React.CSSProperties {
  return {
    padding: '4px 9px', borderRadius: 6, border: 'none',
    cursor: 'pointer', fontSize: 11, fontWeight: 700,
    fontFamily: 'inherit', background: bg, color,
    letterSpacing: '-0.01em',
  }
}

// ─── Question modal ───────────────────────────────────────────────────────────

interface ModalProps {
  mode: 'add' | 'edit'
  question?: Question
  onClose: () => void
  onSave: (data: { category: QuestionCategory; question: string; rationale: string | null }) => Promise<void>
}

function QuestionModal({ mode, question, onClose, onSave }: ModalProps) {
  const [category, setCategory] = useState<QuestionCategory>(question?.category ?? 'Formation & Fit')
  const [text, setText] = useState(question?.question ?? '')
  const [rationale, setRationale] = useState(question?.rationale ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setSaving(true)
    await onSave({ category, question: text.trim(), rationale: rationale.trim() || null })
    setSaving(false)
  }

  const disabled = !text.trim() || saving

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520,
        boxShadow: '0 25px 60px rgba(0,0,0,0.18)', overflow: 'hidden',
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}>
        {/* Header */}
        <div style={{ padding: '22px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 700, fontStyle: 'italic', letterSpacing: '-0.03em', color: LV.ink }}>
            {mode === 'add' ? 'Add question.' : 'Edit question.'}
          </h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: LV.inkLo, fontSize: 22, lineHeight: 1, padding: 2,
          }}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '18px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ModalField label="Category" required>
            <select value={category} onChange={e => setCategory(e.target.value as QuestionCategory)} style={inputStyle}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </ModalField>

          <ModalField label="Question" required>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              required
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="What's the question you want to ask?"
              autoFocus
            />
          </ModalField>

          <ModalField label="Why ask this">
            <textarea
              value={rationale}
              onChange={e => setRationale(e.target.value)}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="What does the answer reveal? What are you listening for?"
            />
          </ModalField>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              padding: '8px 16px', borderRadius: 999, border: 'none',
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
              fontFamily: 'inherit', background: LV.paper, color: LV.inkMid,
              letterSpacing: '-0.01em',
            }}>
              Cancel
            </button>
            <button type="submit" disabled={disabled} style={{
              padding: '8px 18px', borderRadius: 999, border: 'none',
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
              fontFamily: 'inherit', background: LV.red, color: '#fff',
              letterSpacing: '-0.01em', opacity: disabled ? 0.45 : 1,
            }}>
              {saving ? 'Saving…' : mode === 'add' ? 'Add Question' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ModalField({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontSize: 10, fontWeight: 800, color: LV.inkLo,
        textTransform: 'uppercase', letterSpacing: '0.1em',
      }}>
        {label}{required && ' *'}
      </span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 11px',
  border: `1px solid ${LV.inputBorder}`,
  borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
  background: LV.paper, color: LV.ink,
  outline: 'none', boxSizing: 'border-box',
}

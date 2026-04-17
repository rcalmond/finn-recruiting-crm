'use client'

import { useState } from 'react'
import type { Question, QuestionCategory } from '@/lib/types'
import { useQuestions } from '@/hooks/useRealtimeData'

const CATEGORIES: QuestionCategory[] = [
  'Formation & Fit',
  'Roster & Playing Time',
  'Development',
  'Culture',
  'Academics & Aid',
]

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  'Formation & Fit':      { bg: '#eff6ff', text: '#2563eb' },
  'Roster & Playing Time':{ bg: '#f0fdf4', text: '#059669' },
  'Development':          { bg: '#fdf4ff', text: '#9333ea' },
  'Culture':              { bg: '#fff7ed', text: '#ea580c' },
  'Academics & Aid':      { bg: '#fefce8', text: '#ca8a04' },
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
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            {questions.length} questions · {questions.filter(q => q.is_custom).length} custom
          </div>
        </div>
        <button
          onClick={() => setModal({ mode: 'add' })}
          style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          + Add Question
        </button>
      </div>

      {/* Category filter tabs */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20 }}>
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: activeTab === tab ? 700 : 500, fontFamily: 'inherit',
              background: activeTab === tab ? '#0f172a' : '#f1f5f9',
              color: activeTab === tab ? '#fff' : '#64748b',
              transition: 'all 0.15s',
            }}
          >
            {tab}
            {tab !== 'All' && (
              <span style={{ marginLeft: 5, opacity: 0.7 }}>
                ({tab === 'My Questions'
                  ? questions.filter(q => q.is_custom).length
                  : questions.filter(q => q.category === tab).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 10, border: '1px dashed #e2e8f0', fontSize: 13 }}>
          {activeTab === 'My Questions' ? 'No custom questions yet. Click + Add Question to create one.' : 'No questions in this category.'}
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

function QuestionCard({ question: q, onEdit, onDelete }: { question: Question; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const color = CATEGORY_COLORS[q.category] ?? { bg: '#f1f5f9', text: '#475569' }

  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}
      >
        {/* Category badge */}
        <span style={{
          padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
          background: color.bg, color: color.text, flexShrink: 0, whiteSpace: 'nowrap', marginTop: 1,
        }}>
          {q.category}
        </span>

        {/* Question text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a', lineHeight: 1.45 }}>
            {q.question}
          </div>
          {q.is_custom && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', borderRadius: 3, padding: '1px 5px', marginTop: 4, display: 'inline-block' }}>
              Custom
            </span>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {!confirmDelete ? (
            <>
              <button onClick={onEdit} style={iconBtnStyle('#f1f5f9', '#475569')}>Edit</button>
              <button onClick={() => setConfirmDelete(true)} style={iconBtnStyle('#fef2f2', '#dc2626')}>✕</button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 11, color: '#dc2626' }}>Delete?</span>
              <button onClick={onDelete} style={iconBtnStyle('#dc2626', '#fff')}>Yes</button>
              <button onClick={() => setConfirmDelete(false)} style={iconBtnStyle('#f1f5f9', '#475569')}>No</button>
            </>
          )}
          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Rationale */}
      {expanded && (
        <div style={{ padding: '0 16px 14px 16px', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '10px 0 6px' }}>
            Why ask this
          </div>
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
            {q.rationale || <span style={{ fontStyle: 'italic', color: '#94a3b8' }}>No rationale added.</span>}
          </div>
        </div>
      )}
    </div>
  )
}

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

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, boxShadow: '0 25px 50px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{mode === 'add' ? 'Add Question' : 'Edit Question'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ModalField label="Category" required>
            <select value={category} onChange={e => setCategory(e.target.value as QuestionCategory)} style={fieldStyle}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </ModalField>

          <ModalField label="Question" required>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              required
              rows={3}
              style={{ ...fieldStyle, resize: 'vertical' }}
              placeholder="What's the question you want to ask?"
              autoFocus
            />
          </ModalField>

          <ModalField label="Why ask this">
            <textarea
              value={rationale}
              onChange={e => setRationale(e.target.value)}
              rows={4}
              style={{ ...fieldStyle, resize: 'vertical' }}
              placeholder="What does the answer reveal? What are you listening for?"
            />
          </ModalField>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>Cancel</button>
            <button type="submit" disabled={!text.trim() || saving} style={{ ...saveBtnStyle, opacity: !text.trim() || saving ? 0.5 : 1 }}>
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
      <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}{required && ' *'}
      </span>
      {children}
    </label>
  )
}

function iconBtnStyle(bg: string, color: string): React.CSSProperties {
  return { padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', background: bg, color }
}

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
  fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#0f172a',
  outline: 'none', boxSizing: 'border-box',
}
const cancelBtnStyle: React.CSSProperties = { padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#f1f5f9', color: '#475569' }
const saveBtnStyle: React.CSSProperties = { padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#0f172a', color: '#fff' }

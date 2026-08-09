'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { useMessages, useSchoolMessageLog } from '@/hooks/useRealtimeData'
import type { Message, MessageType, Category } from '@/lib/types'

// ── Design tokens ────────────────────────────────────────────────────────────

const C = {
  paper:  '#F6F1E8',
  white:  '#fff',
  border: '#E2DBC9',
  ink:    '#0E0E0E',
  inkMid: '#4A4A4A',
  inkLo:  '#7A7570',
  inkMute:'#A8A39B',
  red:    '#C8102E',
  // Jewel phase accents (for the guidance panel)
  petrol:    '#0E5F6B',
  persimmon: '#C13E24',
  violet:    '#3E2C5E',
}

const TYPE_DOT: Record<MessageType, string> = { update: '#166534', question: '#1E40AF' }

const STALE_DAYS = 60

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
function isExpired(m: Message): boolean {
  return !!m.expires_at && new Date(m.expires_at).getTime() < Date.now()
}

// ── Main component ───────────────────────────────────────────────────────────

export default function MessagesClient() {
  const supabase = useMemo(() => createClient(), [])
  const { messages, loading, insertMessage, updateMessage, archiveMessage, unarchiveMessage, deleteMessage } = useMessages()

  const [editMsg, setEditMsg] = useState<Message | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const kebabRef = useRef<HTMLButtonElement | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null)
  const [deleteInput, setDeleteInput] = useState('')
  const [archivedOpen, setArchivedOpen] = useState(false)

  // Guidance panel — default open, localStorage remembers dismissal
  const [guidanceOpen, setGuidanceOpen] = useState(true)
  useEffect(() => {
    try { if (localStorage.getItem('tp-guidance-open') === '0') setGuidanceOpen(false) } catch {}
  }, [])
  const toggleGuidance = () => {
    setGuidanceOpen(v => {
      const n = !v
      try { localStorage.setItem('tp-guidance-open', n ? '1' : '0') } catch {}
      return n
    })
  }

  // Per-message coverage — one bulk query, distinct schools that heard each message.
  const [coverage, setCoverage] = useState<Map<string, number>>(new Map())
  useEffect(() => {
    let cancelled = false
    supabase.from('school_message_log').select('message_id, school_id').then(({ data }) => {
      if (cancelled || !data) return
      const sets = new Map<string, Set<string>>()
      for (const r of data as { message_id: string; school_id: string }[]) {
        if (!sets.has(r.message_id)) sets.set(r.message_id, new Set())
        sets.get(r.message_id)!.add(r.school_id)
      }
      setCoverage(new Map(Array.from(sets, ([k, v]) => [k, v.size])))
    })
    return () => { cancelled = true }
  }, [supabase])

  const openMenu = useCallback((id: string, btn: HTMLButtonElement) => {
    if (menuOpen === id) { setMenuOpen(null); return }
    const rect = btn.getBoundingClientRect()
    const dropdownHeight = 120
    const flipUp = rect.bottom + dropdownHeight > window.innerHeight
    setMenuPos({ top: flipUp ? rect.top - dropdownHeight : rect.bottom + 4, left: rect.right - 150 })
    setMenuOpen(id)
    kebabRef.current = btn
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (kebabRef.current?.contains(e.target as Node)) return
      setMenuOpen(null)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [menuOpen])

  // ── Lifecycle sections ──────────────────────────────────────────────────────
  const { needsLook, inRotation, questions, archived } = useMemo(() => {
    const active = messages.filter(m => m.status === 'active')
    const isStaleUpdate = (m: Message) => m.type === 'update' && daysSince(m.updated_at) > STALE_DAYS
    // Needs a look: stale updates + anything past its expires_at.
    const needs = active.filter(m => isStaleUpdate(m) || isExpired(m))
    const needsIds = new Set(needs.map(m => m.id))
    return {
      needsLook: needs,
      inRotation: active.filter(m => m.type === 'update' && !needsIds.has(m.id)),
      questions: active.filter(m => m.type === 'question' && !needsIds.has(m.id)),
      archived: messages.filter(m => m.status === 'archived'),
    }
  }, [messages])

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 820, margin: '0 auto' }}>
        <div style={{ fontSize: 13, color: C.inkLo }}>Loading your talking points...</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.paper, fontFamily: "'Inter', -apple-system, sans-serif", paddingBottom: 80 }}>
      {/* Masthead */}
      <div style={{ padding: '24px clamp(28px, 4vw, 56px) 4px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 'clamp(44px, 6vw, 68px)', fontWeight: 700, letterSpacing: '-0.04em', color: C.ink, lineHeight: 0.95, fontStyle: 'italic' }}>
              Talking points.
            </h1>
            <p style={{ margin: '12px 0 0', fontSize: 15, color: C.inkLo, fontWeight: 450, letterSpacing: '-0.01em', maxWidth: 560, lineHeight: 1.5 }}>
              The updates, questions, and storylines that fuel your outreach.
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 999, border: 'none', background: C.ink, color: C.white, fontSize: 13, fontWeight: 650, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            + New
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '16px clamp(28px, 4vw, 56px)', maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* ── Phase guidance panel ─────────────────────────────── */}
        <GuidancePanel open={guidanceOpen} onToggle={toggleGuidance} />

        {/* ── Needs a look (only when non-empty — empty is the goal) ── */}
        {needsLook.length > 0 && (
          <section>
            <SectionHeader title="Needs a look." count={needsLook.length} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {needsLook.map(m => (
                <TriageRow
                  key={m.id}
                  msg={m}
                  onRefresh={() => setEditMsg(m)}
                  onRetire={async () => { await archiveMessage(m.id) }}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── In rotation ──────────────────────────────────────── */}
        <section>
          <SectionHeader title="In rotation." count={inRotation.length} />
          {inRotation.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {inRotation.map(m => (
                <ListRow key={m.id} msg={m} coverage={coverage.get(m.id) ?? 0} showAge onEdit={() => setEditMsg(m)} onMenuOpen={openMenu} />
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: C.inkLo, fontStyle: 'italic' }}>
              Nothing fresh right now — your updates above need a refresh.
            </p>
          )}
        </section>

        {/* ── Your questions ───────────────────────────────────── */}
        <section>
          <SectionHeader title="Your questions." count={questions.length} />
          {questions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {questions.map(m => (
                <ListRow key={m.id} msg={m} coverage={coverage.get(m.id) ?? 0} onEdit={() => setEditMsg(m)} onMenuOpen={openMenu} />
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: C.inkLo, fontStyle: 'italic' }}>
              No open questions. Add the ones you want every coach to answer.
            </p>
          )}
        </section>

        {/* ── Archived (collapsed) ─────────────────────────────── */}
        {archived.length > 0 && (
          <section>
            <button
              onClick={() => setArchivedOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
            >
              <h2 style={{ margin: 0, fontSize: 'clamp(16px, 2.2vw, 20px)', fontWeight: 700, letterSpacing: '-0.02em', color: C.ink, fontStyle: 'italic' }}>
                Archived.
              </h2>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.inkLo }}>{archived.length}</span>
              <span style={{ fontSize: 12, color: C.inkMute, transform: archivedOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>▾</span>
            </button>
            {archivedOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {archived.map(m => (
                  <div key={m.id} style={{ ...rowShell, opacity: 0.75 }}>
                    <span style={{ ...titleStyle, cursor: 'pointer' }} onClick={() => setEditMsg(m)}>{m.title}</span>
                    <button onClick={async () => { await unarchiveMessage(m.id) }} style={miniGhost}>Restore</button>
                    <KebabButton id={m.id} onMenuOpen={openMenu} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Kebab dropdown portal */}
      {menuOpen && menuPos && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 2000, minWidth: 150, overflow: 'hidden' }}>
          <button onClick={() => { setMenuOpen(null); setEditMsg(messages.find(m => m.id === menuOpen) ?? null) }} style={menuItemStyle}>Edit</button>
          {messages.find(m => m.id === menuOpen)?.status === 'active' ? (
            <button onClick={async () => { setMenuOpen(null); await archiveMessage(menuOpen!) }} style={menuItemStyle}>Archive</button>
          ) : (
            <button onClick={async () => { setMenuOpen(null); await unarchiveMessage(menuOpen!) }} style={menuItemStyle}>Restore</button>
          )}
          <button onClick={() => { setMenuOpen(null); setDeleteTarget(messages.find(m => m.id === menuOpen) ?? null); setDeleteInput('') }} style={{ ...menuItemStyle, color: C.red }}>Delete</button>
        </div>,
        document.body
      )}

      {/* Add/Edit modal */}
      {(showNew || editMsg) && (
        <MessageModal
          message={editMsg}
          onClose={() => { setShowNew(false); setEditMsg(null) }}
          onSave={async (data) => {
            if (editMsg) {
              await updateMessage(editMsg.id, data)
            } else {
              await insertMessage({ title: data.title!, type: data.type! as MessageType, notes: data.notes ?? null, expires_at: data.expires_at ?? null })
            }
            setShowNew(false)
            setEditMsg(null)
          }}
          onArchive={editMsg ? async () => { await archiveMessage(editMsg.id); setEditMsg(null) } : undefined}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteModal
          title={deleteTarget.title}
          input={deleteInput}
          onInputChange={setDeleteInput}
          onConfirm={async () => { await deleteMessage(deleteTarget.id); setDeleteTarget(null); setDeleteInput('') }}
          onCancel={() => { setDeleteTarget(null); setDeleteInput('') }}
        />
      )}
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <h2 style={{ margin: '0 0 12px', fontSize: 'clamp(16px, 2.2vw, 20px)', fontWeight: 700, letterSpacing: '-0.02em', color: C.ink, fontStyle: 'italic' }}>
      {title}
      {count != null && <span style={{ fontSize: 13, fontWeight: 600, color: C.inkLo, fontStyle: 'normal', marginLeft: 8 }}>{count}</span>}
    </h2>
  )
}

// ── Phase guidance panel (static copy; auto-matching messages to archetypes is a future enhancement) ──

function GuidancePanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const cols = [
    { accent: C.petrol,    phase: 'Get Seen',      title: 'Who you are.', body: 'Your intro, academic identity, position, and film — the story that makes a coach look twice.' },
    { accent: C.persimmon, phase: 'Get Recruited', title: 'What’s new — and what you’re asking.', body: 'Season results, new film, and test scores as they land — plus the questions that show you’re serious: their recruiting timeline, how they evaluate, where you fit.' },
    { accent: C.violet,    phase: 'Get In',        title: 'The decision materials.', body: 'Pre-read asks, visit logistics, and application and aid timelines.' },
  ]
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '14px 18px', textAlign: 'left' }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: C.ink, fontStyle: 'italic' }}>
          What coaches need to hear, phase by phase.
        </h3>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: C.inkMute, transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: '0 18px 18px' }}>
          <div className="tp-guide-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {cols.map(c => (
              <div key={c.phase} style={{ borderTop: `2px solid ${c.accent}`, paddingTop: 10 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: c.accent, marginBottom: 4 }}>{c.phase}</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, fontStyle: 'italic', letterSpacing: '-0.01em', marginBottom: 5 }}>{c.title}</div>
                <div style={{ fontSize: 12, color: C.inkMid, lineHeight: 1.5 }}>{c.body}</div>
              </div>
            ))}
          </div>
          <p style={{ margin: '14px 0 0', fontSize: 12, color: C.inkLo, lineHeight: 1.5, fontStyle: 'italic' }}>
            Fresh talking points make every email easier to write — and coverage tells you who&apos;s heard what.
          </p>
        </div>
      )}
      <style>{`
        @media (max-width: 640px) {
          .tp-guide-cols { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

// ── Rows ───────────────────────────────────────────────────────────────────

const rowShell: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 14px', background: C.white, border: `1px solid ${C.border}`, borderRadius: 8,
}
const titleStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: C.ink,
  overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
}
const metaStyle: React.CSSProperties = { fontSize: 11, color: C.inkLo, whiteSpace: 'nowrap', flexShrink: 0 }
const miniGhost: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 999, border: `1px solid ${C.border}`, background: C.white,
  fontSize: 11, fontWeight: 650, color: C.inkMid, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
}
const miniPrimary: React.CSSProperties = { ...miniGhost, background: C.ink, color: C.white, border: 'none' }

function TriageRow({ msg, onRefresh, onRetire }: { msg: Message; onRefresh: () => void; onRetire: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false)
  const expired = isExpired(msg)
  return (
    <div style={rowShell}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: TYPE_DOT[msg.type], flexShrink: 0 }} />
      <span style={{ ...titleStyle, cursor: 'pointer' }} onClick={onRefresh}>{msg.title}</span>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0,
        background: expired ? '#FBEAE8' : '#FCF0DB', color: expired ? '#7A1E16' : '#7A4F0E',
      }}>
        {expired ? 'Expired' : `${daysSince(msg.updated_at)}d old`}
      </span>
      {confirm ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.inkLo, flexShrink: 0 }}>
          Retire?
          <button onClick={async () => { await onRetire(); setConfirm(false) }} style={miniPrimary}>Yes</button>
          <button onClick={() => setConfirm(false)} style={miniGhost}>No</button>
        </span>
      ) : (
        <>
          <button onClick={onRefresh} style={miniGhost}>Refresh</button>
          <button onClick={() => setConfirm(true)} style={miniGhost}>Retire</button>
        </>
      )}
    </div>
  )
}

function ListRow({ msg, coverage, showAge, onEdit, onMenuOpen }: {
  msg: Message; coverage: number; showAge?: boolean
  onEdit: () => void; onMenuOpen: (id: string, btn: HTMLButtonElement) => void
}) {
  return (
    <div style={rowShell}>
      <span style={{ ...titleStyle, cursor: 'pointer' }} onClick={onEdit}>{msg.title}</span>
      {showAge && <span style={metaStyle}>{daysSince(msg.updated_at)}d</span>}
      {coverage > 0 && <span style={metaStyle}>{coverage} heard</span>}
      <KebabButton id={msg.id} onMenuOpen={onMenuOpen} />
    </div>
  )
}

function KebabButton({ id, onMenuOpen }: { id: string; onMenuOpen: (id: string, btn: HTMLButtonElement) => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onMenuOpen(id, e.currentTarget) }}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontSize: 18, color: C.inkLo, lineHeight: 1, flexShrink: 0 }}
    >
      &#8942;
    </button>
  )
}

// ── Add/Edit modal with Coverage tab ─────────────────────────────────────────

type ModalTab = 'edit' | 'coverage'

function MessageModal({ message, onClose, onSave, onArchive }: {
  message: Message | null
  onClose: () => void
  onSave: (data: Partial<Message>) => Promise<void>
  onArchive?: () => Promise<void>
}) {
  const [tab, setTab] = useState<ModalTab>('edit')
  const [title, setTitle] = useState(message?.title ?? '')
  const [type, setType] = useState<MessageType>(message?.type ?? 'update')
  const [notes, setNotes] = useState(message?.notes ?? '')
  const [expiresAt, setExpiresAt] = useState(message?.expires_at ? message.expires_at.split('T')[0] : '')
  const [saving, setSaving] = useState(false)

  const { entries: coverageEntries, loading: coverageLoading } = useSchoolMessageLog(message?.id ?? null)

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    await onSave({
      title: title.trim(),
      type,
      notes: notes.trim() || null,
      expires_at: expiresAt ? new Date(expiresAt + 'T23:59:59Z').toISOString() : null,
    })
    setSaving(false)
  }

  const TIER_COLORS: Record<Category, { bg: string; color: string }> = {
    A: { bg: '#FEE2E2', color: '#991B1B' },
    B: { bg: '#FEF3C7', color: '#92400E' },
    C: { bg: '#E0E7FF', color: '#3730A3' },
    Nope: { bg: '#F3F4F6', color: '#6B7280' },
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
        {/* Header + tabs */}
        <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: C.ink, fontStyle: 'italic' }}>
            {message ? message.title : 'New talking point'}
          </h3>
          {message && (
            <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}` }}>
              {(['edit', 'coverage'] as ModalTab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: '8px 16px', border: 'none', background: 'none',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    color: tab === t ? C.ink : C.inkLo,
                    borderBottom: tab === t ? `2px solid ${C.ink}` : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {t === 'edit' ? 'Edit' : `Coverage (${coverageLoading ? '...' : coverageEntries.length})`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {tab === 'edit' ? (
            <>
              <label style={labelStyle}>Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What do you want to communicate or ask?" style={{ ...inputStyle, marginBottom: 14 }} autoFocus />

              <label style={labelStyle}>Type</label>
              <select value={type} onChange={e => setType(e.target.value as MessageType)} style={{ ...inputStyle, marginBottom: 14 }}>
                <option value="update">Update</option>
                <option value="question">Question</option>
              </select>

              <label style={labelStyle}>Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Context, details, how to use this message..." rows={5} style={{ ...inputStyle, resize: 'vertical', marginBottom: 14 }} />

              <label style={labelStyle}>
                Expires at
                <span style={{ fontWeight: 400, color: C.inkLo, marginLeft: 6 }}>When does this stop being relevant?</span>
              </label>
              <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} style={{ ...inputStyle, marginBottom: 20 }} />
            </>
          ) : (
            <div>
              {coverageLoading ? (
                <div style={{ fontSize: 13, color: C.inkLo, padding: '16px 0' }}>Loading coverage...</div>
              ) : coverageEntries.length === 0 ? (
                <div style={{ fontSize: 13, color: C.inkLo, padding: '16px 0', textAlign: 'center' }}>
                  Not yet detected as communicated to any schools.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 12 }}>
                    Communicated to {coverageEntries.length} school{coverageEntries.length !== 1 ? 's' : ''}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {coverageEntries.map(entry => {
                      const tier = (entry.school?.category ?? 'C') as Category
                      const tc = TIER_COLORS[tier] ?? TIER_COLORS.C
                      return (
                        <div key={entry.id} style={{ padding: '10px 14px', background: '#FAFBFC', borderRadius: 7, border: `1px solid ${C.border}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: tc.bg, color: tc.color }}>{tier}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{entry.school?.short_name ?? entry.school?.name ?? 'Unknown'}</span>
                            <span style={{ fontSize: 11, color: C.inkLo, marginLeft: 'auto' }}>{new Date(entry.detected_at).toLocaleDateString()}</span>
                          </div>
                          {entry.notes && (
                            <div style={{ fontSize: 12, color: C.inkLo, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.notes}</div>
                          )}
                          {entry.contact_log_id && (
                            <a href={`/schools/${entry.school_id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#006A65', textDecoration: 'none', marginTop: 4, display: 'inline-block' }}>
                              View source
                            </a>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {tab === 'edit' && (
          <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {message && onArchive && message.status === 'active' && (
                <button onClick={onArchive} style={ghostBtnStyle}>Retire</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={ghostBtnStyle}>Cancel</button>
              <button
                onClick={handleSave}
                disabled={!title.trim() || saving}
                style={{ padding: '8px 20px', borderRadius: 999, border: 'none', background: C.ink, color: C.white, fontSize: 13, fontWeight: 650, cursor: title.trim() && !saving ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: title.trim() && !saving ? 1 : 0.5 }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
        {tab === 'coverage' && (
          <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={ghostBtnStyle}>Close</button>
          </div>
        )}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: C.inkMid, marginBottom: 4 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.ink, outline: 'none', boxSizing: 'border-box' }
const ghostBtnStyle: React.CSSProperties = { padding: '8px 16px', borderRadius: 999, border: `1px solid ${C.border}`, background: C.white, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: C.inkMid }
const menuItemStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '10px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: C.ink }

// ── Delete confirmation modal ────────────────────────────────────────────────

function DeleteModal({ title, input, onInputChange, onConfirm, onCancel }: {
  title: string
  input: string
  onInputChange: (v: string) => void
  onConfirm: () => Promise<void>
  onCancel: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: 12, width: '100%', maxWidth: 420, boxShadow: '0 25px 50px rgba(0,0,0,0.25)', padding: 24 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: C.ink, fontStyle: 'italic' }}>Delete talking point</h3>
        <p style={{ fontSize: 13, color: C.inkMid, margin: '0 0 4px', lineHeight: 1.5 }}>This will permanently delete &ldquo;{title}&rdquo;.</p>
        <p style={{ fontSize: 13, color: C.inkMid, margin: '0 0 16px' }}>Type <strong>DELETE</strong> to confirm.</p>
        <input value={input} onChange={e => onInputChange(e.target.value)} placeholder="DELETE" style={{ ...inputStyle, marginBottom: 16 }} autoFocus />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={ghostBtnStyle}>Cancel</button>
          <button
            onClick={async () => { setDeleting(true); await onConfirm(); setDeleting(false) }}
            disabled={input !== 'DELETE' || deleting}
            style={{ padding: '8px 20px', borderRadius: 999, border: 'none', background: C.red, color: C.white, fontSize: 13, fontWeight: 650, cursor: input === 'DELETE' && !deleting ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: input === 'DELETE' && !deleting ? 1 : 0.5 }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

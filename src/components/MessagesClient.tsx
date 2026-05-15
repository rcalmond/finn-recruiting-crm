'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useMessages, useSchoolMessageLog } from '@/hooks/useRealtimeData'
import type { Message, MessageType, MessageStatus } from '@/lib/types'

// ── Design tokens ────────────────────────────────────────────────────────────

const C = {
  paper:  '#F6F1E8',
  white:  '#fff',
  border: '#E2DBC9',
  ink:    '#0E0E0E',
  inkMid: '#4A4A4A',
  inkLo:  '#7A7570',
  red:    '#C8102E',
}

const TYPE_STYLES: Record<MessageType, { bg: string; color: string; label: string }> = {
  update:   { bg: '#DCFCE7', color: '#166534', label: 'Update' },
  question: { bg: '#DBEAFE', color: '#1E40AF', label: 'Question' },
}

// ── Filters ──────────────────────────────────────────────────────────────────

type StatusFilter = 'active' | 'archived' | 'all'
type TypeFilter = 'all' | 'update' | 'question'

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px', borderRadius: 6, border: `1px solid ${active ? C.ink : C.border}`,
        background: active ? C.ink : C.white, color: active ? C.white : C.inkMid,
        fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function MessagesClient() {
  const { messages, loading, insertMessage, updateMessage, archiveMessage, unarchiveMessage, deleteMessage } = useMessages()

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [editMsg, setEditMsg] = useState<Message | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const kebabRef = useRef<HTMLButtonElement | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null)
  const [deleteInput, setDeleteInput] = useState('')

  const openMenu = useCallback((id: string, btn: HTMLButtonElement) => {
    if (menuOpen === id) { setMenuOpen(null); return }
    const rect = btn.getBoundingClientRect()
    const dropdownHeight = 120
    const flipUp = rect.bottom + dropdownHeight > window.innerHeight
    setMenuPos({
      top: flipUp ? rect.top - dropdownHeight : rect.bottom + 4,
      left: rect.right - 150,
    })
    setMenuOpen(id)
    kebabRef.current = btn
  }, [menuOpen])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (kebabRef.current?.contains(e.target as Node)) return
      setMenuOpen(null)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [menuOpen])

  const filtered = messages.filter(m => {
    if (statusFilter === 'active' && m.status !== 'active') return false
    if (statusFilter === 'archived' && m.status !== 'archived') return false
    if (typeFilter !== 'all' && m.type !== typeFilter) return false
    return true
  })

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 800, margin: '0 auto' }}>
        <div style={{ fontSize: 13, color: C.inkLo }}>Loading messages...</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.ink }}>Messages</h1>
        <button
          onClick={() => setShowNew(true)}
          style={{
            padding: '8px 16px', borderRadius: 7, border: 'none',
            background: C.ink, color: C.white, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          + New message
        </button>
      </div>

      {/* Status filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <FilterPill label="Active" active={statusFilter === 'active'} onClick={() => setStatusFilter('active')} />
        <FilterPill label="Archived" active={statusFilter === 'archived'} onClick={() => setStatusFilter('archived')} />
        <FilterPill label="All" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
      </div>

      {/* Type filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        <FilterPill label="All types" active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} />
        <FilterPill label="Updates" active={typeFilter === 'update'} onClick={() => setTypeFilter('update')} />
        <FilterPill label="Questions" active={typeFilter === 'question'} onClick={() => setTypeFilter('question')} />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: C.inkLo, fontSize: 14 }}>
          {messages.length === 0
            ? 'No messages yet. Add the things you want to communicate or ask coaches.'
            : 'No messages match this filter.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(msg => (
            <MessageRow
              key={msg.id}
              msg={msg}
              onClick={() => setEditMsg(msg)}
              onMenuOpen={openMenu}
            />
          ))}
        </div>
      )}

      {/* Kebab dropdown portal */}
      {menuOpen && menuPos && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed', top: menuPos.top, left: menuPos.left,
            background: C.white, border: `1px solid ${C.border}`, borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 2000,
            minWidth: 150, overflow: 'hidden',
          }}
        >
          <button
            onClick={() => { setMenuOpen(null); setEditMsg(messages.find(m => m.id === menuOpen) ?? null) }}
            style={menuItemStyle}
          >
            Edit
          </button>
          {messages.find(m => m.id === menuOpen)?.status === 'active' ? (
            <button
              onClick={async () => { setMenuOpen(null); await archiveMessage(menuOpen!) }}
              style={menuItemStyle}
            >
              Archive
            </button>
          ) : (
            <button
              onClick={async () => { setMenuOpen(null); await unarchiveMessage(menuOpen!) }}
              style={menuItemStyle}
            >
              Unarchive
            </button>
          )}
          <button
            onClick={() => { setMenuOpen(null); setDeleteTarget(messages.find(m => m.id === menuOpen) ?? null); setDeleteInput('') }}
            style={{ ...menuItemStyle, color: C.red }}
          >
            Delete
          </button>
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
              await insertMessage({
                title: data.title!,
                type: data.type! as MessageType,
                notes: data.notes ?? null,
                expires_at: data.expires_at ?? null,
              })
            }
            setShowNew(false)
            setEditMsg(null)
          }}
          onArchive={editMsg ? async () => {
            await archiveMessage(editMsg.id)
            setEditMsg(null)
          } : undefined}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteModal
          title={deleteTarget.title}
          input={deleteInput}
          onInputChange={setDeleteInput}
          onConfirm={async () => {
            await deleteMessage(deleteTarget.id)
            setDeleteTarget(null)
            setDeleteInput('')
          }}
          onCancel={() => { setDeleteTarget(null); setDeleteInput('') }}
        />
      )}
    </div>
  )
}

const menuItemStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '10px 16px', border: 'none',
  background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer',
  fontFamily: 'inherit', color: C.ink,
}

// ── Message row ──────────────────────────────────────────────────────────────

function MessageRow({ msg, onClick, onMenuOpen }: {
  msg: Message
  onClick: () => void
  onMenuOpen: (id: string, btn: HTMLButtonElement) => void
}) {
  const ts = TYPE_STYLES[msg.type]
  const isExpired = msg.expires_at && new Date(msg.expires_at) < new Date()

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '14px 16px', background: C.white, borderRadius: 8,
        border: `1px solid ${C.border}`, cursor: 'pointer',
        opacity: msg.status === 'archived' ? 0.6 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
            textTransform: 'uppercase', letterSpacing: 0.4,
            background: ts.bg, color: ts.color,
          }}>
            {ts.label}
          </span>
          {msg.status === 'archived' && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              textTransform: 'uppercase', letterSpacing: 0.4,
              background: '#E5E7EB', color: '#6B7280',
            }}>
              archived
            </span>
          )}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 2 }}>
          {msg.title}
        </div>
        {msg.notes && (
          <div style={{
            fontSize: 12, color: C.inkLo, lineHeight: 1.4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {msg.notes}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: C.inkLo }}>
          <span>Created {new Date(msg.created_at).toLocaleDateString()}</span>
          {msg.expires_at && (
            <span style={{ color: isExpired ? C.red : C.inkLo }}>
              {isExpired ? 'Expired' : 'Expires'} {new Date(msg.expires_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onMenuOpen(msg.id, e.currentTarget) }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
          fontSize: 18, color: C.inkLo, lineHeight: 1, flexShrink: 0,
        }}
      >
        &#8942;
      </button>
    </div>
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

  const TIER_COLORS: Record<string, { bg: string; color: string }> = {
    A: { bg: '#FEE2E2', color: '#991B1B' },
    B: { bg: '#FEF3C7', color: '#92400E' },
    C: { bg: '#E0E7FF', color: '#3730A3' },
    Nope: { bg: '#F3F4F6', color: '#6B7280' },
  }

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
          background: C.white, borderRadius: 12, width: '100%', maxWidth: 560,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
        }}
      >
        {/* Header + tabs */}
        <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: C.ink }}>
            {message ? message.title : 'New message'}
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
              {/* Title */}
              <label style={labelStyle}>Title</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="What do you want to communicate or ask?"
                style={{ ...inputStyle, marginBottom: 14 }}
                autoFocus
              />

              {/* Type */}
              <label style={labelStyle}>Type</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as MessageType)}
                style={{ ...inputStyle, marginBottom: 14 }}
              >
                <option value="update">Update</option>
                <option value="question">Question</option>
              </select>

              {/* Notes */}
              <label style={labelStyle}>Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Context, details, how to use this message..."
                rows={5}
                style={{ ...inputStyle, resize: 'vertical', marginBottom: 14 }}
              />

              {/* Expires at */}
              <label style={labelStyle}>
                Expires at
                <span style={{ fontWeight: 400, color: C.inkLo, marginLeft: 6 }}>
                  When does this stop being relevant?
                </span>
              </label>
              <input
                type="date"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                style={{ ...inputStyle, marginBottom: 20 }}
              />
            </>
          ) : (
            /* Coverage tab */
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
                      const tier = entry.school?.category ?? 'C'
                      const tc = TIER_COLORS[tier] ?? TIER_COLORS.C
                      return (
                        <div
                          key={entry.id}
                          style={{
                            padding: '10px 14px', background: '#FAFBFC', borderRadius: 7,
                            border: `1px solid ${C.border}`,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                              background: tc.bg, color: tc.color,
                            }}>
                              {tier}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                              {entry.school?.short_name ?? entry.school?.name ?? 'Unknown'}
                            </span>
                            <span style={{ fontSize: 11, color: C.inkLo, marginLeft: 'auto' }}>
                              {new Date(entry.detected_at).toLocaleDateString()}
                            </span>
                          </div>
                          {entry.notes && (
                            <div style={{
                              fontSize: 12, color: C.inkLo, lineHeight: 1.4,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {entry.notes}
                            </div>
                          )}
                          {entry.contact_log_id && (
                            <a
                              href={`/schools/${entry.school_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: 11, color: '#2563EB', textDecoration: 'none', marginTop: 4, display: 'inline-block' }}
                            >
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

        {/* Footer actions — only on edit tab */}
        {tab === 'edit' && (
          <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {message && onArchive && message.status === 'active' && (
                <button onClick={onArchive} style={ghostBtnStyle}>Archive</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={ghostBtnStyle}>Cancel</button>
              <button
                onClick={handleSave}
                disabled={!title.trim() || saving}
                style={{
                  padding: '8px 20px', borderRadius: 7, border: 'none',
                  background: C.ink, color: C.white, fontSize: 13, fontWeight: 600,
                  cursor: title.trim() && !saving ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit', opacity: title.trim() && !saving ? 1 : 0.5,
                }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* Footer — coverage tab just has close */}
        {tab === 'coverage' && (
          <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={ghostBtnStyle}>Close</button>
          </div>
        )}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: C.inkMid, marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 6,
  border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit',
  color: C.ink, outline: 'none', boxSizing: 'border-box',
}

const ghostBtnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 7, border: `1px solid ${C.border}`,
  background: C.white, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit', color: C.inkMid,
}

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
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.white, borderRadius: 12, width: '100%', maxWidth: 420,
          boxShadow: '0 25px 50px rgba(0,0,0,0.25)', padding: 24,
        }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: C.ink }}>
          Delete message
        </h3>
        <p style={{ fontSize: 13, color: C.inkMid, margin: '0 0 4px', lineHeight: 1.5 }}>
          This will permanently delete &ldquo;{title}&rdquo;.
        </p>
        <p style={{ fontSize: 13, color: C.inkMid, margin: '0 0 16px' }}>
          Type <strong>DELETE</strong> to confirm.
        </p>
        <input
          value={input}
          onChange={e => onInputChange(e.target.value)}
          placeholder="DELETE"
          style={{ ...inputStyle, marginBottom: 16 }}
          autoFocus
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={ghostBtnStyle}>Cancel</button>
          <button
            onClick={async () => { setDeleting(true); await onConfirm(); setDeleting(false) }}
            disabled={input !== 'DELETE' || deleting}
            style={{
              padding: '8px 20px', borderRadius: 7, border: 'none',
              background: C.red, color: C.white, fontSize: 13, fontWeight: 600,
              cursor: input === 'DELETE' && !deleting ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit', opacity: input === 'DELETE' && !deleting ? 1 : 0.5,
            }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import type { SchoolStatusUpdate, ShareWithCoach } from '@/lib/types'

const SD = {
  ink:       '#0E0E0E',
  inkMid:    '#4A4A4A',
  inkLo:     '#7A7570',
  inkMute:   '#A8A39B',
  line:      '#E2DBC9',
  line2:     '#D3CAB3',
  paperDeep: '#EFE8D8',
  white:     '#FFFFFF',
  tealDeep:  '#006A65',
  tealSoft:  '#D7F0ED',
  red:       '#C8102E',
  redSoft:   '#FCE4E8',
  goldInk:   '#5A4E0F',
  goldSoft:  '#FBF3C4',
}

const SHARE_OPTIONS: { value: ShareWithCoach; label: string; bg: string; fg: string }[] = [
  { value: 'yes',       label: 'Share',        bg: SD.tealSoft, fg: SD.tealDeep },
  { value: 'no',        label: "Don't share",  bg: SD.redSoft,  fg: SD.red      },
  { value: 'undecided', label: 'Undecided',     bg: SD.paperDeep, fg: SD.inkLo    },
]

function relativeDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function sharePill(flag: ShareWithCoach) {
  const opt = SHARE_OPTIONS.find(o => o.value === flag) ?? SHARE_OPTIONS[2]
  return (
    <span style={{
      padding: '1px 7px', borderRadius: 999,
      fontSize: 10, fontWeight: 650,
      background: opt.bg, color: opt.fg,
      whiteSpace: 'nowrap',
    }}>{opt.label}</span>
  )
}

interface Props {
  schoolId: string
  updates: SchoolStatusUpdate[]
  onInsert: (update: { school_id: string; body: string; share_with_coach: ShareWithCoach }) => Promise<{ error: unknown }>
  onUpdate: (id: string, fields: { body?: string; share_with_coach?: ShareWithCoach }) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
}

export default function StatusUpdatesPanel({ schoolId, updates, onInsert, onUpdate, onDelete }: Props) {
  const [adding, setAdding] = useState(false)
  const [newBody, setNewBody] = useState('')
  const [newShare, setNewShare] = useState<ShareWithCoach>('undecided')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [editShare, setEditShare] = useState<ShareWithCoach>('undecided')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [saving, setSaving] = useState(false)

  const visible = showAll ? updates : updates.slice(0, 3)
  const hasMore = updates.length > 3

  async function handleAdd() {
    if (!newBody.trim()) return
    setSaving(true)
    await onInsert({ school_id: schoolId, body: newBody.trim(), share_with_coach: newShare })
    setNewBody('')
    setNewShare('undecided')
    setAdding(false)
    setSaving(false)
  }

  function startEdit(u: SchoolStatusUpdate) {
    setEditingId(u.id)
    setEditBody(u.body)
    setEditShare(u.share_with_coach)
  }

  async function saveEdit() {
    if (!editingId || !editBody.trim()) return
    await onUpdate(editingId, { body: editBody.trim(), share_with_coach: editShare })
    setEditingId(null)
  }

  async function handleDelete(id: string) {
    await onDelete(id)
    setConfirmDeleteId(null)
  }

  return (
    <div>
      {updates.length === 0 && !adding && (
        <div style={{ fontSize: 12, color: SD.inkMute, fontStyle: 'italic', marginBottom: 10 }}>
          Log where you stand with this school — camps, timing, intentions.
        </div>
      )}

      {/* Entry list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map(u => (
          editingId === u.id ? (
            <div key={u.id} style={{ background: SD.paperDeep, borderRadius: 8, padding: '10px 12px', border: `1px solid ${SD.line2}` }}>
              <textarea
                value={editBody}
                onChange={e => setEditBody(e.target.value)}
                rows={2}
                autoFocus
                style={{
                  width: '100%', padding: '6px 8px', border: `1px solid ${SD.line}`,
                  borderRadius: 6, fontSize: 12, fontFamily: 'inherit', resize: 'vertical',
                  background: SD.white, color: SD.ink, outline: 'none', boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                {SHARE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEditShare(opt.value)}
                    style={{
                      padding: '2px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
                      fontSize: 10, fontWeight: editShare === opt.value ? 700 : 500, fontFamily: 'inherit',
                      background: editShare === opt.value ? opt.bg : 'transparent',
                      color: editShare === opt.value ? opt.fg : SD.inkMute,
                    }}
                  >{opt.label}</button>
                ))}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <button type="button" onClick={saveEdit} disabled={!editBody.trim()} style={smBtn(SD.ink, SD.white)}>Save</button>
                  <button type="button" onClick={() => setEditingId(null)} style={smBtn(SD.paperDeep, SD.inkLo)}>Cancel</button>
                </div>
              </div>
            </div>
          ) : confirmDeleteId === u.id ? (
            <div key={u.id} style={{ background: SD.redSoft, borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 12, color: SD.red }}>Delete this update?</span>
              <button type="button" onClick={() => handleDelete(u.id)} style={smBtn(SD.red, SD.white)}>Delete</button>
              <button type="button" onClick={() => setConfirmDeleteId(null)} style={smBtn(SD.paperDeep, SD.inkLo)}>Cancel</button>
            </div>
          ) : (
            <div key={u.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 13, color: SD.inkMid, lineHeight: 1.45 }}>{u.body}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: SD.inkMute }}>{relativeDate(u.created_at)}</span>
                {sharePill(u.share_with_coach)}
                <button
                  type="button"
                  onClick={() => startEdit(u)}
                  style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: SD.inkMute, cursor: 'pointer', fontFamily: 'inherit' }}
                >Edit</button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(u.id)}
                  style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: SD.inkMute, cursor: 'pointer', fontFamily: 'inherit' }}
                >Delete</button>
              </div>
            </div>
          )
        ))}
      </div>

      {/* Show all / collapse */}
      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          style={{ background: 'none', border: 'none', padding: '6px 0 0', fontSize: 11, color: SD.inkLo, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
        >Show all ({updates.length})</button>
      )}
      {hasMore && showAll && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          style={{ background: 'none', border: 'none', padding: '6px 0 0', fontSize: 11, color: SD.inkLo, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
        >Show fewer</button>
      )}

      {/* Add form */}
      {adding ? (
        <div style={{ marginTop: 10, background: SD.tealSoft + '50', borderRadius: 8, padding: '10px 12px', border: `1px dashed ${SD.tealDeep}30` }}>
          <textarea
            value={newBody}
            onChange={e => setNewBody(e.target.value)}
            rows={2}
            autoFocus
            placeholder="What's happening with this school?"
            style={{
              width: '100%', padding: '6px 8px', border: `1px solid ${SD.line}`,
              borderRadius: 6, fontSize: 12, fontFamily: 'inherit', resize: 'vertical',
              background: SD.white, color: SD.ink, outline: 'none', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: SD.inkLo, textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 2 }}>Share with coach?</span>
            {SHARE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setNewShare(opt.value)}
                style={{
                  padding: '2px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
                  fontSize: 10, fontWeight: newShare === opt.value ? 700 : 500, fontFamily: 'inherit',
                  background: newShare === opt.value ? opt.bg : 'transparent',
                  color: newShare === opt.value ? opt.fg : SD.inkMute,
                }}
              >{opt.label}</button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              <button type="button" onClick={handleAdd} disabled={saving || !newBody.trim()} style={smBtn(SD.ink, SD.white)}>Save</button>
              <button type="button" onClick={() => { setAdding(false); setNewBody(''); setNewShare('undecided') }} style={smBtn(SD.paperDeep, SD.inkLo)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          style={{
            marginTop: updates.length > 0 ? 8 : 0,
            background: 'none', border: `1px solid ${SD.line2}`, borderRadius: 999,
            padding: '4px 14px', fontSize: 11, fontWeight: 600,
            cursor: 'pointer', color: SD.inkLo, fontFamily: 'inherit',
          }}
        >+ Add update</button>
      )}
    </div>
  )
}

function smBtn(bg: string, fg: string): React.CSSProperties {
  return {
    padding: '3px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
    fontSize: 11, fontWeight: 650, fontFamily: 'inherit',
    background: bg, color: fg,
  }
}

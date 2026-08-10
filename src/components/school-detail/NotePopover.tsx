'use client'

import { useState, useRef, useEffect } from 'react'
import type { ShareWithCoach } from '@/lib/types'

const SD = {
  paper: '#F6F1E8', paperDeep: '#EFE8D8',
  ink: '#0E0E0E', inkMid: '#4A4A4A', inkLo: '#7A7570', inkMute: '#A8A39B',
  line: '#E2DBC9', tealDeep: '#006A65',
}

type NoteType = 'status_update' | 'action_item' | 'contact_log'

const NOTE_TYPES: { type: NoteType; label: string; desc: string }[] = [
  { type: 'status_update', label: 'Status update', desc: 'Where things stand or what Finn intends' },
  { type: 'action_item', label: 'Action item', desc: 'A to-do for this school' },
  { type: 'contact_log', label: 'Log a contact', desc: 'A call, text, or in-person that happened' },
]

interface Props {
  schoolId: string
  onSaveStatusUpdate: (body: string, share: ShareWithCoach) => Promise<void>
  onSaveActionItem: (action: string) => Promise<void>
  onSaveContactLog: (entry: { direction: string; channel: string; date: string; summary: string }) => Promise<void>
}

export default function NotePopover({ schoolId, onSaveStatusUpdate, onSaveActionItem, onSaveContactLog }: Props) {
  const [open, setOpen] = useState(false)
  const [noteType, setNoteType] = useState<NoteType>('status_update')
  const [text, setText] = useState('')
  const [shareFlag, setShareFlag] = useState<ShareWithCoach>('undecided')
  const [direction, setDirection] = useState('Inbound')
  const [channel, setChannel] = useState('Phone')
  const [contactDate, setContactDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close on outside click or Esc
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const resetForm = () => {
    setText('')
    setShareFlag('undecided')
    setDirection('Inbound')
    setChannel('Phone')
    setContactDate(new Date().toISOString().split('T')[0])
  }

  const handleSave = async () => {
    if (!text.trim()) return
    setSaving(true)
    try {
      if (noteType === 'status_update') {
        await onSaveStatusUpdate(text.trim(), shareFlag)
      } else if (noteType === 'action_item') {
        await onSaveActionItem(text.trim())
      } else if (noteType === 'contact_log') {
        await onSaveContactLog({ direction, channel, date: contactDate, summary: text.trim() })
      }
      resetForm()
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', border: `1px solid ${SD.line}`,
    borderRadius: 6, fontSize: 12, fontFamily: 'inherit', background: '#fff',
    color: SD.ink, boxSizing: 'border-box', outline: 'none',
  }

  return (
    <div style={{ position: 'relative' }} ref={popoverRef}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          all: 'unset', cursor: 'pointer',
          padding: '5px 12px', fontSize: 11, fontWeight: 700,
          color: SD.tealDeep, border: `1.3px solid ${SD.line}`,
          borderRadius: 999, letterSpacing: '-0.01em',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
      >
        + Add
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          width: 340, background: '#FFFDF9', border: `1px solid ${SD.line}`,
          borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 100, padding: 16,
        }}>
          {/* Type selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
            {NOTE_TYPES.map(nt => (
              <button
                key={nt.type}
                onClick={() => { setNoteType(nt.type); setText('') }}
                style={{
                  all: 'unset', cursor: 'pointer',
                  padding: '8px 10px', borderRadius: 8,
                  background: noteType === nt.type ? SD.paperDeep : 'transparent',
                  border: `1px solid ${noteType === nt.type ? SD.line : 'transparent'}`,
                  display: 'flex', flexDirection: 'column', gap: 1,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 650, color: SD.ink }}>{nt.label}</span>
                <span style={{ fontSize: 10, color: SD.inkLo }}>{nt.desc}</span>
              </button>
            ))}
          </div>

          {/* Type-specific fields */}
          {noteType === 'status_update' && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: SD.inkLo, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Share with coach?
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['yes', 'no', 'undecided'] as ShareWithCoach[]).map(v => (
                  <button
                    key={v}
                    onClick={() => setShareFlag(v)}
                    style={{
                      all: 'unset', cursor: 'pointer',
                      padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                      background: shareFlag === v ? SD.ink : 'transparent',
                      color: shareFlag === v ? '#fff' : SD.inkLo,
                      border: `1px solid ${shareFlag === v ? SD.ink : SD.line}`,
                    }}
                  >
                    {v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'Undecided'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {noteType === 'contact_log' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: SD.inkLo, marginBottom: 3 }}>Direction</div>
                <select value={direction} onChange={e => setDirection(e.target.value)} style={inputStyle}>
                  <option value="Inbound">Inbound</option>
                  <option value="Outbound">Outbound</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: SD.inkLo, marginBottom: 3 }}>Channel</div>
                <select value={channel} onChange={e => setChannel(e.target.value)} style={inputStyle}>
                  <option value="Phone">Phone</option>
                  <option value="Text">Text</option>
                  <option value="In Person">In Person</option>
                  <option value="Email">Email</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: SD.inkLo, marginBottom: 3 }}>Date</div>
                <input type="date" value={contactDate} onChange={e => setContactDate(e.target.value)} style={inputStyle} />
              </div>
            </div>
          )}

          {/* Text area — common to all types */}
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            placeholder={
              noteType === 'status_update' ? 'What\'s the current state?' :
              noteType === 'action_item' ? 'What needs to be done?' :
              'What was discussed?'
            }
            style={{ ...inputStyle, resize: 'vertical', marginBottom: 10 }}
          />

          {/* Save */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setOpen(false)} style={{
              all: 'unset', cursor: 'pointer', padding: '5px 12px',
              fontSize: 11, fontWeight: 600, color: SD.inkLo,
            }}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={!text.trim() || saving}
              style={{
                all: 'unset', cursor: !text.trim() || saving ? 'default' : 'pointer',
                padding: '5px 14px', fontSize: 11, fontWeight: 700,
                color: '#fff', background: !text.trim() || saving ? SD.inkMute : SD.ink,
                borderRadius: 999,
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

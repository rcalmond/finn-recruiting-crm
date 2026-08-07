'use client'

import { useState } from 'react'
import type { CalendarEvent, CalendarEventKind, CalendarEventStatus, School } from '@/lib/types'
import { CALENDAR_EVENT_KIND_META, CALENDAR_EVENT_STATUS_META } from '@/lib/types'

const SD = {
  paper: '#F6F1E8', ink: '#0E0E0E', inkMid: '#4A4A4A', inkLo: '#7A7570',
  inkMute: '#A8A39B', line: '#E2DBC9', green: '#2D6A4F', greenSoft: '#D7EFE0',
}

const KINDS: CalendarEventKind[] = ['showcase', 'tournament', 'outreach_moment', 'other']
const STATUSES: CalendarEventStatus[] = ['planned', 'confirmed', 'done', 'skipped']

export default function EventModal({
  event, schools, onSave, onDelete, onClose,
}: {
  event: CalendarEvent | null   // null = add mode
  schools: School[]
  onSave: (input: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at' | 'school_ids'>, schoolIds: string[]) => Promise<unknown>
  onDelete?: () => Promise<unknown>
  onClose: () => void
}) {
  const isEdit = event !== null

  const [kind, setKind] = useState<CalendarEventKind>(event?.kind ?? 'showcase')
  const [name, setName] = useState(event?.name ?? '')
  const [startDate, setStartDate] = useState(event?.start_date ?? '')
  const [multiDay, setMultiDay] = useState(!!event?.end_date)
  const [endDate, setEndDate] = useState(event?.end_date ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [note, setNote] = useState(event?.note ?? '')
  const [status, setStatus] = useState<CalendarEventStatus>(event?.status ?? 'planned')
  const [schoolIds, setSchoolIds] = useState<string[]>(event?.school_ids ?? [])
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isOutreach = kind === 'outreach_moment'
  const activeSchools = schools
    .filter(s => ['A', 'B', 'C'].includes(s.category) && s.status !== 'Inactive')
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))

  const handleSave = async () => {
    if (!name.trim() || !startDate) return
    setSaving(true)
    await onSave({
      kind,
      name: name.trim(),
      start_date: startDate,
      end_date: multiDay && endDate ? endDate : null,
      location: isOutreach ? null : (location.trim() || null),
      note: note.trim() || null,
      status,
    }, schoolIds)
    setSaving(false)
    onClose()
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: SD.ink, marginBottom: 5 }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13, border: `1px solid ${SD.line}`,
    borderRadius: 6, fontFamily: 'inherit', background: '#fff', color: SD.ink, boxSizing: 'border-box',
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1050 }} onClick={onClose} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1051, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, pointerEvents: 'none' }}>
        <div style={{
          background: SD.paper, borderRadius: 16, width: '100%', maxWidth: 520,
          maxHeight: '90vh', overflowY: 'auto', padding: 'clamp(20px, 3vw, 28px)',
          border: `1px solid ${SD.line}`, pointerEvents: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', color: SD.ink, fontStyle: 'italic' }}>
              {isEdit ? 'Edit event.' : 'Add event.'}
            </h2>
            <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 18, color: SD.inkLo, padding: 4 }}>✕</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Kind selector */}
            <div>
              <label style={labelStyle}>Kind</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {KINDS.map(k => {
                  const meta = CALENDAR_EVENT_KIND_META[k]
                  const on = kind === k
                  return (
                    <button key={k} onClick={() => setKind(k)} style={{
                      all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                      padding: '9px 12px', borderRadius: 8,
                      border: `1.5px solid ${on ? SD.green : SD.line}`,
                      background: on ? SD.greenSoft : '#fff',
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: on ? SD.green : SD.ink }}>{meta.label}</div>
                      <div style={{ fontSize: 10.5, color: SD.inkLo, marginTop: 2, lineHeight: 1.3 }}>{meta.description}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Name */}
            <div>
              <label style={labelStyle}>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} style={inputStyle}
                placeholder={isOutreach ? 'e.g. Fall reel drop + season update' : 'e.g. ECNL Phoenix Showcase'} />
            </div>

            {/* Dates */}
            <div>
              <label style={labelStyle}>{multiDay ? 'Dates' : 'Date'}</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
                {multiDay && (
                  <>
                    <span style={{ color: SD.inkMute }}>–</span>
                    <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
                  </>
                )}
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: SD.inkMid, cursor: 'pointer' }}>
                <input type="checkbox" checked={multiDay} onChange={e => { setMultiDay(e.target.checked); if (!e.target.checked) setEndDate('') }}
                  style={{ accentColor: SD.green, cursor: 'pointer' }} />
                Multi-day (date range)
              </label>
            </div>

            {/* Location — hidden for outreach moments */}
            {!isOutreach && (
              <div>
                <label style={labelStyle}>Location</label>
                <input value={location} onChange={e => setLocation(e.target.value)} style={inputStyle}
                  placeholder="e.g. Phoenix, AZ" />
              </div>
            )}

            <div style={{ display: 'flex', gap: 14 }}>
              {/* Status */}
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value as CalendarEventStatus)} style={inputStyle}>
                  {STATUSES.map(s => <option key={s} value={s}>{CALENDAR_EVENT_STATUS_META[s].label}</option>)}
                </select>
              </div>
            </div>

            {/* Note */}
            <div>
              <label style={labelStyle}>Note</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }}
                placeholder={isOutreach ? 'Which schools this send targets, what it includes…' : 'Format, which coaches attend, logistics…'} />
            </div>

            {/* School multi-select (optional) */}
            <div>
              <label style={labelStyle}>Related schools <span style={{ color: SD.inkMute, fontWeight: 400 }}>· optional</span></label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 130, overflowY: 'auto' }}>
                {activeSchools.map(s => {
                  const on = schoolIds.includes(s.id)
                  return (
                    <button key={s.id} onClick={() => setSchoolIds(prev => on ? prev.filter(x => x !== s.id) : [...prev, s.id])} style={{
                      all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 999, fontSize: 12,
                      border: `1px solid ${on ? SD.green : SD.line}`, background: on ? SD.greenSoft : '#fff',
                      color: on ? SD.green : SD.inkMid, fontWeight: on ? 650 : 500,
                    }}>
                      {on ? '✓ ' : ''}{s.short_name || s.name}
                    </button>
                  )
                })}
                {activeSchools.length === 0 && <span style={{ fontSize: 12, color: SD.inkMute, fontStyle: 'italic' }}>No active schools</span>}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 22 }}>
            <div>
              {isEdit && onDelete && !confirmDelete && (
                <button onClick={() => setConfirmDelete(true)} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#991B1B', padding: '6px 4px' }}>Delete</button>
              )}
              {confirmDelete && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: SD.inkMid }}>Delete this event?</span>
                  <button onClick={async () => { if (onDelete) { await onDelete(); onClose() } }} style={{
                    all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#fff', background: '#991B1B', padding: '5px 12px', borderRadius: 5,
                  }}>Confirm</button>
                  <button onClick={() => setConfirmDelete(false)} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, color: SD.inkLo }}>Cancel</button>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', padding: '8px 16px', fontSize: 13, fontWeight: 600, color: SD.inkLo, border: `1px solid ${SD.line}`, borderRadius: 6 }}>Cancel</button>
              <button disabled={!name.trim() || !startDate || saving} onClick={handleSave} style={{
                all: 'unset', cursor: !name.trim() || !startDate || saving ? 'default' : 'pointer',
                padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#fff',
                background: !name.trim() || !startDate || saving ? SD.inkMute : SD.green, borderRadius: 6,
              }}>{saving ? 'Saving…' : isEdit ? 'Save' : 'Add event'}</button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

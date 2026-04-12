'use client'

import { useState } from 'react'
import { useContactLog } from '@/hooks/useRealtimeData'
import { formatDate } from '@/lib/utils'
import type { School, ContactChannel, ContactDirection, ContactLogEntry } from '@/lib/types'

const CHANNELS: ContactChannel[] = ['Email', 'Phone', 'In Person', 'Text', 'Sports Recruits']
const DIRECTIONS: ContactDirection[] = ['Outbound', 'Inbound']

interface Props {
  schools: School[]
  userId: string
  schoolId?: string   // when set, renders as embedded school-scoped log (no paste buttons)
}

export default function ContactLogPanel({ schools, userId, schoolId }: Props) {
  const { entries, loading, insertContact, insertContacts, deleteEntry } = useContactLog(schoolId)
  const [showPasteEmail, setShowPasteEmail] = useState(false)
  const [showPasteSR, setShowPasteSR] = useState(false)
  const [showPasteSROutbound, setShowPasteSROutbound] = useState(false)
  const [filterSchool, setFilterSchool] = useState(schoolId ?? '')

  const filtered = filterSchool ? entries.filter(e => e.school_id === filterSchool) : entries
  const schoolMap = Object.fromEntries(schools.map(s => [s.id, s]))

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={() => setShowPasteEmail(true)}
          style={primaryBtnStyle}
        >
          + Paste Coach Email
        </button>
        <button
          onClick={() => setShowPasteSR(true)}
          style={{ ...primaryBtnStyle, background: '#eff6ff', color: '#1e40af' }}
        >
          + Paste SR Inbound
        </button>
        <button
          onClick={() => setShowPasteSROutbound(true)}
          style={{ ...primaryBtnStyle, background: '#f0fdf4', color: '#166534' }}
        >
          + Paste SR Outbound
        </button>
        <select
          value={filterSchool}
          onChange={e => setFilterSchool(e.target.value)}
          style={selectStyle}
        >
          <option value="">All schools</option>
          {schools.map(s => <option key={s.id} value={s.id}>{s.short_name || s.name}</option>)}
        </select>
        {filterSchool && (
          <button onClick={() => setFilterSchool('')} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Clear</button>
        )}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb' }}>
          No contact log entries yet. Paste a coach email to get started.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(entry => (
          <ContactEntryRow
            key={entry.id}
            entry={entry}
            schoolName={schoolMap[entry.school_id]?.short_name || schoolMap[entry.school_id]?.name || 'Unknown'}
            onDelete={() => deleteEntry(entry.id)}
          />
        ))}
      </div>

      {showPasteEmail && (
        <PasteEmailForm
          schools={schools}
          userId={userId}
          onSave={async (entry) => {
            await insertContact(entry)
            setShowPasteEmail(false)
          }}
          onCancel={() => setShowPasteEmail(false)}
        />
      )}

      {showPasteSR && (
        <PasteSRForm
          schools={schools}
          userId={userId}
          onSave={async (entries) => {
            await insertContacts(entries)
            setShowPasteSR(false)
          }}
          onCancel={() => setShowPasteSR(false)}
        />
      )}

      {showPasteSROutbound && (
        <PasteSROutboundForm
          schools={schools}
          userId={userId}
          onSave={async (entry) => {
            await insertContact(entry)
            setShowPasteSROutbound(false)
          }}
          onCancel={() => setShowPasteSROutbound(false)}
        />
      )}
    </div>
  )
}

function ContactEntryRow({ entry, schoolName, onDelete }: { entry: ContactLogEntry; schoolName: string; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const dirColor = entry.direction === 'Outbound' ? '#059669' : '#2563eb'
  const dirBg = entry.direction === 'Outbound' ? '#d1fae522' : '#dbeafe22'

  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: expanded ? 8 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{schoolName}</span>
          <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>{entry.channel}</span>
          <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: dirBg, color: dirColor }}>{entry.direction}</span>
          {entry.coach_name && <span style={{ fontSize: 12, color: '#64748b' }}>{entry.coach_name}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{formatDate(entry.date)}</span>
          <button onClick={() => setExpanded(!expanded)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>{expanded ? '▲' : '▼'}</button>
          <button onClick={onDelete} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
        </div>
      </div>
      {expanded && (
        <div style={{ fontSize: 12.5, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5, borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
          {entry.summary}
        </div>
      )}
      {!expanded && (
        <div style={{ fontSize: 12.5, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 4 }}>
          {entry.summary}
        </div>
      )}
    </div>
  )
}

function PasteEmailForm({ schools, userId, onSave, onCancel }: {
  schools: School[]
  userId: string
  onSave: (e: Omit<ContactLogEntry, 'id' | 'created_at' | 'school'>) => Promise<void>
  onCancel: () => void
}) {
  const [schoolId, setSchoolId] = useState('')
  const [direction, setDirection] = useState<ContactDirection>('Inbound')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [coachName, setCoachName] = useState('')
  const [rawEmail, setRawEmail] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!schoolId || !rawEmail) return
    setSaving(true)
    await onSave({ school_id: schoolId, date, channel: 'Email', direction, coach_name: coachName || null, summary: rawEmail, created_by: userId })
    setSaving(false)
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={modalHeaderStyle}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Paste Coach Email</h3>
          <button onClick={onCancel} style={closeBtnStyle}>&times;</button>
        </div>
        <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 16px' }}>
          Paste the full email text. Creates a contact log entry and updates last contact date.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Label>School</Label>
            {!schoolId ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {schools.sort((a, b) => a.name.localeCompare(b.name)).map(s => (
                  <button key={s.id} onClick={() => setSchoolId(s.id)} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid #e5e7eb', background: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: '#475569' }}>
                    {s.short_name || s.name}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, marginTop: 4 }}>
                {schools.find(s => s.id === schoolId)?.name}
                <button onClick={() => setSchoolId('')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', marginLeft: 6, fontSize: 11, fontFamily: 'inherit' }}>change</button>
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <Label>Date</Label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <Label>Direction</Label>
              <select value={direction} onChange={e => setDirection(e.target.value as ContactDirection)} style={fieldStyle}>
                <option value="Inbound">Inbound</option>
                <option value="Outbound">Outbound</option>
              </select>
            </div>
            <div>
              <Label>Coach Name</Label>
              <input value={coachName} onChange={e => setCoachName(e.target.value)} placeholder="e.g. Coach Cross" style={fieldStyle} />
            </div>
          </div>
          <div>
            <Label>Email Content</Label>
            <textarea value={rawEmail} onChange={e => setRawEmail(e.target.value)} rows={8} placeholder="Paste the full email here..." style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !rawEmail || !schoolId} style={{ ...primaryBtnStyle, opacity: saving || !rawEmail || !schoolId ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Save to Log'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PasteSRForm({ schools, userId, onSave, onCancel }: {
  schools: School[]
  userId: string
  onSave: (entries: Omit<ContactLogEntry, 'id' | 'created_at' | 'school'>[]) => Promise<void>
  onCancel: () => void
}) {
  const [rawText, setRawText] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!schoolId || !rawText) return
    setSaving(true)
    // Each paste becomes one entry; split on blank lines for multi-message
    const messages = rawText.split(/\n{3,}/).filter(m => m.trim())
    const entries = messages.length > 1
      ? messages.map(m => ({ school_id: schoolId, date, channel: 'Sports Recruits' as ContactChannel, direction: 'Inbound' as ContactDirection, coach_name: null, summary: m.trim(), created_by: userId }))
      : [{ school_id: schoolId, date, channel: 'Sports Recruits' as ContactChannel, direction: 'Inbound' as ContactDirection, coach_name: null, summary: rawText.trim(), created_by: userId }]
    await onSave(entries)
    setSaving(false)
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={modalHeaderStyle}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Paste Sports Recruits Message</h3>
          <button onClick={onCancel} style={closeBtnStyle}>&times;</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Label>School</Label>
            {!schoolId ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {schools.sort((a, b) => a.name.localeCompare(b.name)).map(s => (
                  <button key={s.id} onClick={() => setSchoolId(s.id)} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid #e5e7eb', background: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: '#475569' }}>
                    {s.short_name || s.name}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, marginTop: 4 }}>
                {schools.find(s => s.id === schoolId)?.name}
                <button onClick={() => setSchoolId('')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', marginLeft: 6, fontSize: 11, fontFamily: 'inherit' }}>change</button>
              </div>
            )}
          </div>
          <div>
            <Label>Date</Label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <Label>Message Content</Label>
            <textarea value={rawText} onChange={e => setRawText(e.target.value)} rows={10} placeholder="Paste Sports Recruits message thread here…" style={{ ...fieldStyle, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !rawText || !schoolId} style={{ ...primaryBtnStyle, opacity: saving || !rawText || !schoolId ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Save to Log'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── SR Outbound parser ───────────────────────────────────────────────────────

interface ParsedOutbound {
  coachName: string
  schoolName: string
  school: School | null
  date: string
  body: string
}

function parseSROutbound(text: string, schools: School[]): ParsedOutbound {
  const toMatch = text.match(/To:\s*(.+?)\s*\((.+?)\)/)
  const coachName = toMatch ? toMatch[1].trim() : ''
  const schoolName = toMatch ? toMatch[2].trim() : ''

  const dateMatch = text.match(/(\w+\s+\d+,\s*\d{4})\s+at\s+[\d:]+\s+[AP]M/)
  const date = dateMatch
    ? new Date(dateMatch[1]).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0]

  let body = text
  if (dateMatch) {
    const idx = text.indexOf(dateMatch[0])
    body = text.slice(idx + dateMatch[0].length).trim()
  }
  const footerIdx = body.indexOf('To view my full profile')
  if (footerIdx > -1) body = body.slice(0, footerIdx).trim()

  const lower = schoolName.toLowerCase()
  const school = schools.find(s => s.name.toLowerCase() === lower)
    || schools.find(s => s.name.toLowerCase().includes(lower) || lower.includes(s.name.toLowerCase()))
    || null

  return { coachName, schoolName, school, date, body }
}

function PasteSROutboundForm({ schools, userId, onSave, onCancel }: {
  schools: School[]
  userId: string
  onSave: (e: Omit<ContactLogEntry, 'id' | 'created_at' | 'school'>) => Promise<void>
  onCancel: () => void
}) {
  const [rawText, setRawText] = useState('')
  const [parsed, setParsed] = useState<ParsedOutbound | null>(null)
  const [schoolId, setSchoolId] = useState('')
  const [saving, setSaving] = useState(false)

  function handlePaste(text: string) {
    setRawText(text)
    if (!text.trim()) { setParsed(null); return }
    const p = parseSROutbound(text, schools)
    setParsed(p)
    if (p.school) setSchoolId(p.school.id)
  }

  async function handleSave() {
    if (!schoolId || !parsed) return
    setSaving(true)
    await onSave({
      school_id: schoolId,
      date: parsed.date,
      channel: 'Sports Recruits',
      direction: 'Outbound',
      coach_name: parsed.coachName || null,
      summary: parsed.body,
      created_by: userId,
    })
    setSaving(false)
  }

  const selectedSchool = schools.find(s => s.id === schoolId)

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={modalHeaderStyle}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Paste SR Outbound Message</h3>
          <button onClick={onCancel} style={closeBtnStyle}>&times;</button>
        </div>
        <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 16px' }}>
          Paste a sent SR message. Coach, school, and date are parsed automatically.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Label>Paste SR Message</Label>
            <textarea
              value={rawText}
              onChange={e => handlePaste(e.target.value)}
              rows={8}
              placeholder="Paste the full SR sent message here..."
              style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
            />
          </div>

          {parsed && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Parsed Preview</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <Label>Coach</Label>
                  <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600 }}>{parsed.coachName || '—'}</div>
                </div>
                <div>
                  <Label>Date</Label>
                  <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600 }}>{parsed.date}</div>
                </div>
              </div>

              <div>
                <Label>School</Label>
                {!selectedSchool ? (
                  <>
                    {parsed.schoolName && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 6 }}>Could not match "{parsed.schoolName}" — pick manually:</div>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {schools.sort((a, b) => a.name.localeCompare(b.name)).map(s => (
                        <button key={s.id} onClick={() => setSchoolId(s.id)} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid #e5e7eb', background: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: '#475569' }}>
                          {s.short_name || s.name}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: '#2563eb', fontWeight: 600 }}>
                    {selectedSchool.name}
                    <button onClick={() => setSchoolId('')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', marginLeft: 6, fontSize: 11, fontFamily: 'inherit' }}>change</button>
                  </div>
                )}
              </div>

              <div>
                <Label>Message Body</Label>
                <div style={{ fontSize: 12, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5, maxHeight: 120, overflow: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 10px' }}>
                  {parsed.body || '—'}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !parsed || !schoolId} style={{ ...primaryBtnStyle, background: '#166534', opacity: saving || !parsed || !schoolId ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Save to Log'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{children}</span>
}

const fieldStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#0f172a', outline: 'none', boxSizing: 'border-box' }
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const modalStyle: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 600, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }
const modalHeaderStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }
const closeBtnStyle: React.CSSProperties = { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', padding: 4, fontFamily: 'inherit' }
const primaryBtnStyle: React.CSSProperties = { padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#0f172a', color: '#fff' }
const cancelBtnStyle: React.CSSProperties = { padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#f1f5f9', color: '#475569' }
const selectStyle: React.CSSProperties = { padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', background: '#fff', color: '#475569', cursor: 'pointer', outline: 'none' }

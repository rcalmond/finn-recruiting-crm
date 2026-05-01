'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

type SchoolCoach = { id: string; name: string; role: string }

type PartialRow = {
  id: string
  school_id: string
  school_name: string
  direction: string
  coach_name: string | null
  summary: string | null
  date: string
  created_at: string
  parse_notes: string | null
  school_coaches: SchoolCoach[]
}

interface Props {
  partials: PartialRow[]
}

// ── Design tokens (matches coach-changes) ─────────────────────────────────────

const LV = {
  paper:   '#F6F1E8',
  white:   '#fff',
  border:  '#E2DBC9',
  ink:     '#0E0E0E',
  inkLo:   '#7A7570',
  red:     '#C8102E',
  amber:   '#B45309',
  green:   '#16A34A',
  blue:    '#1D4ED8',
}

const ROLES = [
  'Head Coach',
  'Associate Head Coach',
  'Assistant Coach',
  'Volunteer Assistant',
  'Director of Operations',
  'Goalkeeper Coach',
  'Other',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  const now  = Date.now()
  const then = new Date(iso).getTime()
  const diff = Math.round((now - then) / 86_400_000)
  if (diff === 0) return 'today'
  if (diff === 1) return '1 day ago'
  if (diff < 30)  return `${diff} days ago`
  if (diff < 60)  return '1 month ago'
  return `${Math.round(diff / 30)} months ago`
}

function snippet(text: string | null, max = 160): string {
  if (!text) return ''
  const cleaned = text.replace(/\s+/g, ' ').trim()
  return cleaned.length <= max ? cleaned : cleaned.slice(0, max) + '…'
}

// ── Per-row component ─────────────────────────────────────────────────────────

function PartialCard({
  row,
  onDone,
}: {
  row: PartialRow
  onDone: () => void
}) {
  type Panel = 'idle' | 'link' | 'create' | 'noncoach'
  const [panel, setPanel]           = useState<Panel>('idle')
  const [loading, setLoading]       = useState(false)
  const [done, setDone]             = useState<'linked' | 'created' | 'non_coach' | null>(null)
  const [showSnippet, setShowSnippet] = useState(false)

  // link-existing state
  const [selectedCoachId, setSelectedCoachId] = useState('')

  // create-and-link state
  const [firstName, setFirstName]   = useState('')
  const [lastName, setLastName]     = useState('')
  const [role, setRole]             = useState('Assistant Coach')
  const [email, setEmail]           = useState('')
  const [title, setTitle]           = useState('')

  async function doPost(body: Record<string, unknown>) {
    setLoading(true)
    try {
      const res = await fetch(`/api/gmail-partials/${row.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return res.ok
    } catch {
      return false
    } finally {
      setLoading(false)
    }
  }

  async function handleLinkExisting() {
    if (!selectedCoachId) return
    const ok = await doPost({ action: 'link-existing', coach_id: selectedCoachId })
    if (ok) { setDone('linked'); setTimeout(onDone, 400) }
  }

  async function handleCreateAndLink() {
    if (!firstName.trim() || !lastName.trim()) return
    const ok = await doPost({
      action: 'create-and-link',
      first_name: firstName.trim(),
      last_name:  lastName.trim(),
      role,
      email:  email.trim() || undefined,
      title:  title.trim() || undefined,
    })
    if (ok) { setDone('created'); setTimeout(onDone, 400) }
  }

  async function handleMarkNonCoach() {
    const ok = await doPost({ action: 'mark-non-coach' })
    if (ok) { setDone('non_coach'); setTimeout(onDone, 400) }
  }

  if (done) {
    const msg  = done === 'linked' ? 'Linked to coach' : done === 'created' ? 'New coach created & linked' : 'Marked as non-coach'
    const color = done === 'non_coach' ? LV.inkLo : LV.green
    const bg    = done === 'non_coach' ? '#F3F4F6' : '#F0FDF4'
    const bdr   = done === 'non_coach' ? LV.border : '#BBF7D0'
    return (
      <div style={{
        padding: '12px 16px', borderRadius: 8,
        background: bg, border: `1px solid ${bdr}`,
        fontSize: 13, color, fontWeight: 600, opacity: 0.75,
      }}>{msg}</div>
    )
  }

  const dirTag   = row.direction === 'Inbound' ? '← Inbound' : '→ Outbound'
  const dirColor = row.direction === 'Inbound' ? LV.blue : LV.amber

  return (
    <div style={{
      background: LV.white, border: `1px solid ${LV.border}`,
      borderRadius: 8, padding: '14px 16px',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: dirColor,
          background: `${dirColor}14`,
          padding: '2px 7px', borderRadius: 4, letterSpacing: 0.2, flexShrink: 0,
        }}>{dirTag}</span>

        {row.coach_name && (
          <span style={{ fontSize: 13, color: LV.ink, fontWeight: 600 }}>
            {row.coach_name}
          </span>
        )}

        <span style={{ fontSize: 11, color: LV.inkLo, marginLeft: 'auto', flexShrink: 0 }}>
          {relativeDate(row.created_at)}
        </span>
      </div>

      {/* Snippet */}
      {row.summary && (
        <div style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: LV.inkLo, lineHeight: 1.5 }}>
            {showSnippet ? row.summary.replace(/\s+/g, ' ').trim() : snippet(row.summary)}
          </span>
          {row.summary.replace(/\s+/g, ' ').trim().length > 160 && (
            <button
              onClick={() => setShowSnippet(s => !s)}
              style={{
                marginLeft: 6, fontSize: 11, color: LV.inkLo,
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 0, textDecoration: 'underline',
              }}
            >
              {showSnippet ? 'collapse' : 'expand'}
            </button>
          )}
        </div>
      )}

      {/* Action buttons */}
      {panel === 'idle' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {row.school_coaches.length > 0 && (
            <button onClick={() => setPanel('link')} style={btnStyle('secondary')}>
              Link to coach
            </button>
          )}
          <button onClick={() => setPanel('create')} style={btnStyle('primary')}>
            Create new coach
          </button>
          <button onClick={() => setPanel('noncoach')} style={btnStyle('ghost')}>
            Not a coach
          </button>
        </div>
      )}

      {/* Link-existing panel */}
      {panel === 'link' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={selectedCoachId}
            onChange={e => setSelectedCoachId(e.target.value)}
            style={selectStyle}
          >
            <option value="">Select coach…</option>
            {row.school_coaches.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.role})</option>
            ))}
          </select>
          <button
            onClick={handleLinkExisting}
            disabled={!selectedCoachId || loading}
            style={btnStyle('primary', !selectedCoachId || loading)}
          >
            {loading ? 'Linking…' : 'Link'}
          </button>
          <button onClick={() => setPanel('idle')} style={btnStyle('ghost')}>Cancel</button>
        </div>
      )}

      {/* Create-and-link panel */}
      {panel === 'create' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              placeholder="First name *"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              style={{ ...inputStyle, flex: 1, minWidth: 120 }}
            />
            <input
              placeholder="Last name *"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              style={{ ...inputStyle, flex: 1, minWidth: 120 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              style={{ ...selectStyle, flex: 1 }}
            >
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <input
              placeholder="Email (optional)"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ ...inputStyle, flex: 1, minWidth: 160 }}
            />
          </div>
          <input
            placeholder="Title / endowed chair (optional)"
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleCreateAndLink}
              disabled={!firstName.trim() || !lastName.trim() || loading}
              style={btnStyle('primary', !firstName.trim() || !lastName.trim() || loading)}
            >
              {loading ? 'Creating…' : 'Create & link'}
            </button>
            <button onClick={() => setPanel('idle')} style={btnStyle('ghost')}>Cancel</button>
          </div>
        </div>
      )}

      {/* Mark-non-coach confirmation */}
      {panel === 'noncoach' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: LV.inkLo }}>
            Mark as non-coach? Won't surface here again.
          </span>
          <button
            onClick={handleMarkNonCoach}
            disabled={loading}
            style={btnStyle('danger', loading)}
          >
            {loading ? 'Marking…' : 'Confirm'}
          </button>
          <button onClick={() => setPanel('idle')} style={btnStyle('ghost')}>Cancel</button>
        </div>
      )}
    </div>
  )
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6,
  border: `1px solid ${LV.border}`,
  fontSize: 12, color: LV.ink,
  background: LV.paper, outline: 'none',
  width: '100%', boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6,
  border: `1px solid ${LV.border}`,
  fontSize: 12, color: LV.ink,
  background: LV.paper, outline: 'none',
}

function btnStyle(
  variant: 'primary' | 'secondary' | 'ghost' | 'danger',
  disabled = false
): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '6px 14px', borderRadius: 6,
    fontSize: 12, fontWeight: 600,
    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    flexShrink: 0,
  }
  if (variant === 'primary') return { ...base, background: disabled ? LV.border : LV.ink, color: disabled ? LV.inkLo : '#fff' }
  if (variant === 'secondary') return { ...base, background: LV.paper, color: LV.ink, border: `1px solid ${LV.border}` }
  if (variant === 'danger') return { ...base, background: disabled ? LV.border : LV.red, color: '#fff' }
  return { ...base, background: 'transparent', color: LV.inkLo, border: `1px solid ${LV.border}` }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GmailPartialsClient({ partials }: Props) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  function handleDone(id: string) {
    setDismissed(prev => new Set(Array.from(prev).concat(id)))
    setTimeout(() => router.refresh(), 500)
  }

  const visible = partials.filter(p => !dismissed.has(p.id))

  // Group by school
  const grouped: { schoolId: string; schoolName: string; rows: PartialRow[] }[] = []
  const seen = new Map<string, typeof grouped[0]>()
  for (const row of visible) {
    let g = seen.get(row.school_id)
    if (!g) {
      g = { schoolId: row.school_id, schoolName: row.school_name, rows: [] }
      seen.set(row.school_id, g)
      grouped.push(g)
    }
    g.rows.push(row)
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 750, color: LV.ink, letterSpacing: -0.5, margin: 0 }}>
              Parse Review
            </h1>
            <p style={{ fontSize: 13, color: LV.inkLo, marginTop: 4 }}>
              Resolve emails the Gmail parser couldn&apos;t fully process. Link to existing coaches or correct the parse manually.
            </p>
            {visible.length > 0 && (
              <p style={{ fontSize: 13, color: LV.ink, marginTop: 6, fontWeight: 500 }}>
                {visible.length} email{visible.length !== 1 ? 's' : ''} couldn&apos;t be linked to a coach
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Empty state */}
      {grouped.length === 0 && (
        <div style={{
          background: LV.white, border: `1px solid ${LV.border}`,
          borderRadius: 10, padding: '48px 24px',
          textAlign: 'center', color: LV.inkLo, fontSize: 14,
        }}>
          No Gmail partials to review.
        </div>
      )}

      {/* Per-school groups */}
      {grouped.map(group => (
        <div key={group.schoolId} style={{ marginBottom: 28 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: LV.inkLo,
            textTransform: 'uppercase', letterSpacing: 0.6,
            marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <Link
              href={`/schools/${group.schoolId}`}
              style={{ color: LV.inkLo, textDecoration: 'none' }}
            >
              {group.schoolName}
            </Link>
            <span style={{
              padding: '1px 7px', borderRadius: 8,
              background: LV.border, color: LV.inkLo,
              fontSize: 10, fontWeight: 700,
            }}>
              {group.rows.length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.rows.map(row => (
              <PartialCard
                key={row.id}
                row={row}
                onDone={() => handleDone(row.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

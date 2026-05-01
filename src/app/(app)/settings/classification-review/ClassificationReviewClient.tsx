'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

type ReviewRow = {
  id: string
  school_id: string
  school_name: string
  date: string
  coach_name: string | null
  authored_by: string | null
  intent: string | null
  classification_confidence: string | null
  classification_notes: string | null
  classified_at: string | null
  summary: string | null
}

interface Props {
  rows: ReviewRow[]
}

// ── Design tokens (matches coach-changes / gmail-partials) ─────────────────────

const LV = {
  paper:  '#F6F1E8',
  white:  '#fff',
  border: '#E2DBC9',
  ink:    '#0E0E0E',
  inkLo:  '#7A7570',
  red:    '#C8102E',
  amber:  '#B45309',
  green:  '#16A34A',
  blue:   '#1D4ED8',
  violet: '#6D28D9',
}

// ── Enum options ───────────────────────────────────────────────────────────────

const AUTHORED_BY_OPTIONS = [
  { value: 'coach_personal',     label: 'Coach (personal)' },
  { value: 'coach_via_platform', label: 'Coach (via platform)' },
  { value: 'team_automated',     label: 'Team automated' },
  { value: 'staff_non_coach',    label: 'Staff / non-coach' },
  { value: 'unknown',            label: 'Unknown' },
]

const INTENT_OPTIONS = [
  { value: 'requires_reply',  label: 'Requires reply' },
  { value: 'requires_action', label: 'Requires action' },
  { value: 'informational',   label: 'Informational' },
  { value: 'acknowledgement', label: 'Acknowledgement' },
  { value: 'decline',         label: 'Decline' },
  { value: 'unknown',         label: 'Unknown' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (diff === 0) return 'today'
  if (diff === 1) return '1 day ago'
  if (diff < 30)  return `${diff} days ago`
  if (diff < 60)  return '1 month ago'
  return `${Math.round(diff / 30)} months ago`
}

function snippet(text: string | null, max = 150): string {
  if (!text) return ''
  const cleaned = text.replace(/\s+/g, ' ').trim()
  return cleaned.length <= max ? cleaned : cleaned.slice(0, max) + '…'
}

function authoredByColor(v: string | null): string {
  if (v === 'coach_personal') return LV.green
  if (v === 'coach_via_platform') return LV.blue
  if (v === 'team_automated') return LV.inkLo
  if (v === 'staff_non_coach') return LV.amber
  return LV.inkLo
}

function intentColor(v: string | null): string {
  if (v === 'requires_reply') return LV.red
  if (v === 'requires_action') return LV.amber
  if (v === 'decline') return LV.inkLo
  return LV.blue
}

function labelFor(options: { value: string; label: string }[], value: string | null): string {
  return options.find(o => o.value === value)?.label ?? value ?? '?'
}

// ── Per-row card ──────────────────────────────────────────────────────────────

function ReviewCard({ row, onDone }: { row: ReviewRow; onDone: () => void }) {
  const [authoredBy, setAuthoredBy] = useState(row.authored_by ?? 'unknown')
  const [intent, setIntent]         = useState(row.intent ?? 'unknown')
  const [loading, setLoading]       = useState(false)
  const [done, setDone]             = useState<'saved' | 'unknown' | null>(null)
  const [showFull, setShowFull]     = useState(false)

  async function doPost(body: Record<string, unknown>) {
    setLoading(true)
    try {
      const res = await fetch(`/api/classification-review/${row.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return res.ok
    } catch { return false }
    finally  { setLoading(false) }
  }

  async function handleSave() {
    const ok = await doPost({ action: 'override', authored_by: authoredBy, intent })
    if (ok) { setDone('saved'); setTimeout(onDone, 400) }
  }

  async function handleMarkUnknown() {
    const ok = await doPost({ action: 'mark-unknown' })
    if (ok) { setDone('unknown'); setTimeout(onDone, 400) }
  }

  if (done) {
    const msg   = done === 'saved' ? 'Classification saved' : 'Marked as unknown'
    const color = done === 'saved' ? LV.green : LV.inkLo
    const bg    = done === 'saved' ? '#F0FDF4' : '#F3F4F6'
    const bdr   = done === 'saved' ? '#BBF7D0' : LV.border
    return (
      <div style={{
        padding: '12px 16px', borderRadius: 8,
        background: bg, border: `1px solid ${bdr}`,
        fontSize: 13, color, fontWeight: 600, opacity: 0.75,
      }}>{msg}</div>
    )
  }

  const summaryText = (row.summary ?? '').replace(/\s+/g, ' ').trim()

  return (
    <div style={{
      background: LV.white, border: `1px solid ${LV.border}`,
      borderRadius: 8, padding: '14px 16px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        {row.coach_name && (
          <span style={{ fontSize: 13, color: LV.ink, fontWeight: 600 }}>{row.coach_name}</span>
        )}
        <span style={{ fontSize: 11, color: LV.inkLo }}>{row.date}</span>
        <span style={{ fontSize: 11, color: LV.inkLo, marginLeft: 'auto', flexShrink: 0 }}>
          {relativeDate(row.classified_at ?? row.date)}
        </span>
      </div>

      {/* Haiku's current classification chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
          background: `${authoredByColor(row.authored_by)}18`,
          color: authoredByColor(row.authored_by),
        }}>
          {labelFor(AUTHORED_BY_OPTIONS, row.authored_by)}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
          background: `${intentColor(row.intent)}18`,
          color: intentColor(row.intent),
        }}>
          {labelFor(INTENT_OPTIONS, row.intent)}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
          background: '#FEF9C3', color: '#92400E',
        }}>
          low confidence
        </span>
      </div>

      {/* Haiku notes */}
      {row.classification_notes && (
        <p style={{
          fontSize: 11, color: LV.inkLo, fontStyle: 'italic',
          margin: '0 0 8px', lineHeight: 1.4,
        }}>
          {row.classification_notes}
        </p>
      )}

      {/* Snippet */}
      {summaryText && (
        <div style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: LV.inkLo, lineHeight: 1.5 }}>
            {showFull ? summaryText : snippet(row.summary)}
          </span>
          {summaryText.length > 150 && (
            <button
              onClick={() => setShowFull(s => !s)}
              style={{
                marginLeft: 6, fontSize: 11, color: LV.inkLo,
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 0, textDecoration: 'underline',
              }}
            >
              {showFull ? 'collapse' : 'expand'}
            </button>
          )}
        </div>
      )}

      {/* Override dropdowns */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <select
          value={authoredBy}
          onChange={e => setAuthoredBy(e.target.value)}
          style={selectStyle}
        >
          {AUTHORED_BY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={intent}
          onChange={e => setIntent(e.target.value)}
          style={selectStyle}
        >
          {INTENT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={handleSave}
          disabled={loading}
          style={btnStyle('primary', loading)}
        >
          {loading ? 'Saving…' : 'Save override'}
        </button>
        <button
          onClick={handleMarkUnknown}
          disabled={loading}
          style={btnStyle('ghost', loading)}
        >
          Mark unknown
        </button>
      </div>
    </div>
  )
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6,
  border: `1px solid ${LV.border}`,
  fontSize: 12, color: LV.ink,
  background: LV.paper, outline: 'none',
}

function btnStyle(variant: 'primary' | 'ghost', disabled = false): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '6px 14px', borderRadius: 6,
    fontSize: 12, fontWeight: 600,
    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    flexShrink: 0,
  }
  if (variant === 'primary')
    return { ...base, background: disabled ? LV.border : LV.ink, color: disabled ? LV.inkLo : '#fff' }
  return { ...base, background: 'transparent', color: LV.inkLo, border: `1px solid ${LV.border}` }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ClassificationReviewClient({ rows }: Props) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  function handleDone(id: string) {
    setDismissed(prev => new Set(Array.from(prev).concat(id)))
    setTimeout(() => router.refresh(), 500)
  }

  const visible = rows.filter(r => !dismissed.has(r.id))

  // Group by school
  const grouped: { schoolId: string; schoolName: string; rows: ReviewRow[] }[] = []
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
              Classification Review
            </h1>
            <p style={{ fontSize: 13, color: LV.inkLo, marginTop: 4 }}>
              Confirm AI intent labels for emails the classifier wasn&apos;t confident about. Adjust the intent or accept the suggestion.
            </p>
            {visible.length > 0 && (
              <p style={{ fontSize: 13, color: LV.ink, marginTop: 6, fontWeight: 500 }}>
                {visible.length} email{visible.length !== 1 ? 's' : ''} need review
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
          No low-confidence emails to review.
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
              <ReviewCard
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

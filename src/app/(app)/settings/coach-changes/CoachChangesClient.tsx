'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

type ChangeRow = {
  id: string
  school_id: string
  change_type: string
  coach_id: string | null
  details: Record<string, unknown>
  status: string
  created_at: string
  reviewer_note: string | null
  schools: { name: string }
}

type SchoolGroup = {
  schoolId: string
  schoolName: string
  changes: ChangeRow[]
}

interface Props {
  groups: SchoolGroup[]
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const LV = {
  paper:   '#F6F1E8',
  white:   '#fff',
  border:  '#E2DBC9',
  ink:     '#0E0E0E',
  inkLo:   '#7A7570',
  red:     '#C8102E',
  amber:   '#B45309',
  green:   '#16A34A',
}

// ── Change type display helpers ───────────────────────────────────────────────

function changeLabel(changeType: string): { tag: string; color: string } {
  switch (changeType) {
    case 'coach_added':    return { tag: '+ Added',    color: LV.green }
    case 'coach_departed': return { tag: '− Departed', color: LV.red }
    case 'email_added':    return { tag: '~ Email',    color: LV.amber }
    case 'email_changed':  return { tag: '~ Email',    color: LV.amber }
    case 'role_changed':   return { tag: '~ Role',     color: LV.amber }
    case 'name_changed':   return { tag: '~ Name',     color: LV.amber }
    default:               return { tag: changeType,   color: LV.inkLo }
  }
}

function changeDescription(row: ChangeRow): string {
  const d = row.details
  switch (row.change_type) {
    case 'coach_added':
      return `${d.name} — ${d.role}${d.email ? ` — ${d.email}` : ''}${d.endowed_title ? ` [endowed: ${d.endowed_title}]` : ''}`
    case 'coach_departed':
      return `${d.name} — ${d.role}${d.email ? ` — ${d.email}` : ''}`
    case 'email_added':
      return `${d.name}: add ${d.email_new}`
    case 'email_changed':
      return `${d.name}: ${d.email_before} → ${d.email_after}`
    case 'role_changed':
      return `${d.name}: "${d.role_before}" → "${d.role_after}"`
    case 'name_changed':
      return `"${d.name_before}" → "${d.name_after}"`
    default:
      return JSON.stringify(d)
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
}

// ── Per-row component ─────────────────────────────────────────────────────────

function ChangeRowCard({
  row,
  onAction,
}: {
  row: ChangeRow
  onAction: (id: string, action: 'apply' | 'reject', note: string) => Promise<void>
}) {
  const [note, setNote]           = useState('')
  const [loading, setLoading]     = useState<'apply' | 'reject' | null>(null)
  const [done, setDone]           = useState<'applied' | 'rejected' | null>(null)

  const { tag, color } = changeLabel(row.change_type)
  const description    = changeDescription(row)

  async function handle(action: 'apply' | 'reject') {
    setLoading(action)
    await onAction(row.id, action, note)
    setDone(action === 'apply' ? 'applied' : 'rejected')
    setLoading(null)
  }

  if (done) {
    return (
      <div style={{
        padding: '12px 16px',
        borderRadius: 8,
        background: done === 'applied' ? '#F0FDF4' : '#FEF2F2',
        border: `1px solid ${done === 'applied' ? '#BBF7D0' : '#FECACA'}`,
        fontSize: 13,
        color: done === 'applied' ? LV.green : LV.red,
        fontWeight: 600,
        opacity: 0.75,
      }}>
        {done === 'applied' ? 'Applied' : 'Rejected'}
      </div>
    )
  }

  return (
    <div style={{
      background: LV.white,
      border: `1px solid ${LV.border}`,
      borderRadius: 8,
      padding: '14px 16px',
    }}>
      {/* Type tag + description */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color,
          background: `${color}14`,
          padding: '2px 7px', borderRadius: 4,
          letterSpacing: 0.2, flexShrink: 0,
        }}>
          {tag}
        </span>
        <span style={{ fontSize: 13, color: LV.ink, lineHeight: 1.4 }}>
          {description}
        </span>
        <span style={{ fontSize: 11, color: LV.inkLo, marginLeft: 'auto', flexShrink: 0 }}>
          {formatDate(row.created_at)}
        </span>
      </div>

      {/* Note input + actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Optional note…"
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{
            flex: 1, minWidth: 140,
            padding: '6px 10px', borderRadius: 6,
            border: `1px solid ${LV.border}`,
            fontSize: 12, color: LV.ink,
            background: LV.paper, outline: 'none',
          }}
        />
        <button
          onClick={() => handle('apply')}
          disabled={loading !== null}
          style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: loading === 'apply' ? LV.border : LV.ink,
            color: loading === 'apply' ? LV.inkLo : '#fff',
            border: 'none', cursor: loading !== null ? 'not-allowed' : 'pointer',
            flexShrink: 0,
          }}
        >
          {loading === 'apply' ? 'Applying…' : 'Apply'}
        </button>
        <button
          onClick={() => handle('reject')}
          disabled={loading !== null}
          style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: 'transparent',
            color: loading === 'reject' ? LV.inkLo : LV.red,
            border: `1px solid ${loading === 'reject' ? LV.border : LV.red}`,
            cursor: loading !== null ? 'not-allowed' : 'pointer',
            flexShrink: 0,
          }}
        >
          {loading === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CoachChangesClient({ groups }: Props) {
  const router = useRouter()

  async function handleAction(id: string, action: 'apply' | 'reject', note: string) {
    await fetch(`/api/coach-changes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note: note || undefined }),
    })
    // Refresh server data after a short delay (lets the card animate first)
    setTimeout(() => router.refresh(), 400)
  }

  const totalPending = groups.reduce((n, g) => n + g.changes.length, 0)

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 750, color: LV.ink, letterSpacing: -0.5, margin: 0 }}>
              Coaching Staff Changes
            </h1>
            <p style={{ fontSize: 13, color: LV.inkLo, marginTop: 4 }}>
              {totalPending > 0
                ? `${totalPending} change${totalPending !== 1 ? 's' : ''} pending review across ${groups.length} school${groups.length !== 1 ? 's' : ''}`
                : 'All caught up — no pending changes'}
            </p>
          </div>
          <Link
            href="/settings/gmail"
            style={{ fontSize: 12, color: LV.inkLo, textDecoration: 'none' }}
          >
            ← Gmail settings
          </Link>
        </div>
      </div>

      {/* Empty state */}
      {groups.length === 0 && (
        <div style={{
          background: LV.white, border: `1px solid ${LV.border}`,
          borderRadius: 10, padding: '48px 24px',
          textAlign: 'center', color: LV.inkLo, fontSize: 14,
        }}>
          No coaching staff changes to review.
        </div>
      )}

      {/* Per-school groups */}
      {groups.map(group => (
        <div key={group.schoolId} style={{ marginBottom: 28 }}>
          {/* School header */}
          <div style={{
            fontSize: 11, fontWeight: 700, color: LV.inkLo,
            textTransform: 'uppercase', letterSpacing: 0.6,
            marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span>{group.schoolName}</span>
            <span style={{
              padding: '1px 7px', borderRadius: 8,
              background: LV.border, color: LV.inkLo,
              fontSize: 10, fontWeight: 700,
            }}>
              {group.changes.length}
            </span>
          </div>

          {/* Change rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.changes.map(row => (
              <ChangeRowCard
                key={row.id}
                row={row}
                onAction={handleAction}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

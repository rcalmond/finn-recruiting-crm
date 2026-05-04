'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCamps, useSchools } from '@/hooks/useRealtimeData'
import type { CampWithRelations, CampFinnStatusValue, School } from '@/lib/types'

// ─── Design tokens ───────────────────────────────────────────────────────────

const LV = {
  paper:    '#F6F1E8',
  ink:      '#0E0E0E',
  inkMid:   '#4A4A4A',
  inkLo:    '#7A7570',
  inkMute:  '#A8A39B',
  line:     '#E2DBC9',
  line2:    '#D3CAB3',
  red:      '#C8102E',
  tealDeep: '#006A65',
  tealSoft: '#D7F0ED',
}

const TIER_STYLE: Record<string, { bg: string; color: string }> = {
  A: { bg: '#FEE2E2', color: '#991B1B' },
  B: { bg: '#DBEAFE', color: '#1E40AF' },
  C: { bg: '#F3F4F6', color: '#374151' },
}

const STATUS_COLORS: Record<CampFinnStatusValue, { bg: string; color: string }> = {
  interested: { bg: '#DBEAFE', color: '#1E40AF' },
  registered: { bg: '#D7F0ED', color: '#006A65' },
  attended:   { bg: '#F3F4F6', color: '#374151' },
  declined:   { bg: '#FEE2E2', color: '#991B1B' },
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CampDetailClient({ campId }: { campId: string }) {
  const router = useRouter()
  const { schools } = useSchools()
  const { camps, loading, updateCamp, updateFinnStatus, deleteCamp, addSchoolAttendee, removeSchoolAttendee } = useCamps(schools)

  const campData = useMemo(() => camps.find(c => c.camp.id === campId), [camps, campId])

  if (loading) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: LV.inkLo, fontSize: 14,
      }}>Loading...</div>
    )
  }

  if (!campData) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12,
        color: LV.inkLo, fontSize: 14,
      }}>
        <span>Camp not found.</span>
        <Link href="/camps" style={{ color: LV.tealDeep, fontWeight: 600, textDecoration: 'none' }}>
          ← Back to camps
        </Link>
      </div>
    )
  }

  return (
    <div style={{
      maxWidth: 720, margin: '0 auto',
      padding: '24px clamp(20px, 4vw, 40px) 80px',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* Back link */}
      <Link href="/camps" style={{
        fontSize: 12, color: LV.inkMute, textDecoration: 'none', fontWeight: 600,
        display: 'inline-block', marginBottom: 16,
      }}>← Back to camps</Link>

      {/* Header */}
      <HeaderSection camp={campData} onUpdate={updateCamp} />

      {/* Finn's status */}
      <StatusSection camp={campData} onUpdateStatus={updateFinnStatus} />

      {/* Details */}
      <DetailsSection camp={campData} onUpdate={updateCamp} />

      {/* School attendees */}
      <AttendeesSection
        camp={campData}
        schools={schools}
        onAdd={addSchoolAttendee}
        onRemove={removeSchoolAttendee}
      />

      {/* Delete */}
      <DeleteSection campId={campId} onDelete={deleteCamp} onDeleted={() => router.push('/camps')} />
    </div>
  )
}

// ─── Header ──────────────────────────────────────────────────────────────────

function HeaderSection({ camp, onUpdate }: {
  camp: CampWithRelations
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<string | null>
}) {
  const [editingName, setEditingName] = useState(false)
  const [nameText, setNameText] = useState(camp.camp.name)

  const hostName = camp.hostSchool.short_name || camp.hostSchool.name
  const tier = TIER_STYLE[camp.hostSchool.category] ?? TIER_STYLE.C

  async function saveName() {
    if (nameText.trim() && nameText !== camp.camp.name) {
      await onUpdate(camp.camp.id, { name: nameText.trim() })
    }
    setEditingName(false)
  }

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Camp name */}
      {editingName ? (
        <input
          type="text"
          value={nameText}
          onChange={e => setNameText(e.target.value)}
          onBlur={saveName}
          onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setNameText(camp.camp.name); setEditingName(false) } }}
          autoFocus
          style={{
            fontSize: 24, fontWeight: 700, fontStyle: 'italic',
            color: LV.ink, letterSpacing: '-0.03em',
            border: 'none', borderBottom: `2px solid ${LV.tealDeep}`,
            background: 'transparent', outline: 'none',
            width: '100%', padding: '2px 0', fontFamily: 'inherit',
          }}
        />
      ) : (
        <h1
          onClick={() => setEditingName(true)}
          style={{
            margin: 0, fontSize: 24, fontWeight: 700, fontStyle: 'italic',
            color: LV.ink, letterSpacing: '-0.03em', cursor: 'pointer',
          }}
        >{camp.camp.name}</h1>
      )}

      {/* Host school + dates */}
      <div style={{
        marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 13, color: LV.inkMid, flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
          background: tier.bg, color: tier.color,
        }}>{camp.hostSchool.category}</span>
        <Link href={`/schools/${camp.hostSchool.id}`} style={{
          color: LV.ink, fontWeight: 600, textDecoration: 'none',
        }}>{hostName}</Link>
        <span style={{ color: LV.inkMute }}>·</span>
        <span>{formatDateRange(camp.camp.start_date, camp.camp.end_date)}</span>
      </div>
    </div>
  )
}

// ─── Finn's status ───────────────────────────────────────────────────────────

function StatusSection({ camp, onUpdateStatus }: {
  camp: CampWithRelations
  onUpdateStatus: (campId: string, status: CampFinnStatusValue, opts?: { declined_reason?: string; notes?: string }) => Promise<string | null>
}) {
  const currentStatus = camp.finnStatus?.status ?? 'interested'
  const [declineReason, setDeclineReason] = useState(camp.finnStatus?.declined_reason ?? '')
  const [showDeclineInput, setShowDeclineInput] = useState(false)

  const statuses: CampFinnStatusValue[] = ['interested', 'registered', 'attended', 'declined']

  async function handleStatusChange(status: CampFinnStatusValue) {
    if (status === currentStatus) return
    if (status === 'declined') {
      setShowDeclineInput(true)
      await onUpdateStatus(camp.camp.id, status)
    } else {
      setShowDeclineInput(false)
      await onUpdateStatus(camp.camp.id, status)
    }
  }

  async function saveDeclineReason() {
    if (declineReason !== (camp.finnStatus?.declined_reason ?? '')) {
      await onUpdateStatus(camp.camp.id, 'declined', { declined_reason: declineReason || undefined })
    }
    setShowDeclineInput(false)
  }

  // Timestamp for current status
  let timestamp: string | null = null
  if (currentStatus === 'registered' && camp.finnStatus?.registered_at) {
    timestamp = `Registered ${fmtDate(camp.finnStatus.registered_at)}`
  } else if (currentStatus === 'attended' && camp.finnStatus?.attended_at) {
    timestamp = `Attended ${fmtDate(camp.finnStatus.attended_at)}`
  } else if (currentStatus === 'declined' && camp.finnStatus?.declined_at) {
    timestamp = `Declined ${fmtDate(camp.finnStatus.declined_at)}`
  }

  return (
    <div style={{
      marginBottom: 28, padding: '16px 0',
      borderTop: `1px solid ${LV.line}`, borderBottom: `1px solid ${LV.line}`,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: LV.inkMute, marginBottom: 10,
      }}>Finn&apos;s status</div>

      {/* Status pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {statuses.map(s => {
          const active = s === currentStatus
          const colors = STATUS_COLORS[s]
          return (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              style={{
                padding: '6px 14px', borderRadius: 999,
                border: active ? 'none' : `1px solid ${LV.line}`,
                background: active ? colors.bg : 'transparent',
                color: active ? colors.color : LV.inkMid,
                fontSize: 12, fontWeight: active ? 700 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
                textTransform: 'capitalize',
              }}
            >{s}</button>
          )
        })}
      </div>

      {/* Timestamp + decline reason */}
      {timestamp && (
        <div style={{ marginTop: 8, fontSize: 12, color: LV.inkLo }}>
          {timestamp}
        </div>
      )}
      {currentStatus === 'declined' && (showDeclineInput || camp.finnStatus?.declined_reason) && (
        <div style={{ marginTop: 8 }}>
          <input
            type="text"
            value={declineReason}
            onChange={e => setDeclineReason(e.target.value)}
            onBlur={saveDeclineReason}
            onKeyDown={e => { if (e.key === 'Enter') saveDeclineReason() }}
            placeholder="Reason for declining (optional)"
            style={{
              width: '100%', padding: '6px 10px',
              border: `1px solid ${LV.line}`, borderRadius: 6,
              fontSize: 12, color: LV.inkMid, fontFamily: 'inherit',
            }}
          />
        </div>
      )}
    </div>
  )
}

// ─── Details (inline editable) ───────────────────────────────────────────────

function DetailsSection({ camp, onUpdate }: {
  camp: CampWithRelations
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<string | null>
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: LV.inkMute, marginBottom: 12,
      }}>Details</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <EditableRow label="Start date" value={camp.camp.start_date} field="start_date" type="date" campId={camp.camp.id} onUpdate={onUpdate} />
        <EditableRow label="End date" value={camp.camp.end_date} field="end_date" type="date" campId={camp.camp.id} onUpdate={onUpdate} />
        <EditableRow label="Location" value={camp.camp.location} field="location" type="text" campId={camp.camp.id} onUpdate={onUpdate} />
        <EditableRow label="Registration" value={camp.camp.registration_url} field="registration_url" type="url" campId={camp.camp.id} onUpdate={onUpdate} />
        <EditableRow label="Deadline" value={camp.camp.registration_deadline} field="registration_deadline" type="date" campId={camp.camp.id} onUpdate={onUpdate} />
        <EditableRow label="Cost" value={camp.camp.cost} field="cost" type="text" campId={camp.camp.id} onUpdate={onUpdate} />
        <EditableRow label="Notes" value={camp.camp.notes} field="notes" type="textarea" campId={camp.camp.id} onUpdate={onUpdate} />
      </div>
    </div>
  )
}

function EditableRow({ label, value, field, type, campId, onUpdate }: {
  label: string
  value: string | null
  field: string
  type: 'text' | 'date' | 'url' | 'textarea'
  campId: string
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<string | null>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  async function save() {
    const newVal = draft.trim() || null
    if (newVal !== value) {
      await onUpdate(campId, { [field]: newVal })
    }
    setEditing(false)
  }

  function cancel() {
    setDraft(value ?? '')
    setEditing(false)
  }

  const displayValue = type === 'date' && value
    ? fmtDate(value)
    : value

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '8px 0', borderBottom: `1px solid ${LV.line}`,
    }}>
      <span style={{
        width: 100, flexShrink: 0,
        fontSize: 12, fontWeight: 600, color: LV.inkLo,
      }}>{label}</span>

      {editing ? (
        <div style={{ flex: 1 }}>
          {type === 'textarea' ? (
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={e => { if (e.key === 'Escape') cancel() }}
              autoFocus
              rows={3}
              style={{
                width: '100%', padding: '6px 10px',
                border: `1px solid ${LV.tealDeep}`, borderRadius: 6,
                fontSize: 13, color: LV.ink, fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          ) : (
            <input
              type={type === 'url' ? 'text' : type}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
              autoFocus
              style={{
                width: '100%', padding: '6px 10px',
                border: `1px solid ${LV.tealDeep}`, borderRadius: 6,
                fontSize: 13, color: LV.ink, fontFamily: 'inherit',
              }}
            />
          )}
        </div>
      ) : (
        <div
          onClick={() => { setDraft(value ?? ''); setEditing(true) }}
          style={{
            flex: 1, fontSize: 13, color: value ? LV.ink : LV.inkMute,
            cursor: 'pointer', minHeight: 20,
          }}
        >
          {type === 'url' && value ? (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ color: LV.tealDeep, textDecoration: 'none', wordBreak: 'break-all' }}
            >{value}</a>
          ) : (
            displayValue || '—'
          )}
        </div>
      )}
    </div>
  )
}

// ─── School attendees ────────────────────────────────────────────────────────

function AttendeesSection({ camp, schools, onAdd, onRemove }: {
  camp: CampWithRelations
  schools: School[]
  onAdd: (campId: string, schoolId: string) => Promise<string | null>
  onRemove: (campId: string, schoolId: string) => Promise<string | null>
}) {
  const [showSearch, setShowSearch] = useState(false)
  const [search, setSearch] = useState('')

  const attendeeIds = new Set(camp.schoolAttendees.map(a => a.school_id))
  // Exclude host school and already-added schools from search
  const available = schools.filter(s =>
    s.id !== camp.camp.host_school_id &&
    !attendeeIds.has(s.id) &&
    s.status !== 'Inactive' &&
    s.category !== 'Nope' &&
    (search.length === 0 || (s.short_name || s.name).toLowerCase().includes(search.toLowerCase()))
  )

  async function handleAdd(schoolId: string) {
    await onAdd(camp.camp.id, schoolId)
    setSearch('')
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: LV.inkMute,
        }}>Target schools ({camp.schoolAttendees.length})</div>
        <button
          onClick={() => setShowSearch(prev => !prev)}
          style={{
            padding: '4px 12px', borderRadius: 999,
            border: `1px solid ${LV.line}`, background: '#fff',
            fontSize: 11, fontWeight: 700, color: LV.tealDeep,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >{showSearch ? 'Done' : '+ Add school'}</button>
      </div>

      {/* Search */}
      {showSearch && (
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search schools..."
            autoFocus
            style={{
              width: '100%', padding: '8px 12px',
              border: `1px solid ${LV.line}`, borderRadius: 8,
              fontSize: 13, fontFamily: 'inherit', color: LV.ink,
            }}
          />
          {search.length > 0 && (
            <div style={{
              maxHeight: 160, overflowY: 'auto',
              border: `1px solid ${LV.line}`, borderRadius: 8,
              marginTop: 4, background: '#fff',
            }}>
              {available.slice(0, 10).map(s => {
                const tier = TIER_STYLE[s.category] ?? TIER_STYLE.C
                return (
                  <button
                    key={s.id}
                    onClick={() => handleAdd(s.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '8px 12px',
                      background: 'none', border: 'none', textAlign: 'left',
                      cursor: 'pointer', fontFamily: 'inherit',
                      borderBottom: `1px solid ${LV.line}`,
                    }}
                  >
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
                      background: tier.bg, color: tier.color,
                    }}>{s.category}</span>
                    <span style={{ fontSize: 13, color: LV.ink }}>{s.short_name || s.name}</span>
                  </button>
                )
              })}
              {available.length === 0 && (
                <div style={{ padding: '8px 12px', fontSize: 12, color: LV.inkMute }}>
                  No matching schools
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* List */}
      {camp.schoolAttendees.length === 0 && !showSearch && (
        <div style={{ fontSize: 13, color: LV.inkMute }}>No target schools added yet.</div>
      )}
      {camp.schoolAttendees.length > 0 && (
        <div style={{
          background: '#fff', border: `1px solid ${LV.line}`,
          borderRadius: 10, overflow: 'hidden',
        }}>
          {camp.schoolAttendees.map((a, i) => {
            const tier = TIER_STYLE[a.school.category] ?? TIER_STYLE.C
            return (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px',
                borderTop: i > 0 ? `1px solid ${LV.line}` : 'none',
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                  background: tier.bg, color: tier.color,
                }}>{a.school.category}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: LV.ink }}>
                  {a.school.short_name || a.school.name}
                </span>
                <button
                  onClick={() => onRemove(camp.camp.id, a.school_id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 14, color: LV.inkMute, padding: '2px 6px',
                  }}
                >&times;</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Delete ──────────────────────────────────────────────────────────────────

function DeleteSection({ campId, onDelete, onDeleted }: {
  campId: string
  onDelete: (id: string) => Promise<string | null>
  onDeleted: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const error = await onDelete(campId)
    if (!error) {
      onDeleted()
    } else {
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <div style={{ paddingTop: 20, borderTop: `1px solid ${LV.line}` }}>
      {confirming ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              padding: '8px 16px', background: LV.red, color: '#fff',
              border: 'none', borderRadius: 999,
              fontSize: 12, fontWeight: 800, cursor: 'pointer',
              fontFamily: 'inherit', opacity: deleting ? 0.6 : 1,
            }}
          >{deleting ? 'Deleting...' : 'Yes, delete'}</button>
          <button
            onClick={() => setConfirming(false)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, color: LV.inkMid,
              fontFamily: 'inherit',
            }}
          >Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, color: LV.inkMute,
            fontFamily: 'inherit', padding: 0,
          }}
        >Delete this camp</button>
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const sMonth = s.toLocaleDateString('en-US', { month: 'short' })
  const sDay = s.getDate()
  const eMonth = e.toLocaleDateString('en-US', { month: 'short' })
  const eDay = e.getDate()

  if (start === end) return `${sMonth} ${sDay}`
  if (sMonth === eMonth) return `${sMonth} ${sDay}–${eDay}`
  return `${sMonth} ${sDay} – ${eMonth} ${eDay}`
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

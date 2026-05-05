'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CampProposal, CampProposalProposedData, School } from '@/lib/types'

const LV = {
  paper:    '#F6F1E8',
  ink:      '#0E0E0E',
  inkMid:   '#4A4A4A',
  inkLo:    '#7A7570',
  inkMute:  '#A8A39B',
  line:     '#E2DBC9',
  red:      '#C8102E',
  tealDeep: '#006A65',
  green:    '#16A34A',
}

const CONFIDENCE_STYLE: Record<string, { bg: string; color: string }> = {
  high:   { bg: '#D7F0ED', color: '#006A65' },
  medium: { bg: '#FEF3C7', color: '#92400E' },
  low:    { bg: '#FEE2E2', color: '#991B1B' },
}

const TIER_STYLE: Record<string, { bg: string; color: string }> = {
  A: { bg: '#FEE2E2', color: '#991B1B' },
  B: { bg: '#DBEAFE', color: '#1E40AF' },
  C: { bg: '#F3F4F6', color: '#374151' },
}

type ProposalRow = CampProposal & {
  schools: Pick<School, 'id' | 'name' | 'short_name' | 'category'> | null
}

interface Props {
  proposals: ProposalRow[]
  schools: Pick<School, 'id' | 'name' | 'short_name' | 'category'>[]
}

export default function CampProposalsClient({ proposals: initialProposals, schools }: Props) {
  const router = useRouter()
  const [proposals, setProposals] = useState(initialProposals)
  const [processing, setProcessing] = useState<Set<string>>(new Set())

  const schoolMap = new Map(schools.map(s => [s.id, s]))
  const pending = proposals.filter(p => p.status === 'pending')

  // Group by host school
  const grouped = new Map<string, ProposalRow[]>()
  for (const p of pending) {
    const key = p.host_school_id ?? 'unknown'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(p)
  }

  async function handleAction(id: string, action: 'apply' | 'reject', editedData?: CampProposalProposedData) {
    setProcessing(prev => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/camp-proposals/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          mark_finn_interested: true,
          edited_data: editedData,
        }),
      })
      if (res.ok) {
        setProposals(prev => prev.map(p =>
          p.id === id ? { ...p, status: action === 'apply' ? 'applied' as const : 'rejected' as const } : p
        ))
      }
    } catch (err) {
      console.error('Action failed:', err)
    } finally {
      setProcessing(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  return (
    <div style={{
      maxWidth: 800, margin: '0 auto',
      padding: '32px clamp(20px, 4vw, 40px)',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 750, color: LV.ink, letterSpacing: -0.5, margin: 0 }}>
          Camp Proposals
        </h1>
        <p style={{ fontSize: 13, color: LV.inkLo, marginTop: 4 }}>
          Review camp proposals from email extraction and web discovery.
        </p>
        {pending.length > 0 && (
          <p style={{ fontSize: 13, color: LV.ink, marginTop: 6, fontWeight: 500 }}>
            {pending.length} proposal{pending.length !== 1 ? 's' : ''} pending review
          </p>
        )}
      </div>

      {/* Empty state */}
      {pending.length === 0 && (
        <div style={{
          background: '#fff', border: `1px solid ${LV.line}`,
          borderRadius: 10, padding: '48px 24px',
          textAlign: 'center', color: LV.inkLo, fontSize: 14,
        }}>
          No pending camp proposals.
        </div>
      )}

      {/* Grouped proposals */}
      {Array.from(grouped.entries()).map(([schoolId, group]) => {
        const school = schoolMap.get(schoolId) ?? group[0]?.schools
        const schoolName = school?.short_name || school?.name || 'Unknown School'
        const tier = TIER_STYLE[school?.category ?? 'C'] ?? TIER_STYLE.C

        return (
          <div key={schoolId} style={{ marginBottom: 28 }}>
            {/* School header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginBottom: 10,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                background: tier.bg, color: tier.color,
              }}>{school?.category}</span>
              <span style={{
                fontSize: 11, fontWeight: 700, color: LV.inkLo,
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>{schoolName}</span>
            </div>

            {/* Cards */}
            {group.map(p => (
              <ProposalCard
                key={p.id}
                proposal={p}
                schools={schools}
                schoolMap={schoolMap}
                isProcessing={processing.has(p.id)}
                onApply={(edited) => handleAction(p.id, 'apply', edited)}
                onReject={() => handleAction(p.id, 'reject')}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ─── Proposal card ───────────────────────────────────────────────────────────

function ProposalCard({ proposal, schools, schoolMap, isProcessing, onApply, onReject }: {
  proposal: ProposalRow
  schools: Pick<School, 'id' | 'name' | 'short_name' | 'category'>[]
  schoolMap: Map<string, Pick<School, 'id' | 'name' | 'short_name' | 'category'>>
  isProcessing: boolean
  onApply: (editedData?: CampProposalProposedData) => void
  onReject: () => void
}) {
  const [showReasoning, setShowReasoning] = useState(false)
  const [editedData, setEditedData] = useState<CampProposalProposedData>(proposal.proposed_data)
  const confStyle = CONFIDENCE_STYLE[proposal.confidence] ?? CONFIDENCE_STYLE.medium

  // Source display
  const sourceLabel = proposal.source === 'email_extract_backfill'
    ? 'Email backfill'
    : proposal.source === 'email_extract'
      ? 'Email extract'
      : 'Web search'

  function updateField(field: keyof CampProposalProposedData, value: string | null) {
    setEditedData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div style={{
      background: '#fff', border: `1px solid ${LV.line}`,
      borderRadius: 10, padding: '16px 20px', marginBottom: 10,
      opacity: isProcessing ? 0.5 : 1,
    }}>
      {/* Top row: source + confidence + matched indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: LV.inkMute,
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>{sourceLabel}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
          background: confStyle.bg, color: confStyle.color,
          textTransform: 'capitalize',
        }}>{proposal.confidence}</span>
        {proposal.matched_camp_id && (
          <span style={{ fontSize: 11, fontWeight: 600, color: LV.tealDeep }}>
            Updates existing camp
          </span>
        )}
      </div>

      {/* Editable fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <EditField label="Name" value={editedData.name} onChange={v => updateField('name', v)} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <EditField label="Start date" value={editedData.start_date} type="date" onChange={v => updateField('start_date', v)} />
          <EditField label="End date" value={editedData.end_date} type="date" onChange={v => updateField('end_date', v)} />
        </div>
        <EditField label="Location" value={editedData.location} onChange={v => updateField('location', v)} />
        <EditField label="Registration URL" value={editedData.registration_url} onChange={v => updateField('registration_url', v)} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <EditField label="Deadline" value={editedData.registration_deadline} type="date" onChange={v => updateField('registration_deadline', v)} />
          <EditField label="Cost" value={editedData.cost} onChange={v => updateField('cost', v)} />
        </div>
      </div>

      {/* Attendee schools */}
      {editedData.attendee_school_ids.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: LV.inkLo, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Attendee schools
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {editedData.attendee_school_ids.map(sid => {
              const s = schoolMap.get(sid)
              return (
                <span key={sid} style={{
                  fontSize: 11, fontWeight: 600, color: LV.inkMid,
                  padding: '2px 8px', borderRadius: 999,
                  background: LV.paper, border: `1px solid ${LV.line}`,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  {s?.short_name || s?.name || sid}
                  <button
                    onClick={() => setEditedData(prev => ({
                      ...prev,
                      attendee_school_ids: prev.attendee_school_ids.filter(id => id !== sid),
                    }))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: LV.inkMute, padding: 0 }}
                  >&times;</button>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Reasoning accordion */}
      {proposal.notes && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => setShowReasoning(prev => !prev)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 600, color: LV.inkMute,
              fontFamily: 'inherit', padding: 0,
            }}
          >{showReasoning ? 'Hide reasoning ▲' : 'Why? ▼'}</button>
          {showReasoning && (
            <div style={{
              marginTop: 6, fontSize: 12, color: LV.inkMid, lineHeight: 1.5,
              padding: '8px 10px', background: LV.paper, borderRadius: 6,
            }}>{proposal.notes}</div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={() => onApply(editedData)}
          disabled={isProcessing}
          style={{
            padding: '7px 16px', background: LV.tealDeep, color: '#fff',
            border: 'none', borderRadius: 999,
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >Apply</button>
        <button
          onClick={onReject}
          disabled={isProcessing}
          style={{
            padding: '7px 16px', background: 'none',
            border: `1px solid ${LV.line}`, borderRadius: 999,
            fontSize: 12, fontWeight: 600, color: LV.inkMid,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >Reject</button>
      </div>
    </div>
  )
}

// ─── Inline edit field ───────────────────────────────────────────────────────

function EditField({ label, value, type = 'text', onChange }: {
  label: string
  value: string | null
  type?: 'text' | 'date'
  onChange: (value: string | null) => void
}) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: LV.inkLo, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        style={{
          width: '100%', padding: '5px 8px',
          border: `1px solid ${LV.line}`, borderRadius: 6,
          fontSize: 12, color: LV.ink, fontFamily: 'inherit',
          background: '#fff',
        }}
      />
    </div>
  )
}

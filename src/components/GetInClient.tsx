'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useSchools } from '@/hooks/useRealtimeData'
import type {
  SchoolOffer, OfferType, OfferStatus,
  School, SchoolMilestone,
} from '@/lib/types'
import {
  OFFER_TYPE_LABELS, OFFER_STATUS_STYLE,
  STAGE_META, MILESTONE_META,
} from '@/lib/types'

const SD = {
  paper:    '#F6F1E8',
  ink:      '#0E0E0E',
  inkMid:   '#4A4A4A',
  inkLo:    '#7A7570',
  inkMute:  '#A8A39B',
  line:     '#E2DBC9',
  tealDeep: '#006A65',
  // March charcoal palette
  charcoal:    '#2E2B28',
  charcoalMid: '#3D3A36',
  charcoalLo:  '#4D4A46',
  cream:       '#F6F1E8',
  creamMid:    '#D8D2C6',
  creamLo:     '#A8A39B',
  rust:        '#B5502F',
}

// ─── useOffers hook ──────────────────────────────────────────────────────────

function useOffers() {
  const [offers, setOffers] = useState<(SchoolOffer & { school: { id: string; name: string; short_name: string | null; category: string } })[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchOffers = useCallback(async () => {
    const { data, error } = await supabase
      .from('school_offers')
      .select('*, school:schools(id, name, short_name, category)')
      .order('received_on', { ascending: false })
    if (!error && data) setOffers(data as typeof offers)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchOffers()
    const channel = supabase
      .channel(`school-offers-changes-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_offers' }, fetchOffers)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchOffers, supabase])

  const insertOffer = useCallback(async (offer: Omit<SchoolOffer, 'id' | 'created_at' | 'updated_at' | 'school'>) => {
    const { error } = await supabase.from('school_offers').insert(offer)
    if (!error) fetchOffers()
    return error
  }, [supabase, fetchOffers])

  const updateOffer = useCallback(async (id: string, updates: Partial<SchoolOffer>) => {
    const { error } = await supabase.from('school_offers').update(updates).eq('id', id)
    if (!error) fetchOffers()
    return error
  }, [supabase, fetchOffers])

  const deleteOffer = useCallback(async (id: string) => {
    const { error } = await supabase.from('school_offers').delete().eq('id', id)
    if (!error) fetchOffers()
    return error
  }, [supabase, fetchOffers])

  return { offers, loading, insertOffer, updateOffer, deleteOffer }
}

// ─── Near-date detection for offer key_dates (A2: passed-date aware) ─────────
// If the mentioned date has PASSED, rewrites "opens" → "open since".
// Never says "opens" for a date that already happened.

function hasNearDate(keyDates: string | null): string | null {
  if (!keyDates) return null
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const today = new Date()
  const currentMonth = today.getMonth()
  const nearMonths = [months[currentMonth], months[(currentMonth + 1) % 12]]
  const lower = keyDates.toLowerCase()
  for (const m of nearMonths) {
    if (lower.includes(m)) {
      const idx = lower.indexOf(m)
      const start = Math.max(0, keyDates.lastIndexOf(';', idx) + 1)
      const end = keyDates.indexOf(';', idx)
      let fragment = keyDates.slice(start, end > 0 ? end : undefined).trim()

      // A2: Detect if the mentioned date has passed
      const dateMatch = fragment.match(/(\w{3,9})\s+(\d{1,2})/i)
      if (dateMatch) {
        const monthIdx = months.indexOf(dateMatch[1].toLowerCase().slice(0, 3))
        if (monthIdx >= 0) {
          const day = parseInt(dateMatch[2])
          const mentionedDate = new Date(today.getFullYear(), monthIdx, day)
          if (mentionedDate < today) {
            fragment = fragment
              .replace(/\bopens\b/gi, 'open since')
              .replace(/\bcloses\b/gi, 'closed')
          }
        }
      }

      return fragment
    }
  }
  return null
}

// ─── Get In status line logic ────────────────────────────────────────────────
// Nearest actionable key date across open offers, or offer count.

function getInStatusLine(offers: SchoolOffer[]): string {
  const openOffers = offers.filter(o => o.status === 'open')
  if (openOffers.length === 0) return 'No offers yet.'

  // Look for near key dates
  for (const o of openOffers) {
    const nearDate = hasNearDate(o.key_dates)
    if (nearDate) {
      const schoolName = o.school?.short_name || o.school?.name
      return schoolName ? `${schoolName}: ${nearDate}` : nearDate
    }
  }

  return `${openOffers.length} offer${openOffers.length !== 1 ? 's' : ''} on the table.`
}

// ─── Offer Card (charcoal March style) ──────────────────────────────────────

function OfferCard({
  offer,
  onEdit,
}: {
  offer: SchoolOffer & { school: { id: string; name: string; short_name: string | null; category: string } }
  onEdit: () => void
}) {
  const schoolName = offer.school?.short_name || offer.school?.name || 'Unknown'
  const nearDate = hasNearDate(offer.key_dates)

  // Charcoal status pill styling
  const STATUS_CHARCOAL: Record<OfferStatus, { bg: string; color: string; label: string }> = {
    open:     { bg: 'rgba(220, 252, 231, 0.15)', color: '#86EFAC', label: 'Open' },
    accepted: { bg: 'rgba(219, 234, 254, 0.15)', color: '#93C5FD', label: 'Accepted' },
    declined: { bg: 'rgba(254, 226, 226, 0.15)', color: '#FCA5A5', label: 'Declined' },
    expired:  { bg: 'rgba(243, 244, 246, 0.1)',  color: '#9CA3AF', label: 'Expired' },
  }
  const statusPill = STATUS_CHARCOAL[offer.status]

  return (
    <div style={{
      background: SD.charcoal,
      borderRadius: 14,
      padding: 'clamp(20px, 3vw, 28px)',
      cursor: 'pointer',
      position: 'relative',
      overflow: 'hidden',
    }} onClick={onEdit}>
      {/* Ghost $ */}
      <div style={{
        position: 'absolute', top: -10, right: 8,
        fontSize: 100, fontWeight: 800, fontStyle: 'italic',
        color: '#fff', opacity: 0.04, lineHeight: 1,
        pointerEvents: 'none', userSelect: 'none',
      }}>$</div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Row 1: School + Status pill */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <Link
            href={`/schools/${offer.school_id}`}
            onClick={e => e.stopPropagation()}
            style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: SD.creamLo,
              textDecoration: 'none',
            }}
          >
            {schoolName}
          </Link>
          <span style={{
            padding: '3px 10px', borderRadius: 999,
            background: statusPill.bg, color: statusPill.color,
            fontSize: 10, fontWeight: 700, flexShrink: 0,
            letterSpacing: '0.03em', textTransform: 'uppercase',
          }}>
            {statusPill.label}
          </span>
        </div>

        {/* Row 2: Offer type label — prominent */}
        <div style={{
          fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: SD.creamMid,
          marginBottom: 6,
        }}>
          {OFFER_TYPE_LABELS[offer.offer_type]}
        </div>

        {/* Row 3: Headline */}
        <h3 style={{
          margin: '0 0 14px', fontSize: 17, fontWeight: 700,
          letterSpacing: '-0.02em', color: SD.cream,
          fontStyle: 'italic', lineHeight: 1.3,
        }}>
          {offer.headline}
        </h3>

        {/* Consistent field layout — always in the same order */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <FieldRow label="Money" value={offer.money_note} />
          <FieldRow label="Conditions" value={offer.conditions} />
          <FieldRow label="Key dates" value={offer.key_dates} />
        </div>

        {/* Near-date awareness */}
        {nearDate && (
          <div style={{
            marginTop: 12, padding: '6px 10px',
            background: 'rgba(181, 80, 47, 0.15)',
            borderRadius: 6, fontSize: 12, fontWeight: 600,
            color: '#E89070', letterSpacing: '-0.01em',
          }}>
            ↗ {nearDate}
          </div>
        )}

        {/* Footer */}
        {offer.received_on && (
          <div style={{ marginTop: 10, fontSize: 11, color: SD.charcoalLo }}>
            Received {offer.received_on}
          </div>
        )}
      </div>
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{
      display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.5,
      minHeight: 20,
    }}>
      <span style={{
        width: 80, flexShrink: 0,
        fontWeight: 600, color: SD.creamMid,
        fontSize: 11, textTransform: 'uppercase',
        letterSpacing: '0.04em', paddingTop: 1,
      }}>
        {label}
      </span>
      <span style={{ color: value ? SD.cream : SD.charcoalLo, fontStyle: value ? 'normal' : 'italic' }}>
        {value || '—'}
      </span>
    </div>
  )
}

// ─── Offer Modal ─────────────────────────────────────────────────────────────

const OFFER_TYPES: OfferType[] = ['conditional_admission', 'admission', 'roster_spot', 'preread_positive', 'other']
const OFFER_STATUSES: OfferStatus[] = ['open', 'accepted', 'declined', 'expired']

function OfferModal({
  offer,
  schools,
  onSave,
  onDelete,
  onClose,
}: {
  offer: SchoolOffer | null  // null = add mode
  schools: School[]
  onSave: (data: Omit<SchoolOffer, 'id' | 'created_at' | 'updated_at' | 'school'>) => Promise<unknown>
  onDelete?: () => Promise<unknown>
  onClose: () => void
}) {
  const isEdit = offer !== null

  const [schoolId, setSchoolId] = useState(offer?.school_id ?? '')
  const [offerType, setOfferType] = useState<OfferType>(offer?.offer_type ?? 'conditional_admission')
  const [headline, setHeadline] = useState(offer?.headline ?? '')
  const [moneyNote, setMoneyNote] = useState(offer?.money_note ?? '')
  const [conditions, setConditions] = useState(offer?.conditions ?? '')
  const [keyDates, setKeyDates] = useState(offer?.key_dates ?? '')
  const [status, setStatus] = useState<OfferStatus>(offer?.status ?? 'open')
  const [receivedOn, setReceivedOn] = useState(offer?.received_on ?? '')
  const [note, setNote] = useState(offer?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteText, setDeleteText] = useState('')

  const activeSchools = schools.filter(s => s.category !== 'Nope' && s.status !== 'Inactive')

  const handleSave = async () => {
    if (!schoolId || !headline.trim()) return
    setSaving(true)
    await onSave({
      school_id: schoolId,
      offer_type: offerType,
      headline: headline.trim(),
      money_note: moneyNote.trim() || null,
      conditions: conditions.trim() || null,
      key_dates: keyDates.trim() || null,
      status,
      received_on: receivedOn || null,
      note: note.trim() || null,
    })
    setSaving(false)
    onClose()
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: SD.ink, marginBottom: 5 }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13, border: `1px solid ${SD.line}`,
    borderRadius: 6, fontFamily: 'inherit', background: '#fff', color: SD.ink,
    boxSizing: 'border-box',
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1050 }} />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1051,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}>
        <div style={{
          background: SD.paper, borderRadius: 16, width: '100%', maxWidth: 520,
          maxHeight: '90vh', overflowY: 'auto', padding: 'clamp(20px, 3vw, 28px)',
          border: `1px solid ${SD.line}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{
              margin: 0, fontSize: 20, fontWeight: 700,
              letterSpacing: '-0.03em', color: SD.ink, fontStyle: 'italic',
            }}>
              {isEdit ? 'Edit Offer.' : 'Add Offer.'}
            </h2>
            <button onClick={onClose} style={{
              all: 'unset', cursor: 'pointer', fontSize: 18, color: SD.inkLo, padding: 4,
            }}>✕</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* School */}
            <div>
              <label style={labelStyle}>School</label>
              <select value={schoolId} onChange={e => setSchoolId(e.target.value)} style={inputStyle}>
                <option value="">Select school...</option>
                {activeSchools.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div>
              <label style={labelStyle}>Offer type</label>
              <select value={offerType} onChange={e => setOfferType(e.target.value as OfferType)} style={inputStyle}>
                {OFFER_TYPES.map(t => (
                  <option key={t} value={t}>{OFFER_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            {/* Headline */}
            <div>
              <label style={labelStyle}>Headline</label>
              <input value={headline} onChange={e => setHeadline(e.target.value)} style={inputStyle}
                placeholder="e.g. Conditional admission — Aerospace Engineering" />
            </div>

            {/* Money */}
            <div>
              <label style={labelStyle}>Money note</label>
              <textarea value={moneyNote} onChange={e => setMoneyNote(e.target.value)}
                style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                placeholder="e.g. $25,000/yr Heald Scholarship, renewable annually" />
            </div>

            {/* Conditions */}
            <div>
              <label style={labelStyle}>Conditions</label>
              <textarea value={conditions} onChange={e => setConditions(e.target.value)}
                style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                placeholder="e.g. Official transcript required to finalize" />
            </div>

            {/* Key dates */}
            <div>
              <label style={labelStyle}>Key dates</label>
              <textarea value={keyDates} onChange={e => setKeyDates(e.target.value)}
                style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                placeholder="e.g. FAFSA opens Oct 1 (code 001691); official aid letter January" />
            </div>

            <div style={{ display: 'flex', gap: 14 }}>
              {/* Status */}
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value as OfferStatus)} style={inputStyle}>
                  {OFFER_STATUSES.map(s => (
                    <option key={s} value={s}>{OFFER_STATUS_STYLE[s].label}</option>
                  ))}
                </select>
              </div>

              {/* Received date */}
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Received on</label>
                <input type="date" value={receivedOn} onChange={e => setReceivedOn(e.target.value)} style={inputStyle} />
              </div>
            </div>

            {/* Note */}
            <div>
              <label style={labelStyle}>Notes</label>
              <textarea value={note} onChange={e => setNote(e.target.value)}
                style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
            <div>
              {isEdit && onDelete && !confirmDelete && (
                <button onClick={() => setConfirmDelete(true)} style={{
                  all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  color: '#991B1B', padding: '6px 12px',
                }}>
                  Delete
                </button>
              )}
              {confirmDelete && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    value={deleteText} onChange={e => setDeleteText(e.target.value)}
                    placeholder="Type DELETE"
                    style={{ ...inputStyle, width: 120, fontSize: 12, padding: '5px 8px' }}
                  />
                  <button
                    disabled={deleteText !== 'DELETE'}
                    onClick={async () => {
                      if (onDelete) { await onDelete(); onClose() }
                    }}
                    style={{
                      all: 'unset', cursor: deleteText === 'DELETE' ? 'pointer' : 'default',
                      fontSize: 12, fontWeight: 700, color: '#fff',
                      background: deleteText === 'DELETE' ? '#991B1B' : SD.inkMute,
                      padding: '5px 12px', borderRadius: 5,
                    }}
                  >
                    Confirm
                  </button>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{
                all: 'unset', cursor: 'pointer', padding: '8px 16px',
                fontSize: 13, fontWeight: 600, color: SD.inkLo,
                border: `1px solid ${SD.line}`, borderRadius: 6,
              }}>Cancel</button>
              <button
                disabled={!schoolId || !headline.trim() || saving}
                onClick={handleSave}
                style={{
                  all: 'unset', cursor: !schoolId || !headline.trim() || saving ? 'default' : 'pointer',
                  padding: '8px 16px',
                  fontSize: 13, fontWeight: 700, color: '#fff',
                  background: !schoolId || !headline.trim() || saving ? SD.inkMute : SD.ink,
                  borderRadius: 6,
                }}
              >
                {saving ? 'Saving...' : isEdit ? 'Save' : 'Add Offer'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

type MilestoneType = SchoolMilestone['milestone']

export default function GetInClient() {
  const { offers, loading: offersLoading, insertOffer, updateOffer, deleteOffer } = useOffers()
  const { schools, loading: schoolsLoading } = useSchools()
  const supabase = useMemo(() => createClient(), [])

  // Milestones for endgame schools
  const [milestones, setMilestones] = useState<SchoolMilestone[]>([])

  useEffect(() => {
    supabase.from('school_milestones').select('*').then(({ data }) => {
      if (data) setMilestones(data as SchoolMilestone[])
    })
  }, [supabase])

  const milestonesMap = useMemo(() => {
    const map = new Map<string, SchoolMilestone[]>()
    for (const m of milestones) {
      if (!map.has(m.school_id)) map.set(m.school_id, [])
      map.get(m.school_id)!.push(m)
    }
    return map
  }, [milestones])

  // Endgame schools: recruiting_stage >= 5
  const endgameSchools = useMemo(
    () => schools.filter(s => s.recruiting_stage >= 5 && s.category !== 'Nope' && s.status !== 'Inactive'),
    [schools]
  )

  const [modalOffer, setModalOffer] = useState<SchoolOffer | null | 'add'>(null)

  const loading = offersLoading || schoolsLoading

  if (loading) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: SD.inkLo, fontSize: 14,
      }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: SD.paper,
      fontFamily: "'Inter', -apple-system, sans-serif",
      paddingBottom: 80,
    }}>
      {/* Masthead */}
      <div style={{
        padding: '24px clamp(28px, 4vw, 56px) 4px',
      }}>
        <h1 style={{
          margin: 0,
          fontSize: 'clamp(56px, 7vw, 88px)',
          fontWeight: 700, letterSpacing: '-0.04em',
          color: SD.charcoal, lineHeight: 0.95,
          fontStyle: 'italic',
        }}>Get In.</h1>
        <p style={{
          margin: '12px 0 0', fontSize: 15, color: SD.inkLo,
          fontWeight: 450, letterSpacing: '-0.01em',
        }}>
          Your offers, your admissions, your decision.
        </p>
        {/* Status line */}
        <div style={{ margin: '14px 0 0' }}>
          <span style={{
            fontSize: 15, fontWeight: offers.length > 0 ? 650 : 450,
            color: offers.length > 0 ? SD.charcoal : SD.inkMute,
            letterSpacing: '-0.01em',
          }}>
            {getInStatusLine(offers)}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{
        padding: '24px clamp(28px, 4vw, 56px)',
        maxWidth: 900,
        display: 'flex', flexDirection: 'column', gap: 24,
      }}>
        {/* Offers section */}
        <section>
          <div style={{
            fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '0.1em', color: SD.charcoalLo, marginBottom: 4,
          }}>Offers</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{
              margin: 0, fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 700,
              letterSpacing: '-0.04em', color: SD.charcoal, fontStyle: 'italic',
            }}>On the table.</h2>
            <button
              onClick={() => setModalOffer('add')}
              style={{
                all: 'unset', cursor: 'pointer',
                padding: '7px 14px', fontSize: 12, fontWeight: 700,
                color: '#fff', background: SD.charcoal, borderRadius: 999,
              }}
            >
              + Add Offer
            </button>
          </div>

          {offers.length === 0 ? (
            <div style={{
              background: SD.charcoal, borderRadius: 14,
              padding: 'clamp(28px, 4vw, 40px)',
              textAlign: 'center',
            }}>
              <p style={{
                margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: SD.cream,
                fontStyle: 'italic',
              }}>
                Offers and admissions land here.
              </p>
              <p style={{
                margin: 0, fontSize: 13, color: SD.creamLo, lineHeight: 1.6, maxWidth: 380,
                marginLeft: 'auto', marginRight: 'auto',
              }}>
                When a school says yes, you&apos;ll track the terms, conditions, and deadlines in one place.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {offers.map(offer => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  onEdit={() => setModalOffer(offer)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Endgame schools */}
        {endgameSchools.length > 0 && (
          <section>
            <div style={{
              fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.1em', color: SD.charcoalLo, marginBottom: 4,
            }}>Endgame</div>
            <h2 style={{
              margin: '0 0 14px', fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 700,
              letterSpacing: '-0.04em', color: SD.charcoal, fontStyle: 'italic',
            }}>Advanced schools.</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {endgameSchools.map(school => {
                const schoolMilestones = milestonesMap.get(school.id) ?? []
                return (
                  <Link
                    key={school.id}
                    href={`/schools/${school.id}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <div style={{
                      background: '#fff', border: `1px solid ${SD.line}`, borderRadius: 10,
                      padding: '14px 18px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12,
                    }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 650, color: SD.ink }}>
                          {school.short_name || school.name}
                        </div>
                        <div style={{ fontSize: 11, color: SD.inkLo, marginTop: 2 }}>
                          Stage {school.recruiting_stage}: {STAGE_META[school.recruiting_stage].label}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {schoolMilestones.map(m => {
                          const meta = MILESTONE_META[m.milestone as MilestoneType]
                          if (!meta) return null
                          return (
                            <span key={m.id} style={{
                              padding: '2px 8px', borderRadius: 4,
                              background: meta.bg, color: meta.color,
                              fontSize: 10, fontWeight: 600,
                            }}>
                              {meta.icon} {meta.label}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}
      </div>

      {/* Offer Modal */}
      {modalOffer !== null && (
        <OfferModal
          offer={modalOffer === 'add' ? null : modalOffer}
          schools={schools}
          onSave={async (data) => {
            if (modalOffer === 'add') {
              return insertOffer(data)
            } else {
              return updateOffer((modalOffer as SchoolOffer).id, data)
            }
          }}
          onDelete={modalOffer !== 'add' ? async () => deleteOffer((modalOffer as SchoolOffer).id) : undefined}
          onClose={() => setModalOffer(null)}
        />
      )}
    </div>
  )
}

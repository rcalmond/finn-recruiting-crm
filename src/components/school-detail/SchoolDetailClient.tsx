'use client'

import { useState, useEffect, useMemo, useRef, useCallback, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { School, ContactLogEntry, ActionItem, Coach, ContactChannel, ContactDirection, Category, AdmitLikelihood, CampFinnStatusValue, CampWithRelations, SchoolMilestone, MilestoneType, RecruitingStage, SchoolOffer, OfferStatus } from '@/lib/types'
import { STAGE_META, MILESTONE_META, OFFER_TYPE_LABELS } from '@/lib/types'
import { useSchools, useContactLog, useActionItems, useCoaches, useCamps, useCallPrepDocs, useStatusUpdates, useMilestones } from '@/hooks/useRealtimeData'
import { stageLabel, STAGE_LABELS } from '@/lib/stages'
import { rqMarkCompletedPatch, rqMarkUpdatedPatch, rqSetLinkPatch } from '@/lib/rq'
import { getCampsForSchool } from '@/lib/camps'
import { classifySchoolRecency, SCHOOL_RECENCY_STYLE } from '@/lib/school-recency-state'
import { todayStr } from '@/lib/utils'
import DraftModal from '@/components/DraftModal'
import PrepForCallModal from '@/components/PrepForCallModal'
import AddCampModal from '@/components/AddCampModal'
import SchoolModal from '@/components/SchoolModal'
import EditableActionRow from '@/components/EditableActionRow'
import ConversationSummaryCard from '@/components/school-detail/ConversationSummaryCard'
import CallPrepSection from '@/components/school-detail/CallPrepSection'
import StatusUpdatesPanel from '@/components/school-detail/StatusUpdatesPanel'
import NotePopover from '@/components/school-detail/NotePopover'

// ─── Design tokens ────────────────────────────────────────────────────────────

// Brand chrome (Throughball, Brand Sweep Pass 4A). pitch is the shared accent
// (links, primary actions, section-header periods). DATA colors are left intact:
// teal = the ACTIVE recency chip + Email channel + inbound-message styling;
// red = the overdue-status indicator; gold = the In-Person channel. The offer
// cards and the summary card's category badge keep their taxonomy too.
const SD = {
  paper:     '#F6F1E8',
  paperDeep: '#EFE8D8',
  ink:       '#1A1A1A',
  inkSoft:   '#1F1F1F',
  inkMid:    '#4A4A4A',
  inkLo:     '#6B655A',
  inkMute:   '#8A8478',
  line:      '#E2DBC9',
  line2:     '#D3CAB3',
  pitch:     '#1F6B48',
  cream:     '#FBF6EC',
  red:       '#C8102E',
  redDeep:   '#9A0B23',
  redInk:    '#FFE4E8',
  redSoft:   '#FCE4E8',
  teal:      '#00B2A9',
  tealDeep:  '#006A65',
  tealSoft:  '#D7F0ED',
  gold:      '#F6EB61',
  goldDeep:  '#C8B22E',
  goldSoft:  '#FBF3C4',
  goldInk:   '#5A4E0F',
}

const TIER_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 }

// ─── Primitives ───────────────────────────────────────────────────────────────

// Matches the TierBadge in SchoolsClient exactly — same palette, size, and font.
function TierBadge({ tier }: { tier: string }) {
  const palette =
    tier === 'A' ? { bg: SD.ink,        fg: '#fff',   border: undefined } :
    tier === 'B' ? { bg: 'transparent', fg: SD.ink,   border: SD.ink    } :
                   { bg: 'transparent', fg: SD.inkLo, border: SD.line2  }
  return (
    <div style={{
      width: 22, height: 22, borderRadius: '50%',
      background: palette.bg, color: palette.fg,
      border: palette.border ? `1.3px solid ${palette.border}` : 'none',
      fontSize: 10, fontWeight: 800, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{tier}</div>
  )
}

function StageDots({ stage, size = 9 }: { stage: number; size?: number }) {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      {STAGE_LABELS.map((_, i) => (
        <div key={i} style={{
          width: size, height: size, borderRadius: '50%',
          background: i < stage ? SD.ink : 'transparent',
          border: i < stage ? 'none' : `1.3px solid ${SD.inkMute}`,
          boxShadow: i === stage - 1 ? `0 0 0 2px ${SD.paper}, 0 0 0 3px ${SD.ink}` : 'none',
        }} />
      ))}
    </div>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

function DetailHeader({
  school, stage, prevSchool, nextSchool, contactLog, onTierChange,
  onStageChange, milestones, onUpsertMilestone, onRemoveMilestone, onEdit,
}: {
  school: School; stage: number
  prevSchool: School | null; nextSchool: School | null
  contactLog: ContactLogEntry[]
  onTierChange?: (tier: string) => void
  onStageChange: (stage: RecruitingStage) => void
  milestones: SchoolMilestone[]
  onUpsertMilestone: (ms: { school_id: string; milestone: MilestoneType; occurred_on?: string | null; note?: string | null }) => Promise<unknown>
  onRemoveMilestone: (id: string) => Promise<unknown>
  onEdit: () => void
}) {
  const router = useRouter()
  const [stageOpen, setStageOpen] = useState(false)
  const [msOpen, setMsOpen] = useState(false)
  const [msDate, setMsDate] = useState('')
  const [msNote, setMsNote] = useState('')
  const stageRef = useRef<HTMLDivElement>(null)
  const msRef = useRef<HTMLDivElement>(null)
  const metaParts = [school.division, school.conference, school.location].filter(Boolean).join(' · ')
  const recency = classifySchoolRecency(school, contactLog)
  const recencyStyle = recency.state ? SCHOOL_RECENCY_STYLE[recency.state] : null
  const earnedTypes = new Set(milestones.map(m => m.milestone))

  // Standard popover dismissal for the stage + milestone popovers: click-outside
  // and Esc both close (no selection = no change). The X affordances live in the
  // popovers themselves.
  useEffect(() => {
    if (!stageOpen && !msOpen) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (stageOpen && stageRef.current && !stageRef.current.contains(t)) setStageOpen(false)
      if (msOpen && msRef.current && !msRef.current.contains(t)) setMsOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setStageOpen(false); setMsOpen(false) }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [stageOpen, msOpen])

  return (
    <div style={{
      padding: 'clamp(14px, 3vw, 28px) clamp(16px, 4vw, 40px) clamp(12px, 2vw, 20px)',
      borderBottom: `1px solid ${SD.line}`,
      background: SD.paper,
    }}>
      {/* Top nav row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
      }}>
        <Link href="/schools" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: SD.inkLo, fontSize: 12, fontWeight: 600,
          textDecoration: 'none', letterSpacing: -0.1,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Schools
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Sibling nav — desktop only */}
          <div className="hidden md:flex" style={{ alignItems: 'center', gap: 6 }}>
            {onTierChange ? (
              <select
                value={school.category}
                onChange={e => onTierChange(e.target.value)}
                title="Change tier"
                style={{
                  fontSize: 11, fontWeight: 600, color: SD.inkLo,
                  background: 'transparent', border: `1px solid ${SD.line}`,
                  borderRadius: 4, padding: '2px 6px', cursor: 'pointer',
                  outline: 'none', appearance: 'none',
                }}
              >
                <option value="A">Tier A</option>
                <option value="B">Tier B</option>
                <option value="C">Tier C</option>
                <option value="Nope">Nope</option>
              </select>
            ) : (
              <span style={{ fontSize: 11, color: SD.inkLo, fontWeight: 600 }}>
                Tier {school.category}
              </span>
            )}
            <button
              onClick={() => prevSchool && router.push(`/schools/${prevSchool.id}`)}
              disabled={!prevSchool}
              aria-label="Previous school"
              style={{
                width: 26, height: 26, borderRadius: 6,
                background: 'transparent',
                border: `1px solid ${prevSchool ? SD.line2 : SD.line}`,
                cursor: prevSchool ? 'pointer' : 'not-allowed',
                color: prevSchool ? SD.inkMid : SD.inkMute,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
              }}
            >‹</button>
            <button
              onClick={() => nextSchool && router.push(`/schools/${nextSchool.id}`)}
              disabled={!nextSchool}
              aria-label="Next school"
              style={{
                width: 26, height: 26, borderRadius: 6,
                background: 'transparent',
                border: `1px solid ${nextSchool ? SD.line2 : SD.line}`,
                cursor: nextSchool ? 'pointer' : 'not-allowed',
                color: nextSchool ? SD.inkMid : SD.inkMute,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
              }}
            >›</button>
          </div>
          {/* "..." menu — opens the school editor modal in place */}
          <button
            onClick={onEdit}
            title="Edit school"
            style={{
              width: 26, height: 26, borderRadius: 6, background: 'transparent',
              border: `1px solid ${SD.line2}`, cursor: 'pointer', color: SD.inkMid,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, letterSpacing: -1,
            }}
          >···</button>
        </div>
      </div>

      {/* Archived banner — shown for Nope or Inactive schools */}
      {(school.category === 'Nope' || school.status === 'Inactive') && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          marginBottom: 14,
          padding: '5px 12px', borderRadius: 999,
          background: SD.goldSoft,
          border: `1px solid ${SD.goldDeep}`,
          fontSize: 11, fontWeight: 700, color: SD.goldInk,
          letterSpacing: 0.2,
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: SD.goldDeep, flexShrink: 0,
          }} />
          {school.status === 'Inactive' ? 'Inactive' : 'Not pursuing'} · not in active pipeline
        </div>
      )}

      {/* School name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <TierBadge tier={school.category} />
        <h1 style={{
          margin: 0,
          fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 700,
          letterSpacing: 'clamp(-1.2px, -0.04em, -2px)',
          color: SD.ink, lineHeight: 1, fontStyle: 'italic',
        }}>
          {school.name}.
        </h1>
      </div>

      {/* Meta row: stage dots + division + status */}
      <div style={{
        marginTop: 14,
        display: 'flex', alignItems: 'center',
        gap: 'clamp(8px, 2vw, 16px)', flexWrap: 'wrap',
      }}>
        <StageDots stage={stage} />
        {/* Clickable stage label → popover */}
        <div style={{ position: 'relative' }} ref={stageRef}>
          <button
            onClick={() => setStageOpen(o => !o)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12, color: SD.inkMid, fontWeight: 500, padding: 0,
            }}
          >
            {stageLabel(stage)}{' '}
            <span style={{ color: SD.inkLo }}>· step {stage} of 6</span>
            <span style={{ fontSize: 10, marginLeft: 4, color: SD.inkMute }}>▾</span>
          </button>
          {stageOpen && (
            <div
              style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 6,
                background: '#fff', border: `1px solid ${SD.line}`, borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20,
                width: 280, overflow: 'hidden',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px', borderBottom: `1px solid ${SD.line}`,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: SD.inkLo }}>Set stage</span>
                <button onClick={() => setStageOpen(false)} aria-label="Close" style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: SD.inkMute,
                  fontSize: 12, padding: 0, lineHeight: 1, fontFamily: 'inherit',
                }}>✕</button>
              </div>
              {([1, 2, 3, 4, 5, 6] as RecruitingStage[]).map(s => {
                const meta = STAGE_META[s]
                const active = s === stage
                return (
                  <button
                    key={s}
                    onClick={() => { onStageChange(s); setStageOpen(false) }}
                    style={{
                      display: 'block', width: '100%', padding: '8px 14px',
                      background: active ? SD.paperDeep : 'transparent',
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      textAlign: 'left', fontSize: 12,
                    }}
                  >
                    <span style={{ fontWeight: 700, color: SD.ink }}>{s}. {meta.label}</span>
                    <span style={{ color: SD.inkLo, marginLeft: 8 }}>{meta.short}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {metaParts && (
          <>
            <div style={{ width: 1, height: 14, background: SD.line2, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: SD.inkMid }}>{metaParts}</div>
          </>
        )}

        {recencyStyle && (
          <>
            <div style={{ width: 1, height: 14, background: SD.line2, flexShrink: 0 }} />
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 10px', borderRadius: 999,
              background: recencyStyle.bgColor, color: recencyStyle.textColor,
              fontSize: 11, fontWeight: 700, letterSpacing: -0.1,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: recencyStyle.dotColor }} />
              {recencyStyle.label}
              {recency.daysSinceLastContact !== null && ` · ${recency.daysSinceLastContact}d`}
            </div>
          </>
        )}
        {!recencyStyle && school.status !== 'Not Contacted' && (
          <>
            <div style={{ width: 1, height: 14, background: SD.line2, flexShrink: 0 }} />
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 10px', borderRadius: 999,
              background: SD.tealSoft, color: SD.tealDeep,
              fontSize: 11, fontWeight: 700, letterSpacing: -0.1,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: SD.teal }} />
              {school.status}
            </div>
          </>
        )}
      </div>

      {/* Milestone badges */}
      {(milestones.length > 0 || true) && (
        <div style={{
          marginTop: 10,
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        }}>
          {milestones.map(ms => {
            const meta = MILESTONE_META[ms.milestone]
            if (!meta) return null
            return (
              <span
                key={ms.id}
                title={[meta.label, ms.occurred_on, ms.note].filter(Boolean).join(' · ')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 999,
                  background: meta.bg, color: meta.color,
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.02em',
                  cursor: 'default',
                }}
              >
                <span style={{ fontSize: 11 }}>{meta.icon}</span>
                {meta.label}
                {ms.occurred_on && (
                  <span style={{ fontWeight: 500, opacity: 0.7 }}>
                    {ms.occurred_on.slice(5)}
                  </span>
                )}
                <button
                  onClick={() => onRemoveMilestone(ms.id)}
                  title="Remove milestone"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: meta.color, fontSize: 10, padding: 0, marginLeft: 2,
                    opacity: 0.5, lineHeight: 1,
                  }}
                >✕</button>
              </span>
            )
          })}

          {/* Add milestone button + popover */}
          <div style={{ position: 'relative' }} ref={msRef}>
            <button
              onClick={() => { setMsOpen(o => !o); setMsDate(new Date().toISOString().slice(0, 10)); setMsNote('') }}
              style={{
                padding: '2px 8px', borderRadius: 999,
                border: `1px dashed ${SD.line2}`, background: 'transparent',
                fontSize: 10, fontWeight: 700, color: SD.inkLo,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >+ milestone</button>
            {msOpen && (
              <div
                style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 6,
                  background: '#fff', border: `1px solid ${SD.line}`, borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20,
                  width: 260, padding: '8px 0',
                }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 14px 8px', borderBottom: `1px solid ${SD.line}`, marginBottom: 4,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: SD.inkLo }}>Add milestone</span>
                  <button onClick={() => setMsOpen(false)} aria-label="Close" style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: SD.inkMute,
                    fontSize: 12, padding: 0, lineHeight: 1, fontFamily: 'inherit',
                  }}>✕</button>
                </div>
                {(Object.keys(MILESTONE_META) as MilestoneType[])
                  .filter(t => !earnedTypes.has(t))
                  .map(t => {
                    const meta = MILESTONE_META[t]
                    return (
                      <button
                        key={t}
                        onClick={async () => {
                          await onUpsertMilestone({
                            school_id: school.id,
                            milestone: t,
                            occurred_on: msDate || null,
                            note: msNote.trim() || null,
                          })
                          setMsOpen(false)
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', padding: '7px 14px',
                          background: 'transparent', border: 'none',
                          cursor: 'pointer', fontFamily: 'inherit',
                          textAlign: 'left', fontSize: 12,
                        }}
                      >
                        <span style={{
                          padding: '1px 6px', borderRadius: 999,
                          background: meta.bg, color: meta.color,
                          fontSize: 10, fontWeight: 700,
                        }}>{meta.icon}</span>
                        <span style={{ color: SD.ink, fontWeight: 600 }}>{meta.label}</span>
                      </button>
                    )
                  })}
                {earnedTypes.size === Object.keys(MILESTONE_META).length && (
                  <div style={{ padding: '8px 14px', fontSize: 11, color: SD.inkMute }}>
                    All milestones earned
                  </div>
                )}
                <div style={{ padding: '6px 14px 4px', borderTop: `1px solid ${SD.line}`, marginTop: 4 }}>
                  <input
                    type="date"
                    value={msDate}
                    onChange={e => setMsDate(e.target.value)}
                    style={{
                      width: '100%', fontSize: 11, padding: '4px 6px',
                      border: `1px solid ${SD.line}`, borderRadius: 6,
                      fontFamily: 'inherit', color: SD.inkMid, background: SD.paper,
                    }}
                  />
                  <input
                    value={msNote}
                    onChange={e => setMsNote(e.target.value)}
                    placeholder="Optional note"
                    style={{
                      width: '100%', fontSize: 11, padding: '4px 6px', marginTop: 4,
                      border: `1px solid ${SD.line}`, borderRadius: 6,
                      fontFamily: 'inherit', color: SD.inkMid, background: SD.paper,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

type TLEntry =
  | { kind: 'contact'; entry: ContactLogEntry; sortDate: string; sortKey: string }
  | { kind: 'action';  item: ActionItem;       sortDate: string; sortKey: string }

function toDateStr(raw: string): string { return raw.slice(0, 10) }

/** Extract YYYY-MM-DD in Mountain time from an ISO timestamp. */
function sentAtToMountainDate(sentAt: string): string {
  return new Date(sentAt).toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
}

function fmtShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const CHANNEL_STYLE: Record<string, { bg: string; color: string }> = {
  'Email':           { bg: SD.tealSoft,  color: SD.tealDeep },
  'Phone':           { bg: SD.paperDeep, color: SD.inkMid   },
  'In Person':       { bg: SD.goldSoft,  color: SD.goldInk  },
  'Text':            { bg: SD.paperDeep, color: SD.inkMid   },
  'Sports Recruits': { bg: SD.paperDeep, color: SD.inkMid   },
}

function ChannelPill({ channel }: { channel: string }) {
  const s = CHANNEL_STYLE[channel] ?? { bg: SD.paperDeep, color: SD.inkMid }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px', borderRadius: 999,
      background: s.bg, color: s.color,
      fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
      textTransform: 'uppercase',
    }}>{channel}</span>
  )
}

function Timeline({
  contactLog, actionItems, school, coaches, today, userId,
  onDraft, onComplete, onSnooze, onDismiss, onUndo, onLogEntry, onEditEntry, onDeleteEntry,
}: {
  contactLog: ContactLogEntry[]
  actionItems: ActionItem[]
  school: School
  coaches: Coach[]
  today: string
  userId: string
  onDraft: (kind: 'fresh' | 'reply', entryId?: string, channel?: string) => void
  onComplete: (id: string) => Promise<void>
  onSnooze: (id: string) => Promise<void>
  onDismiss: (id: string) => Promise<void>
  onUndo: (id: string) => Promise<void>
  onLogEntry: (entry: {
    school_id: string; coach_id: string | null; coach_name: string | null
    channel: ContactChannel; direction: ContactDirection; date: string
    sent_at: string; summary: string; source: string; parse_status: string
    parse_notes: string; authored_by: null; intent: null; created_by: string
  }) => Promise<void>
  onEditEntry: (id: string, updates: {
    coach_id: string | null; coach_name: string | null
    channel: ContactChannel; direction: ContactDirection; date: string
    sent_at: string; summary: string
  }) => Promise<void>
  onDeleteEntry: (id: string) => Promise<void>
}) {
  const router = useRouter()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Snooze/dismiss state — computed once per render, keyed by entry id
  const snoozeInfo = useMemo(() => {
    const nowIso = new Date().toISOString()
    const info = new Map<string, { kind: 'snoozed'; until: string } | { kind: 'dismissed' }>()
    contactLog.forEach(e => {
      if (e.dismissed_at) {
        info.set(e.id, { kind: 'dismissed' })
      } else if (e.snoozed_until && e.snoozed_until > nowIso) {
        info.set(e.id, { kind: 'snoozed', until: e.snoozed_until })
      }
    })
    return info
  }, [contactLog])

  // Unreplied inbound detection — excludes snoozed and dismissed entries
  const unrepliedIds = useMemo(() => {
    const nowIso = new Date().toISOString()
    const outbounds = contactLog.filter(e => e.direction === 'Outbound')
    const ids = new Set<string>()
    contactLog
      .filter(e =>
        e.direction === 'Inbound' &&
        (e.channel === 'Email' || e.channel === 'Sports Recruits') &&
        !e.dismissed_at &&
        !(e.snoozed_until && e.snoozed_until > nowIso)
      )
      .forEach(e => {
        if (!outbounds.some(o => o.sent_at > e.sent_at)) ids.add(e.id)
      })
    return ids
  }, [contactLog])

  // Merge contact log + action items, sort newest first by sent_at / due_date
  const merged = useMemo((): TLEntry[] => {
    const contacts: TLEntry[] = contactLog.map(e => ({
      kind: 'contact', entry: e,
      sortDate: sentAtToMountainDate(e.sent_at),  // YYYY-MM-DD Mountain for date grouping
      sortKey: e.sent_at,                          // full ISO for precise within-day ordering
    }))
    const actions: TLEntry[] = actionItems.map(item => ({
      kind: 'action', item,
      sortDate: toDateStr(item.due_date ?? item.created_at),
      sortKey: item.due_date ?? item.created_at,
    }))
    return [...contacts, ...actions].sort((a, b) => b.sortKey.localeCompare(a.sortKey))
  }, [contactLog, actionItems])

  function tlId(te: TLEntry): string {
    return te.kind === 'contact' ? te.entry.id : te.item.id
  }

  function toggle(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const [logFormOpen, setLogFormOpen] = useState(false)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  // Recent-N truncation: long threads collapse to the most recent 8.
  const [showAllTimeline, setShowAllTimeline] = useState(false)
  const TIMELINE_RECENT_N = 8

  const sectionHeader = (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      marginBottom: 18, gap: 12,
    }}>
      <h2 style={{
        margin: 0, fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 700,
        letterSpacing: '-0.04em', color: SD.ink, fontStyle: 'italic',
      }}>The conversation<span style={{ color: SD.pitch }}>.</span></h2>
      {!logFormOpen && (
        <button
          onClick={() => setLogFormOpen(true)}
          style={{
            padding: '5px 12px', background: 'transparent',
            border: `1.3px solid ${SD.line2}`, borderRadius: 999,
            fontSize: 11, fontWeight: 700, color: SD.inkMid,
            cursor: 'pointer', letterSpacing: -0.1, fontFamily: 'inherit',
          }}
        >+ Log entry</button>
      )}
    </div>
  )

  if (merged.length === 0) {
    return (
      <section style={{ minWidth: 0 }}>
        {sectionHeader}
        {logFormOpen && (
          <LogEntryForm
            school={school}
            coaches={coaches}
            userId={userId}
            onSave={async (entry) => { await onLogEntry(entry); setLogFormOpen(false) }}
            onCancel={() => setLogFormOpen(false)}
          />
        )}
        <div style={{
          padding: '40px 24px', textAlign: 'center',
          background: SD.paperDeep, borderRadius: 14,
          border: `1px solid ${SD.line}`,
        }}>
          <div style={{ fontSize: 14, color: SD.inkLo, marginBottom: 12 }}>
            Conversations with this school will appear here. Send the first email to get started.
          </div>
          <button
            onClick={() => onDraft('fresh')}
            style={{
              padding: '8px 18px', background: SD.ink, color: '#fff',
              border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', letterSpacing: -0.1, fontFamily: 'inherit',
            }}
          >Start with an intro email →</button>
        </div>
      </section>
    )
  }

  return (
    <section style={{ minWidth: 0 }}>
      {sectionHeader}
      {logFormOpen && (
        <LogEntryForm
          school={school}
          coaches={coaches}
          userId={userId}
          onSave={async (entry) => { await onLogEntry(entry); setLogFormOpen(false) }}
          onCancel={() => setLogFormOpen(false)}
        />
      )}
      {(showAllTimeline ? merged : merged.slice(0, TIMELINE_RECENT_N)).map((te, i) => {
        const id  = tlId(te)
        const exp = i < 5 || expandedIds.has(id)

        // ── Contact log entry ──────────────────────────────────────────────────
        if (te.kind === 'contact') {
          const { entry } = te
          const isInbound   = entry.direction === 'Inbound'
          const isUnreplied = unrepliedIds.has(entry.id)
          const snoozeState = isInbound ? snoozeInfo.get(entry.id) : undefined

          if (exp) {
            const hasActions = isUnreplied || !!snoozeState
            return (
              <div key={id} id={`contact-log-${entry.id}`} style={{
                display: 'grid', gridTemplateColumns: '60px 1fr', gap: 12,
                padding: '12px 0', borderBottom: `1px solid ${SD.line}`,
                opacity: snoozeState ? 0.6 : 1,
              }}>
                {/* Date */}
                <div style={{
                  fontSize: 11, fontWeight: 600, color: SD.inkLo,
                  paddingTop: 14, textAlign: 'right', whiteSpace: 'nowrap',
                }}>{fmtShortDate(te.sortDate)}</div>
                {/* Card */}
                <div style={{
                  background: isInbound ? SD.tealSoft : '#fff',
                  border: `1px solid ${isInbound ? SD.teal + '44' : SD.line}`,
                  borderLeft: `3px solid ${isInbound ? SD.teal : SD.ink}`,
                  borderRadius: '0 10px 10px 0',
                  padding: '12px 14px',
                  position: 'relative',
                }}>
                  {/* Edit pencil for manual entries */}
                  {entry.parse_notes === 'Manual log entry' && editingEntryId !== entry.id && (
                    <button
                      onClick={() => setEditingEntryId(entry.id)}
                      title="Edit this entry"
                      style={{
                        position: 'absolute', top: 8, right: 8,
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 12, color: SD.inkLo, padding: 2, lineHeight: 1,
                        opacity: 0.6,
                      }}
                    >&#9998;</button>
                  )}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                    marginBottom: entry.summary ? 8 : 0,
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
                      textTransform: 'uppercase',
                      color: isInbound ? SD.tealDeep : SD.ink,
                    }}>{entry.direction}</span>
                    {entry.coach_name && (
                      <span style={{ fontSize: 12, color: SD.inkMid }}>· {entry.coach_name}</span>
                    )}
                    <ChannelPill channel={entry.channel} />
                  </div>
                  {editingEntryId !== entry.id && entry.summary && (
                    <div style={{
                      fontSize: 13, color: SD.inkSoft, lineHeight: 1.55,
                      marginBottom: hasActions ? 10 : 0,
                      overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%',
                    }}>{entry.summary}</div>
                  )}
                  {/* Inline edit form for manual entries */}
                  {editingEntryId === entry.id && (
                    <LogEntryForm
                      school={school}
                      coaches={coaches}
                      userId={userId}
                      initial={entry}
                      onSave={async (updated) => {
                        await onEditEntry(entry.id, {
                          coach_id: updated.coach_id,
                          coach_name: updated.coach_name,
                          channel: updated.channel,
                          direction: updated.direction,
                          date: updated.date,
                          sent_at: updated.sent_at,
                          summary: updated.summary,
                        })
                        setEditingEntryId(null)
                      }}
                      onDelete={async () => {
                        await onDeleteEntry(entry.id)
                        setEditingEntryId(null)
                      }}
                      onCancel={() => setEditingEntryId(null)}
                    />
                  )}
                  {/* Action buttons — unreplied inbounds only */}
                  {isUnreplied && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => onDraft('reply', entry.id, entry.channel)}
                        style={{
                          padding: '4px 12px', background: SD.pitch, color: SD.cream,
                          border: 'none', borderRadius: 999,
                          fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          letterSpacing: -0.1, fontFamily: 'inherit',
                        }}
                      >Draft reply →</button>
                      <button
                        onClick={() => onSnooze(entry.id)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 11, fontWeight: 600, color: SD.inkLo,
                          fontFamily: 'inherit', padding: 0, letterSpacing: -0.1,
                        }}
                      >Snooze 7d</button>
                      <button
                        onClick={() => onDismiss(entry.id)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 11, fontWeight: 600, color: SD.inkLo,
                          fontFamily: 'inherit', padding: 0, letterSpacing: -0.1,
                        }}
                      >Dismiss</button>
                    </div>
                  )}
                  {/* Snoozed / dismissed indicator with Undo */}
                  {snoozeState && (
                    <div style={{
                      fontSize: 11, fontWeight: 600, fontStyle: 'italic',
                      color: snoozeState.kind === 'dismissed' ? SD.inkMute : SD.goldInk,
                    }}>
                      {snoozeState.kind === 'dismissed'
                        ? 'Dismissed'
                        : `Snoozed until ${fmtShortDate(snoozeState.until.slice(0, 10))}`
                      }
                      {' · '}
                      <button
                        onClick={() => onUndo(entry.id)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 11, fontWeight: 700, fontStyle: 'normal',
                          color: SD.tealDeep, fontFamily: 'inherit', padding: 0,
                          textDecoration: 'underline',
                        }}
                      >Undo</button>
                    </div>
                  )}
                </div>
              </div>
            )
          }

          // Collapsed contact
          return (
            <div key={id} id={`contact-log-${entry.id}`} onClick={() => toggle(id)} style={{
              display: 'grid', gridTemplateColumns: '60px 16px 1fr 24px',
              gap: 10, alignItems: 'center',
              padding: '9px 0', borderBottom: `1px solid ${SD.line}`,
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: SD.inkLo, textAlign: 'right' }}>
                {fmtShortDate(te.sortDate)}
              </div>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: isInbound ? SD.teal : SD.ink,
                justifySelf: 'center',
              }} />
              <div style={{
                fontSize: 12, color: SD.inkMid,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                <span style={{ fontWeight: 700 }}>{entry.direction}</span>
                {entry.coach_name ? ` · ${entry.coach_name}` : ''}
                {entry.summary
                  ? ` — ${entry.summary.slice(0, 60)}${entry.summary.length > 60 ? '…' : ''}`
                  : ''}
              </div>
              <div style={{ fontSize: 13, color: SD.inkMute, textAlign: 'center' }}>+</div>
            </div>
          )
        }

        // ── Action item ────────────────────────────────────────────────────────
        const { item } = te
        const isOverdue = !!(item.due_date && item.due_date < today)

        if (exp) {
          return (
            <div key={id} style={{
              display: 'grid', gridTemplateColumns: '60px 1fr', gap: 12,
              padding: '12px 0', borderBottom: `1px solid ${SD.line}`,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 600,
                color: isOverdue ? SD.red : SD.inkLo,
                paddingTop: 12, textAlign: 'right', whiteSpace: 'nowrap',
              }}>{item.due_date ? fmtShortDate(te.sortDate) : '—'}</div>
              <div style={{
                background: isOverdue ? '#FFF8F9' : '#fff',
                border: `1.3px solid ${isOverdue ? SD.red : SD.line}`,
                borderLeft: `3px solid ${isOverdue ? SD.red : SD.inkMute}`,
                borderRadius: '0 10px 10px 0',
                padding: '10px 14px',
                display: 'flex', alignItems: 'flex-start', gap: 12,
              }}>
                <input
                  type="checkbox"
                  onChange={() => onComplete(item.id)}
                  style={{
                    marginTop: 2, width: 15, height: 15,
                    cursor: 'pointer', flexShrink: 0,
                    accentColor: SD.red,
                  }}
                />
                <div>
                  <div style={{ fontSize: 13, color: SD.inkSoft, fontWeight: 600 }}>
                    {item.action}
                  </div>
                  {item.due_date && (
                    <div style={{
                      marginTop: 3, fontSize: 11,
                      color: isOverdue ? SD.red : SD.inkLo, fontWeight: 600,
                    }}>
                      {isOverdue ? 'Overdue · ' : ''}{fmtShortDate(te.sortDate)}
                      {item.owner ? ` · ${item.owner}` : ''}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        }

        // Collapsed action item
        return (
          <div key={id} onClick={() => toggle(id)} style={{
            display: 'grid', gridTemplateColumns: '60px 16px 1fr 24px',
            gap: 10, alignItems: 'center',
            padding: '9px 0', borderBottom: `1px solid ${SD.line}`,
            cursor: 'pointer',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600,
              color: isOverdue ? SD.red : SD.inkLo,
              textAlign: 'right',
            }}>
              {item.due_date ? fmtShortDate(te.sortDate) : '—'}
            </div>
            <div style={{
              width: 8, height: 8, borderRadius: 2,
              background: isOverdue ? SD.red : SD.inkMute,
              justifySelf: 'center',
            }} />
            <div style={{
              fontSize: 12, color: SD.inkMid,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              <span style={{ fontWeight: 700 }}>Action</span>
              {` — ${item.action.slice(0, 60)}${item.action.length > 60 ? '…' : ''}`}
            </div>
            <div style={{ fontSize: 13, color: SD.inkMute, textAlign: 'center' }}>+</div>
          </div>
        )
      })}
      {merged.length > TIMELINE_RECENT_N && (
        <button
          onClick={() => setShowAllTimeline(v => !v)}
          style={{
            marginTop: 14, padding: '7px 16px', background: 'transparent',
            border: `1.3px solid ${SD.line2}`, borderRadius: 999,
            fontSize: 12, fontWeight: 600, color: SD.inkLo, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {showAllTimeline ? 'Show less' : `Show all (${merged.length})`}
        </button>
      )}
    </section>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function coachInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('')
}

// Legacy fallback: parse head_coach string if coaches table is empty
interface LegacyCoach { name: string; role: string; isHead: boolean }
function parseLegacyCoaches(raw: string): LegacyCoach[] {
  return raw
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map((entry, i) => {
      const match = entry.match(/^(.+?)\s+[–—-]\s+(.+)$/)
      if (match) {
        const role = match[2].trim()
        return { name: match[1].trim(), role, isHead: role.toLowerCase().includes('head') || i === 0 }
      }
      return { name: entry, role: '', isHead: i === 0 }
    })
}

// De-eyebrowed sub-card: small bold label (house register), not an uppercase kicker.
function SidebarCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${SD.line}`,
      borderRadius: 14, padding: '16px 18px',
    }}>
      <div style={{
        fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em',
        color: SD.ink, marginBottom: 12,
      }}>{label}</div>
      {children}
    </div>
  )
}

// Bold-italic zone header (the house register used across phase pages), with a
// Pitch Green trailing period when the label is a plain string.
function ZoneHeading({ children }: { children: ReactNode }) {
  const text = typeof children === 'string' ? children : null
  return (
    <h2 style={{
      margin: '0 0 18px', fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 700,
      letterSpacing: '-0.04em', color: SD.ink, fontStyle: 'italic',
    }}>
      {text ? <>{text.replace(/\.$/, '')}<span style={{ color: SD.pitch }}>.</span></> : children}
    </h2>
  )
}

function LogEntryForm({ school, coaches, userId, initial, onSave, onCancel, onDelete }: {
  school: School
  coaches: Coach[]
  userId: string
  initial?: ContactLogEntry
  onDelete?: () => Promise<void>
  onSave: (entry: {
    school_id: string; coach_id: string | null; coach_name: string | null
    channel: ContactChannel; direction: ContactDirection; date: string
    sent_at: string; summary: string; source: string; parse_status: string
    parse_notes: string; authored_by: null; intent: null; created_by: string
  }) => Promise<void>
  onCancel: () => void
}) {
  const [direction, setDirection] = useState<ContactDirection>(initial?.direction ?? 'Inbound')
  const [channel, setChannel] = useState<ContactChannel>(initial?.channel ?? 'Phone')
  const [coachId, setCoachId] = useState<string>(initial?.coach_id ?? '')
  const [date, setDate] = useState(initial?.date ?? todayStr())
  const [time, setTime] = useState(() => {
    if (!initial?.sent_at) return ''
    // Extract Mountain time from sent_at for pre-population
    return new Date(initial.sent_at).toLocaleTimeString('en-GB', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit', hour12: false })
  })
  const [summary, setSummary] = useState(initial?.summary ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!summary.trim()) return
    setSaving(true)

    // Resolve sent_at: interpret date+time as Mountain Time (America/Denver).
    // Works regardless of user's browser timezone.
    const timeStr = time
      ? `${time}:00`
      : new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Denver', hour12: false })
    // Create as UTC to avoid browser-local interpretation
    const asUTC = new Date(`${date}T${timeStr}Z`)
    // Determine Mountain offset for this specific date (handles DST transitions)
    const fmtOpts: Intl.DateTimeFormatOptions = {
      timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }
    const mtParts = new Intl.DateTimeFormat('en-CA', fmtOpts).formatToParts(asUTC)
    const g = (t: string) => mtParts.find(p => p.type === t)?.value ?? '00'
    const mtReconstructed = new Date(`${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}Z`)
    const offsetMs = asUTC.getTime() - mtReconstructed.getTime()
    // User typed time meaning Mountain → add offset to get correct UTC
    const sentAt = new Date(asUTC.getTime() + offsetMs).toISOString()

    // Resolve coach name from ID
    const coach = coaches.find(c => c.id === coachId)

    await onSave({
      school_id: school.id,
      coach_id: coachId || null,
      coach_name: coach?.name ?? null,
      channel,
      direction,
      date,
      sent_at: sentAt,
      summary: summary.trim(),
      source: 'manual',
      parse_status: 'full',
      parse_notes: 'Manual log entry',
      authored_by: null,
      intent: null,
      created_by: userId,
    })
    setSaving(false)
  }

  return (
    <div
      style={{
        marginBottom: 14, padding: '14px 16px', borderRadius: 12,
        border: `1px solid ${SD.line}`, background: SD.paperDeep,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
      onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
    >
      {/* Row 1: Direction toggle + Channel */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 0, borderRadius: 999, overflow: 'hidden', border: `1px solid ${SD.line}` }}>
          {(['Inbound', 'Outbound'] as const).map(dir => (
            <button
              key={dir}
              onClick={() => setDirection(dir)}
              style={{
                padding: '5px 12px', border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                background: direction === dir ? (dir === 'Inbound' ? SD.tealSoft : SD.ink) : '#fff',
                color: direction === dir ? (dir === 'Inbound' ? SD.tealDeep : '#fff') : SD.inkLo,
              }}
            >{dir}</button>
          ))}
        </div>
        <select
          value={channel}
          onChange={e => setChannel(e.target.value as ContactChannel)}
          style={{
            padding: '5px 8px', border: `1px solid ${SD.line}`, borderRadius: 6,
            fontSize: 11, fontFamily: 'inherit', background: '#fff', outline: 'none',
          }}
        >
          <option value="Phone">Phone</option>
          <option value="Text">Text</option>
          <option value="In Person">In Person</option>
          <option value="Email">Email</option>
          <option value="Other">Other</option>
        </select>
      </div>

      {/* Row 2: Coach + Date + Time */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select
          value={coachId}
          onChange={e => setCoachId(e.target.value)}
          style={{
            flex: 1, minWidth: 120, padding: '5px 8px',
            border: `1px solid ${SD.line}`, borderRadius: 6,
            fontSize: 11, fontFamily: 'inherit', background: '#fff', outline: 'none',
          }}
        >
          <option value="">No specific coach</option>
          {coaches.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.role})</option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{
            padding: '5px 6px', border: `1px solid ${SD.line}`, borderRadius: 6,
            fontSize: 11, fontFamily: 'inherit', background: '#fff', outline: 'none',
          }}
        />
        <input
          type="time"
          value={time}
          onChange={e => setTime(e.target.value)}
          placeholder="Time (optional)"
          style={{
            padding: '5px 6px', border: `1px solid ${SD.line}`, borderRadius: 6,
            fontSize: 11, fontFamily: 'inherit', background: '#fff', outline: 'none',
            width: 90,
          }}
        />
      </div>

      {/* Row 3: Summary */}
      <textarea
        autoFocus
        value={summary}
        onChange={e => setSummary(e.target.value)}
        placeholder="What happened? What was said? What's next?"
        rows={3}
        style={{
          width: '100%', padding: '8px 10px', border: `1px solid ${SD.line}`,
          borderRadius: 6, fontSize: 12, fontFamily: 'inherit',
          background: '#fff', outline: 'none', resize: 'vertical',
          lineHeight: 1.5, boxSizing: 'border-box',
        }}
      />

      {/* Row 4: Buttons */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        {/* Delete (edit mode only) */}
        {initial && onDelete ? <DeleteButton onConfirm={onDelete} /> : <div />}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '6px 16px', borderRadius: 999, border: `1px solid ${SD.line}`,
              background: '#fff', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', color: SD.inkLo,
            }}
          >Cancel</button>
          <button
            onClick={handleSave}
            disabled={!summary.trim() || saving}
            style={{
              padding: '6px 16px', borderRadius: 999, border: 'none',
              background: SD.ink, color: '#fff', fontSize: 11, fontWeight: 650,
              cursor: !summary.trim() || saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', opacity: !summary.trim() || saving ? 0.5 : 1,
            }}
          >{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

function DeleteButton({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleClick() {
    if (confirming) {
      if (timerRef.current) clearTimeout(timerRef.current)
      onConfirm()
    } else {
      setConfirming(true)
      timerRef.current = setTimeout(() => setConfirming(false), 3000)
    }
  }

  return (
    <button
      onClick={handleClick}
      style={{
        padding: '6px 12px', borderRadius: 6,
        border: confirming ? '1px solid #FCA5A5' : `1px solid ${SD.line}`,
        background: confirming ? '#FEF2F2' : '#fff',
        fontSize: 11, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit',
        color: confirming ? '#DC2626' : SD.inkLo,
      }}
    >{confirming ? 'Click again to confirm' : 'Delete entry'}</button>
  )
}

function AddActionForm({ onAdd }: { onAdd: (action: string, dueDate: string, owner: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState('')
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().split('T')[0]
  })
  const [owner, setOwner] = useState('Finn')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!action.trim()) return
    setSaving(true)
    await onAdd(action.trim(), dueDate, owner)
    setAction('')
    setDueDate(() => {
      const d = new Date()
      d.setDate(d.getDate() + 7)
      return d.toISOString().split('T')[0]
    })
    setOwner('Finn')
    setSaving(false)
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          marginTop: 10, padding: '5px 0', background: 'none', border: 'none',
          cursor: 'pointer', fontSize: 11, fontWeight: 700, color: SD.pitch,
          fontFamily: 'inherit', textAlign: 'left',
        }}
      >+ Add action item</button>
    )
  }

  return (
    <div
      style={{
        marginTop: 10, padding: 12, borderRadius: 8,
        border: `1px solid ${SD.line}`, background: SD.paperDeep,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <input
        autoFocus
        value={action}
        onChange={e => setAction(e.target.value)}
        placeholder="Action item..."
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' && action.trim()) handleSave() }}
        style={{
          width: '100%', padding: '6px 8px', border: `1px solid ${SD.line}`,
          borderRadius: 6, fontSize: 12, fontFamily: 'inherit',
          background: '#fff', outline: 'none', boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          style={{
            flex: 1, padding: '5px 6px', border: `1px solid ${SD.line}`,
            borderRadius: 6, fontSize: 11, fontFamily: 'inherit',
            background: '#fff', outline: 'none',
          }}
        />
        <select
          value={owner}
          onChange={e => setOwner(e.target.value)}
          style={{
            padding: '5px 6px', border: `1px solid ${SD.line}`,
            borderRadius: 6, fontSize: 11, fontFamily: 'inherit',
            background: '#fff', outline: 'none',
          }}
        >
          <option value="Finn">Finn</option>
          <option value="Randy">Randy</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          onClick={() => setOpen(false)}
          style={{
            padding: '4px 12px', borderRadius: 999, border: `1px solid ${SD.line}`,
            background: '#fff', fontSize: 11, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', color: SD.inkLo,
          }}
        >Cancel</button>
        <button
          onClick={handleSave}
          disabled={!action.trim() || saving}
          style={{
            padding: '4px 12px', borderRadius: 999, border: 'none',
            background: SD.ink, color: '#fff', fontSize: 11, fontWeight: 650,
            cursor: !action.trim() || saving ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', opacity: !action.trim() || saving ? 0.5 : 1,
          }}
        >{saving ? 'Saving...' : 'Save'}</button>
      </div>
    </div>
  )
}

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'flex-start', gap: 12,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: SD.inkLo, flexShrink: 0 }}>{label}</div>
      <div style={{
        fontSize: 12, color: SD.ink, textAlign: 'right',
        fontWeight: 500, wordBreak: 'break-word',
      }}>{value}</div>
    </div>
  )
}

// ─── Offers (surfaced above the fold — read-only; editing lives on Get In) ────

function useSchoolOffers(schoolId: string) {
  const [offers, setOffers] = useState<SchoolOffer[]>([])
  const supabase = useMemo(() => createClient(), [])

  const fetchOffers = useCallback(async () => {
    const { data, error } = await supabase
      .from('school_offers')
      .select('*')
      .eq('school_id', schoolId)
      .order('received_on', { ascending: false })
    if (!error && data) setOffers(data as SchoolOffer[])
  }, [supabase, schoolId])

  useEffect(() => {
    fetchOffers()
    const channel = supabase
      .channel(`school-offers-detail-${schoolId}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_offers' }, fetchOffers)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchOffers, supabase, schoolId])

  return offers
}

// Charcoal status pill — matches the Get In treatment.
const OFFER_STATUS_CHARCOAL: Record<OfferStatus, { bg: string; color: string; label: string }> = {
  open:     { bg: 'rgba(220, 252, 231, 0.15)', color: '#86EFAC', label: 'Open' },
  accepted: { bg: 'rgba(219, 234, 254, 0.15)', color: '#93C5FD', label: 'Accepted' },
  declined: { bg: 'rgba(254, 226, 226, 0.15)', color: '#FCA5A5', label: 'Declined' },
  expired:  { bg: 'rgba(243, 244, 246, 0.1)',  color: '#9CA3AF', label: 'Expired' },
}

function DetailOfferFieldRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.5, minHeight: 20 }}>
      <span style={{
        width: 80, flexShrink: 0, fontWeight: 600, color: 'rgba(246,241,232,0.62)',
        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 1,
      }}>{label}</span>
      <span style={{ color: value ? '#F6F1E8' : 'rgba(246,241,232,0.4)', fontStyle: value ? 'normal' : 'italic' }}>
        {value || '—'}
      </span>
    </div>
  )
}

function DetailOfferCard({ offer }: { offer: SchoolOffer }) {
  const statusPill = OFFER_STATUS_CHARCOAL[offer.status]
  return (
    <Link href="/get-in" style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{
        background: '#2E2B28', borderRadius: 14,
        padding: 'clamp(18px, 3vw, 26px)', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -10, right: 8, fontSize: 100, fontWeight: 800,
          fontStyle: 'italic', color: '#fff', opacity: 0.04, lineHeight: 1,
          pointerEvents: 'none', userSelect: 'none',
        }}>$</div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{
              fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'rgba(246,241,232,0.72)',
            }}>{OFFER_TYPE_LABELS[offer.offer_type]}</span>
            <span style={{
              padding: '3px 10px', borderRadius: 999,
              background: statusPill.bg, color: statusPill.color,
              fontSize: 10, fontWeight: 700, flexShrink: 0,
              letterSpacing: '0.03em', textTransform: 'uppercase',
            }}>{statusPill.label}</span>
          </div>
          <h3 style={{
            margin: '0 0 14px', fontSize: 17, fontWeight: 700,
            letterSpacing: '-0.02em', color: '#F6F1E8', fontStyle: 'italic', lineHeight: 1.3,
          }}>{offer.headline}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <DetailOfferFieldRow label="Money" value={offer.money_note} />
            <DetailOfferFieldRow label="Conditions" value={offer.conditions} />
            <DetailOfferFieldRow label="Key dates" value={offer.key_dates} />
          </div>
          {offer.received_on && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(246,241,232,0.4)' }}>
              Received {offer.received_on}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

function OffersZone({ schoolId }: { schoolId: string }) {
  const offers = useSchoolOffers(schoolId)
  if (offers.length === 0) return null
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: offers.length > 1 ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr',
      gap: 16, marginBottom: 'clamp(24px, 4vw, 36px)',
    }}>
      {offers.map(o => <DetailOfferCard key={o.id} offer={o} />)}
    </div>
  )
}

// ─── Zone 2: The staff — coaches + call prep ─────────────────────────────────

function StaffZone({
  school, coaches, onDraftForCoach, onSetPrimary,
}: {
  school: School
  coaches: Coach[]
  onDraftForCoach: (coachId: string) => void
  onSetPrimary: (id: string) => Promise<unknown>
}) {
  return (
    <section style={{ marginTop: 'clamp(32px, 5vw, 48px)' }}>
      <ZoneHeading>The staff.</ZoneHeading>

      {coaches.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {coaches.map(coach => {
            const isPrimary = coach.is_primary
            const emailToShow = isPrimary
              ? (coach.email ?? school.generic_team_email ?? null)
              : (coach.email ?? null)
            return (
              <div key={coach.id} style={{
                background: '#fff', border: `1px solid ${SD.line}`, borderRadius: 12,
                padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                {isPrimary ? (
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: SD.ink, color: '#fff', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, letterSpacing: 0.5, marginTop: 1,
                  }}>{coachInitials(coach.name)}</div>
                ) : (
                  <div style={{
                    width: 34, height: 34, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: SD.inkMute }} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: isPrimary ? 14 : 13, fontWeight: 700,
                      color: isPrimary ? SD.ink : SD.inkMid,
                      letterSpacing: -0.2, lineHeight: 1.3,
                    }}>{coach.name}</span>
                    {isPrimary && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase',
                        color: SD.pitch, background: '#E3EFE9', borderRadius: 999, padding: '1px 7px',
                      }}>Primary</span>
                    )}
                    {coach.needs_review && (
                      <span
                        title="This record was flagged during backfill — verify name, role, and email"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          padding: '1px 6px', borderRadius: 999,
                          background: SD.goldSoft, color: SD.goldInk,
                          fontSize: 9, fontWeight: 800, letterSpacing: 0.3,
                          textTransform: 'uppercase', flexShrink: 0,
                          border: `1px solid ${SD.goldDeep}`, cursor: 'help',
                        }}
                      >Needs review</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: SD.inkLo, fontWeight: 500, marginTop: 1 }}>
                    {coach.role}
                  </div>
                  {emailToShow && (
                    <a href={`mailto:${emailToShow}`} style={{
                      display: 'block', fontSize: 11, color: SD.pitch,
                      textDecoration: 'none', fontWeight: 600, marginTop: 2,
                      wordBreak: 'break-all',
                    }}>{emailToShow}</a>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => onDraftForCoach(coach.id)}
                      style={{
                        padding: '3px 10px', borderRadius: 999,
                        background: SD.ink, color: '#fff', border: 'none',
                        fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >Draft email</button>
                    {!isPrimary && (
                      <button
                        onClick={() => onSetPrimary(coach.id)}
                        style={{
                          background: 'none', border: 'none', padding: 0,
                          fontSize: 10, fontWeight: 600, color: SD.inkMute,
                          cursor: 'pointer', fontFamily: 'inherit',
                          textDecoration: 'underline', letterSpacing: 0.1,
                        }}
                      >Set as primary</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : school.head_coach ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {parseLegacyCoaches(school.head_coach).map((coach, i) => (
            <div key={i} style={{
              background: '#fff', border: `1px solid ${SD.line}`, borderRadius: 12,
              padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              {coach.isHead ? (
                <div style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: SD.ink, color: '#fff', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, letterSpacing: 0.5, marginTop: 1,
                }}>{coachInitials(coach.name)}</div>
              ) : (
                <div style={{
                  width: 34, height: 34, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: SD.inkMute }} />
                </div>
              )}
              <div>
                <div style={{
                  fontSize: coach.isHead ? 14 : 13, fontWeight: 700,
                  color: coach.isHead ? SD.ink : SD.inkMid, letterSpacing: -0.2, lineHeight: 1.3,
                }}>{coach.name}</div>
                {coach.role && (
                  <div style={{ fontSize: 11, color: SD.inkLo, fontWeight: 500, marginTop: 1 }}>
                    {coach.role}
                  </div>
                )}
                {coach.isHead && school.coach_email && (
                  <a href={`mailto:${school.coach_email}`} style={{
                    display: 'block', fontSize: 11, color: SD.tealDeep,
                    textDecoration: 'none', fontWeight: 600, marginTop: 2,
                  }}>{school.coach_email}</a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: SD.inkLo, fontStyle: 'italic' }}>
          No coaching contacts yet. They appear when the scraper finds them or you add one manually.
        </div>
      )}
    </section>
  )
}

// ─── Zone 2b: Call prep — its own section, right after the staff ──────────────

function CallPrepZone({ school, coaches, callPrepDocs, onRefetchPrep, onPrepForCall }: {
  school: School
  coaches: Coach[]
  callPrepDocs: ReturnType<typeof useCallPrepDocs>['docs']
  onRefetchPrep: () => void
  onPrepForCall: () => void
}) {
  return (
    <section style={{ marginTop: 'clamp(32px, 5vw, 48px)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <ZoneHeading>Call prep.</ZoneHeading>
        <button
          onClick={onPrepForCall}
          style={{
            padding: '7px 16px', borderRadius: 999,
            border: 'none', background: SD.ink, color: '#fff',
            fontSize: 12, fontWeight: 650, cursor: 'pointer', fontFamily: 'inherit',
            letterSpacing: '-0.01em', whiteSpace: 'nowrap',
          }}
        >Prep for a call →</button>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: SD.inkMid, lineHeight: 1.55, maxWidth: 640 }}>
        Before you get a coach on the phone, generate a one-page brief — where the conversation stands,
        what to ask, what they&apos;ll likely ask you.
      </p>
      <CallPrepSection
        docs={callPrepDocs}
        schoolId={school.id}
        schoolName={school.short_name ?? school.name}
        coaches={coaches}
        onRefetch={onRefetchPrep}
      />
    </section>
  )
}

// ─── Zone 3: Your notes — your thinking in one place ─────────────────────────

function NotesZone({
  school, actionItems, completedItems, today, onComplete, onAddAction, onUpdateAction,
  statusUpdates, onInsertUpdate, onUpdateUpdate, onDeleteUpdate,
  onSaveStatusUpdate, onSaveActionItem, onSaveContactLog,
}: {
  school: School
  actionItems: ActionItem[]
  completedItems: ActionItem[]
  today: string
  onComplete: (id: string) => Promise<void>
  onAddAction: (action: string, dueDate: string, owner: string) => Promise<void>
  onUpdateAction: (id: string, updates: { action?: string; due_date?: string | null }) => Promise<void>
  statusUpdates: import('@/lib/types').SchoolStatusUpdate[]
  onInsertUpdate: (u: { school_id: string; body: string; share_with_coach: import('@/lib/types').ShareWithCoach }) => Promise<{ error: unknown }>
  onUpdateUpdate: (id: string, fields: { body?: string; share_with_coach?: import('@/lib/types').ShareWithCoach }) => Promise<unknown>
  onDeleteUpdate: (id: string) => Promise<unknown>
  onSaveStatusUpdate: (body: string, share: import('@/lib/types').ShareWithCoach) => Promise<void>
  onSaveActionItem: (action: string) => Promise<void>
  onSaveContactLog: (entry: { direction: string; channel: string; date: string; summary: string }) => Promise<void>
}) {
  return (
    <section style={{ marginTop: 'clamp(32px, 5vw, 48px)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <ZoneHeading>Your tracking.</ZoneHeading>
        <NotePopover
          schoolId={school.id}
          onSaveStatusUpdate={onSaveStatusUpdate}
          onSaveActionItem={onSaveActionItem}
          onSaveContactLog={onSaveContactLog}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>

        {/* Action items */}
        <SidebarCard label={`Action items${actionItems.length > 0 ? ` · ${actionItems.length}` : ''}`}>
          {actionItems.length === 0 ? (
            <div style={{ fontSize: 12, color: SD.inkLo, fontStyle: 'italic' }}>
              Nothing to do right now. Add one when something comes up.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {actionItems.map(item => (
                <EditableActionRow
                  key={item.id}
                  item={item}
                  today={today}
                  onComplete={onComplete}
                  onUpdate={onUpdateAction}
                />
              ))}
            </div>
          )}
          <AddActionForm onAdd={onAddAction} />
          {completedItems.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${SD.line}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: SD.inkLo, marginBottom: 8 }}>Recently completed</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {completedItems.map(item => (
                  <div key={item.id}>
                    <div style={{ fontSize: 12, color: SD.inkLo, textDecoration: 'line-through', lineHeight: 1.4 }}>{item.action}</div>
                    <div style={{ fontSize: 10, color: SD.inkMute, marginTop: 1 }}>
                      Completed {item.completed_at
                        ? new Date(item.completed_at).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric' })
                        : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SidebarCard>

        {/* Status updates — now carries the thinking-capture role */}
        <SidebarCard label={`Status updates${statusUpdates.length > 0 ? ` · ${statusUpdates.length}` : ''}`}>
          <StatusUpdatesPanel
            schoolId={school.id}
            updates={statusUpdates}
            onInsert={onInsertUpdate}
            onUpdate={onUpdateUpdate}
            onDelete={onDeleteUpdate}
          />
        </SidebarCard>
      </div>
    </section>
  )
}

// ─── Logistics — reference: RQ, camps, the details ───────────────────────────

function LogisticsStrip({
  school, camps, schools, onUpdateSchool,
}: {
  school: School
  camps: CampWithRelations[]
  schools: School[]
  onUpdateSchool: (updates: Partial<School>) => Promise<void>
}) {
  const [editingRQ, setEditingRQ] = useState(false)
  const [editingRqLink, setEditingRqLink] = useState(false)
  const [rqLinkText, setRqLinkText] = useState(school.rq_link ?? '')
  const [editingTier, setEditingTier] = useState(false)
  const [editingAdmit, setEditingAdmit] = useState(false)

  const aboutRows: [string, string][] = [
    ['Division',     school.division                                          ],
    ['Conference',   school.conference                                  ?? ''],
    ['Location',     school.location                                    ?? ''],
    ['Status',       school.status                                            ],
    ['Last contact', school.last_contact ? fmtShortDate(school.last_contact) : ''],
  ].filter(([, v]) => v !== '') as [string, string][]

  return (
    <section style={{ marginTop: 'clamp(32px, 5vw, 48px)' }}>
      <ZoneHeading>The logistics.</ZoneHeading>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>

        {/* Recruiting questionnaire */}
        <SidebarCard label="Questionnaire">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: SD.inkLo, flexShrink: 0 }}>RQ status</div>
            <div style={{ textAlign: 'right', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                {editingRQ ? (
                  <select
                    autoFocus
                    value={school.rq_status ?? ''}
                    onChange={async (e) => {
                      const newStatus = e.target.value || null
                      const updates: Partial<School> = newStatus === 'Completed'
                        ? rqMarkCompletedPatch()
                        : { rq_status: newStatus }
                      await onUpdateSchool(updates)
                      setEditingRQ(false)
                    }}
                    onBlur={() => setEditingRQ(false)}
                    style={{ fontSize: 12, padding: '2px 4px', border: `1px solid ${SD.line}`, borderRadius: 4, outline: 'none' }}
                  >
                    <option value="">—</option>
                    <option value="To Do">To Do</option>
                    <option value="Updated">Updated</option>
                    <option value="Completed">Completed</option>
                  </select>
                ) : (
                  <span style={{ fontSize: 12, color: SD.ink, fontWeight: 500, cursor: 'pointer' }} onClick={() => setEditingRQ(true)}>
                    {school.rq_status ?? '—'}
                  </span>
                )}
                <button
                  onClick={async () => await onUpdateSchool(rqMarkUpdatedPatch())}
                  style={{
                    background: 'none', border: `1px solid ${SD.line}`, borderRadius: 999,
                    padding: '2px 8px', fontSize: 9, fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'inherit', color: SD.tealDeep,
                  }}
                >Mark updated</button>
              </div>
              {school.rq_updated_at && (
                <div style={{ fontSize: 10, color: SD.inkLo, marginTop: 2 }}>
                  Last updated: {new Date(school.rq_updated_at).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric' })}
                </div>
              )}
              <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                {school.rq_link ? (
                  <a href={school.rq_link} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 10, color: SD.tealDeep, textDecoration: 'none', fontWeight: 600 }}>
                    Open RQ
                  </a>
                ) : null}
                {editingRqLink ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input
                      autoFocus
                      value={rqLinkText}
                      onChange={e => setRqLinkText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') setEditingRqLink(false); if (e.key === 'Enter') { onUpdateSchool(rqSetLinkPatch(rqLinkText)); setEditingRqLink(false) } }}
                      placeholder="https://..."
                      style={{ width: 140, padding: '2px 4px', border: `1px solid ${SD.line}`, borderRadius: 4, fontSize: 10, outline: 'none' }}
                    />
                    <button onClick={() => { onUpdateSchool(rqSetLinkPatch(rqLinkText)); setEditingRqLink(false) }}
                      style={{ background: 'none', border: 'none', fontSize: 10, fontWeight: 600, color: SD.tealDeep, cursor: 'pointer' }}>Save</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setRqLinkText(school.rq_link ?? ''); setEditingRqLink(true) }}
                    style={{ background: 'none', border: 'none', fontSize: 10, color: SD.inkMute, cursor: 'pointer', padding: 0 }}
                  >{school.rq_link ? '✎' : 'Add RQ link'}</button>
                )}
              </div>
            </div>
          </div>
        </SidebarCard>

        {/* Camps */}
        <SidebarCamps school={school} camps={camps} schools={schools} />

        {/* The details */}
        <SidebarCard label="The details">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {aboutRows.map(([label, value]) => (
              <AboutRow key={label} label={label} value={value} />
            ))}

            {/* Tier — editable */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: SD.inkLo, flexShrink: 0 }}>Tier</div>
              {editingTier ? (
                <select
                  autoFocus
                  value={school.category}
                  onChange={async (e) => {
                    const val = e.target.value as Category
                    await onUpdateSchool({ category: val })
                    setEditingTier(false)
                  }}
                  onBlur={() => setEditingTier(false)}
                  style={{ fontSize: 12, padding: '2px 4px', border: `1px solid ${SD.line}`, borderRadius: 4, outline: 'none' }}
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="Nope">Nope</option>
                </select>
              ) : (
                <div style={{ fontSize: 12, color: SD.ink, fontWeight: 500, cursor: 'pointer' }} onClick={() => setEditingTier(true)}>
                  {school.category}
                </div>
              )}
            </div>

            {/* Admit — editable */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: SD.inkLo, flexShrink: 0 }}>Admit</div>
              {editingAdmit ? (
                <select
                  autoFocus
                  value={school.admit_likelihood ?? ''}
                  onChange={async (e) => {
                    const val = e.target.value || null
                    await onUpdateSchool({ admit_likelihood: val as AdmitLikelihood | null })
                    setEditingAdmit(false)
                  }}
                  onBlur={() => setEditingAdmit(false)}
                  style={{ fontSize: 12, padding: '2px 4px', border: `1px solid ${SD.line}`, borderRadius: 4, outline: 'none' }}
                >
                  <option value="">—</option>
                  <option value="Likely">Likely</option>
                  <option value="Target">Target</option>
                  <option value="Reach">Reach</option>
                  <option value="Far Reach">Far Reach</option>
                </select>
              ) : (
                <div style={{ fontSize: 12, color: SD.ink, fontWeight: 500, cursor: 'pointer' }} onClick={() => setEditingAdmit(true)}>
                  {school.admit_likelihood ?? '—'}
                </div>
              )}
            </div>

            {/* Videos sent */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: SD.inkLo, flexShrink: 0 }}>Videos sent</div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: SD.ink, fontWeight: 500 }}>
                  {school.last_video_url ? 'Yes' : 'No'}
                </div>
                {school.last_video_sent_at && (
                  <div style={{ fontSize: 10, color: SD.inkLo, marginTop: 1 }}>
                    Last sent: {new Date(school.last_video_sent_at).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric' })}
                    {school.last_video_title && school.last_video_url && (
                      <> — <a href={school.last_video_url} target="_blank" rel="noopener noreferrer" style={{ color: SD.tealDeep, textDecoration: 'none' }}>{school.last_video_title}</a></>
                    )}
                    {!school.last_video_title && school.last_video_url && (
                      <> — <a href={school.last_video_url} target="_blank" rel="noopener noreferrer" style={{ color: SD.tealDeep, textDecoration: 'none' }}>link</a></>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </SidebarCard>
      </div>
    </section>
  )
}

// ─── Sidebar camps section ───────────────────────────────────────────────────

const CAMP_STATUS_STYLE: Record<CampFinnStatusValue, { bg: string; color: string }> = {
  interested: { bg: '#DBEAFE', color: '#1E40AF' },
  targeted:   { bg: '#FEF3C7', color: '#92400E' },
  registered: { bg: '#D7F0ED', color: '#006A65' },
  attended:   { bg: '#F3F4F6', color: '#374151' },
  declined:   { bg: '#FEE2E2', color: '#991B1B' },
}

const CAMP_TIER_STYLE: Record<Category, { bg: string; color: string }> = {
  A: { bg: '#FEE2E2', color: '#991B1B' },
  B: { bg: '#DBEAFE', color: '#1E40AF' },
  C: { bg: '#F3F4F6', color: '#374151' },
  Nope: { bg: '#E5E7EB', color: '#6B7280' },
}

function SidebarCamps({ school, camps, schools }: {
  school: School
  camps: CampWithRelations[]
  schools: School[]
}) {
  const router = useRouter()
  const [showAddModal, setShowAddModal] = useState(false)
  const { hosted, attending } = getCampsForSchool(camps, school.id)
  const totalCount = hosted.length + attending.length

  return (
    <>
      <SidebarCard label={`Camps${totalCount > 0 ? ` · ${totalCount}` : ''}`}>
        {/* Add button */}
        <div style={{ float: 'right', marginTop: -30 }}>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '3px 10px', borderRadius: 999,
              border: `1px solid ${SD.line}`, background: '#fff',
              fontSize: 10, fontWeight: 700, color: SD.pitch,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >+ Add</button>
        </div>

        {totalCount === 0 ? (
          <div style={{ fontSize: 12, color: SD.inkLo, fontStyle: 'italic' }}>
            No camps linked to this school. They appear when discovered by the camp scraper or added manually.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Hosted */}
            {hosted.length > 0 && (
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: SD.inkLo,
                  letterSpacing: '-0.01em', marginBottom: 6,
                }}>Hosted</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {hosted.map(c => (
                    <SidebarCampRow key={c.camp.id} camp={c} onClick={() => router.push(`/calendar/${c.camp.id}`)} />
                  ))}
                </div>
              </div>
            )}

            {/* Attending */}
            {attending.length > 0 && (
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: SD.inkLo,
                  letterSpacing: '-0.01em', marginBottom: 6,
                }}>Attending</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {attending.map(c => (
                    <SidebarCampRow key={c.camp.id} camp={c} showHost onClick={() => router.push(`/calendar/${c.camp.id}`)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SidebarCard>

      {showAddModal && (
        <AddCampModal
          schools={schools}
          onClose={() => setShowAddModal(false)}
          onCreated={(id) => { setShowAddModal(false); router.push(`/calendar/${id}`) }}
          prefilledHostSchoolId={school.id}
        />
      )}
    </>
  )
}

function SidebarCampRow({ camp, showHost, onClick }: {
  camp: CampWithRelations
  showHost?: boolean
  onClick: () => void
}) {
  const status = camp.finnStatus?.status ?? 'interested'
  const statusStyle = CAMP_STATUS_STYLE[status]
  const hostTier = CAMP_TIER_STYLE[camp.hostSchool.category] ?? CAMP_TIER_STYLE.C

  const s = new Date(camp.camp.start_date + 'T12:00:00')
  const e = new Date(camp.camp.end_date + 'T12:00:00')
  const sMonth = s.toLocaleDateString('en-US', { month: 'short' })
  const sDay = s.getDate()
  const eMonth = e.toLocaleDateString('en-US', { month: 'short' })
  const eDay = e.getDate()
  const dateStr = camp.camp.start_date === camp.camp.end_date
    ? `${sMonth} ${sDay}`
    : sMonth === eMonth ? `${sMonth} ${sDay}–${eDay}` : `${sMonth} ${sDay} – ${eMonth} ${eDay}`

  return (
    <div
      onClick={onClick}
      style={{
        padding: '6px 8px', borderRadius: 8,
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, color: SD.ink, lineHeight: 1.4 }}>
        {camp.camp.name}
      </div>
      <div style={{
        marginTop: 2, display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 11, color: SD.inkLo, flexWrap: 'wrap',
      }}>
        {showHost && (
          <>
            <span style={{
              fontSize: 9, fontWeight: 800, padding: '1px 4px', borderRadius: 3,
              background: hostTier.bg, color: hostTier.color,
            }}>{camp.hostSchool.category}</span>
            <span>{camp.hostSchool.short_name || camp.hostSchool.name}</span>
            <span style={{ color: SD.inkMute }}>·</span>
          </>
        )}
        <span>{dateStr}</span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
          background: statusStyle.bg, color: statusStyle.color,
          textTransform: 'capitalize',
        }}>{status}</span>
      </div>
    </div>
  )
}


// ─── Main client component ────────────────────────────────────────────────────

interface DraftTarget {
  kind: 'fresh' | 'reply'
  replyToContactLogId?: string
  inboundChannel?: string
  coachId?: string  // when set, targets a specific coach instead of the fallback chain
  recommendedAction?: import('@/lib/types').RecommendedAction
}

export default function SchoolDetailClient({
  initialSchool,
  user,
}: {
  initialSchool: School
  user: User
}) {
  const today = todayStr()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [draftTarget, setDraftTarget] = useState<DraftTarget | null>(null)
  const [prepOpen, setPrepOpen]       = useState(false)
  const [editOpen, setEditOpen]       = useState(false)
  const autoOpenHandled = useRef(false)

  // ── Realtime subscriptions ─────────────────────────────────────────────────
  const { schools, loading: schoolsLoading, updateSchool, deleteSchool } = useSchools()
  const { entries: contactLog, loading: logLoading, insertContact, updateEntry, deleteEntry, snoozeEntry, dismissEntry, undoEntry } = useContactLog(initialSchool.id)
  const { items: actionItems, completedItems, loading: actionsLoading, completeItem, insertItem, updateItem } = useActionItems(initialSchool.id)
  const { coaches, setPrimary } = useCoaches(initialSchool.id)
  const { camps } = useCamps(schools)
  const { docs: callPrepDocs, refetch: refetchPrepDocs } = useCallPrepDocs(initialSchool.id)
  const { updates: statusUpdates, insertUpdate, updateUpdate, deleteUpdate } = useStatusUpdates(initialSchool.id)
  const { milestones, upsertMilestone, removeMilestone } = useMilestones(initialSchool.id)

  const loading = schoolsLoading || logLoading || actionsLoading

  // Fire-and-forget conversation summary regen after status update changes
  const regenSummary = () => {
    fetch(`/api/schools/${initialSchool.id}/conversation-summary`, { method: 'POST' }).catch(() => {})
  }

  // Auto-open draft modal when navigated with ?action=draft (from schools list / home)
  useEffect(() => {
    if (autoOpenHandled.current) return
    if (searchParams.get('action') !== 'draft') return
    if (loading) return  // wait for coaches to load
    autoOpenHandled.current = true
    // Clear the URL param
    router.replace(`/schools/${initialSchool.id}`, { scroll: false })
    // Fetch summary to get recommended_action
    const sb = createClient()
    sb.from('school_conversation_summary')
      .select('recommended_action')
      .eq('school_id', initialSchool.id)
      .maybeSingle()
      .then(({ data }: { data: { recommended_action?: import('@/lib/types').RecommendedAction } | null }) => {
        const action = data?.recommended_action
        setDraftTarget({
          kind: action?.category === 'reply' ? 'reply' : 'fresh',
          recommendedAction: action ?? undefined,
        })
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams])

  // Keep school record fresh via the schools realtime subscription
  const school = useMemo(
    () => schools.find(s => s.id === initialSchool.id) ?? initialSchool,
    [schools, initialSchool]
  )

  // ── Sibling navigation ─────────────────────────────────────────────────────
  // All active schools sorted by tier → last_contact desc (same as /schools list default)
  const siblingSchools = useMemo(
    () =>
      schools
        .filter(s => s.category !== 'Nope' && s.status !== 'Inactive')
        .sort((a, b) => {
          const ta = TIER_ORDER[a.category] ?? 9
          const tb = TIER_ORDER[b.category] ?? 9
          if (ta !== tb) return ta - tb
          return (b.last_contact ?? '').localeCompare(a.last_contact ?? '')
        }),
    [schools]
  )
  const currentIdx  = siblingSchools.findIndex(s => s.id === school.id)
  const prevSchool  = currentIdx > 0 ? siblingSchools[currentIdx - 1] : null
  const nextSchool  = currentIdx >= 0 && currentIdx < siblingSchools.length - 1
    ? siblingSchools[currentIdx + 1]
    : null

  const stage = school.recruiting_stage ?? 1
  // Resolve target coach: primary → head coach → most recent active coach
  const targetCoach = (() => {
    const active = coaches.filter(c => c.is_active)
    if (active.length === 0) return null
    const primary = active.find(c => c.is_primary)
    if (primary) return primary
    const head = active.find(c => c.role?.toLowerCase().includes('head'))
    if (head) return head
    return [...active].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]
  })()

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: SD.inkLo, fontSize: 14,
      }}>
        Loading…
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: SD.paper, paddingBottom: 80 }}>

      <DetailHeader
        school={school}
        stage={stage}
        prevSchool={prevSchool}
        nextSchool={nextSchool}
        contactLog={contactLog}
        onTierChange={async (tier) => { await updateSchool(school.id, { category: tier as School['category'] }) }}
        onStageChange={async (s) => { await updateSchool(school.id, { recruiting_stage: s }) }}
        milestones={milestones}
        onUpsertMilestone={upsertMilestone}
        onRemoveMilestone={removeMilestone}
        onEdit={() => setEditOpen(true)}
      />

      {/* ── Single-column zone flow (masthead → offers → hero → conversation → staff → call prep → tracking → logistics) ── */}
      <div style={{
        maxWidth: 960, margin: '0 auto',
        padding: '0 clamp(16px, 4vw, 40px)',
        paddingBottom: 'clamp(24px, 4vw, 40px)',
        marginTop: 'clamp(20px, 3vw, 28px)',
      }}>

        {/* ZONE 0 (cont.) — offers surfaced above the fold */}
        <OffersZone schoolId={school.id} />

        {/* ZONE 0 (cont.) — the summary hero: the page's single message */}
        <section>
          <h2 style={{
            margin: '0 0 14px', fontSize: 'clamp(20px, 2.8vw, 26px)', fontWeight: 700,
            letterSpacing: '-0.04em', color: SD.ink, fontStyle: 'italic',
          }}>Where things stand<span style={{ color: SD.pitch }}>.</span></h2>
          <ConversationSummaryCard
            schoolId={school.id}
            schoolName={school.short_name ?? school.name}
            benched={school.category === 'Nope' || school.status === 'Inactive'}
            setAsideNote={statusUpdates.length > 0 ? { body: statusUpdates[0].body } : null}
            onDraft={(kind, entryId, channel, recommendedAction) => setDraftTarget({ kind, replyToContactLogId: entryId, inboundChannel: channel, recommendedAction })}
          />
        </section>

        {/* ZONE 1 — The conversation (Timeline renders its own heading) */}
        <section style={{ marginTop: 'clamp(32px, 5vw, 48px)' }}>
          <Timeline
            contactLog={contactLog}
            actionItems={actionItems}
            school={school}
            coaches={coaches}
            today={today}
            userId={user.id}
            onDraft={(kind, entryId, channel) => setDraftTarget({ kind, replyToContactLogId: entryId, inboundChannel: channel })}
            onComplete={async (id) => { await completeItem(id) }}
            onSnooze={async (id) => { await snoozeEntry(id) }}
            onDismiss={async (id) => { await dismissEntry(id) }}
            onUndo={async (id) => { await undoEntry(id) }}
            onLogEntry={async (entry) => { await insertContact(entry as Parameters<typeof insertContact>[0]) }}
            onEditEntry={async (id, updates) => { await updateEntry(id, updates) }}
            onDeleteEntry={async (id) => { await deleteEntry(id) }}
          />
        </section>

        {/* ZONE 2 — The staff */}
        <StaffZone
          school={school}
          coaches={coaches}
          onDraftForCoach={(coachId) => setDraftTarget({ kind: 'fresh', coachId })}
          onSetPrimary={setPrimary}
        />

        {/* ZONE 2b — Call prep (promoted to its own section) */}
        <CallPrepZone
          school={school}
          coaches={coaches}
          callPrepDocs={callPrepDocs}
          onRefetchPrep={refetchPrepDocs}
          onPrepForCall={() => setPrepOpen(true)}
        />

        {/* ZONE 3 — Your tracking */}
        <NotesZone
          school={school}
          actionItems={actionItems}
          completedItems={completedItems}
          today={today}
          onComplete={async (id) => { await completeItem(id) }}
          onAddAction={async (action, dueDate, owner) => {
            await insertItem({ school_id: school.id, action, owner: owner as 'Finn' | 'Randy', due_date: dueDate })
          }}
          onUpdateAction={async (id, updates) => { await updateItem(id, updates) }}
          statusUpdates={statusUpdates}
          onInsertUpdate={async (u) => { const r = await insertUpdate(u); regenSummary(); return r }}
          onUpdateUpdate={async (id, f) => { const r = await updateUpdate(id, f); regenSummary(); return r }}
          onDeleteUpdate={async (id) => { const r = await deleteUpdate(id); regenSummary(); return r }}
          onSaveStatusUpdate={async (body, share) => { await insertUpdate({ school_id: school.id, body, share_with_coach: share }); regenSummary() }}
          onSaveActionItem={async (action) => { await insertItem({ school_id: school.id, action, owner: 'Finn', due_date: null }) }}
          onSaveContactLog={async (entry) => { await insertContact({ ...entry, school_id: school.id } as Parameters<typeof insertContact>[0]) }}
        />

        {/* LOGISTICS — reference: RQ, camps, the details */}
        <LogisticsStrip
          school={school}
          camps={camps}
          schools={schools}
          onUpdateSchool={async (updates) => { await updateSchool(school.id, updates) }}
        />
      </div>

      {/* ── Modals ── */}
      {draftTarget && (() => {
        // Coach resolution: explicit coachId > recommended_coach_id > default fallback chain
        const recCoachId = draftTarget.recommendedAction?.recommended_coach_id
        const resolvedCoach = draftTarget.coachId
          ? coaches.find(c => c.id === draftTarget.coachId) ?? targetCoach
          : recCoachId
            ? coaches.find(c => c.id === recCoachId && c.is_active) ?? targetCoach
            : targetCoach
        if (!resolvedCoach) return null
        return (
          <DraftModal
            mode={draftTarget.kind === 'reply' && draftTarget.replyToContactLogId
              ? {
                  kind: 'reply',
                  schoolId: school.id,
                  coachId: resolvedCoach.id,
                  schoolName: school.name,
                  coachName: resolvedCoach.name,
                  replyToContactLogId: draftTarget.replyToContactLogId,
                  inboundChannel: draftTarget.inboundChannel,
                }
              : {
                  kind: 'fresh',
                  schoolId: school.id,
                  coachId: resolvedCoach.id,
                  schoolName: school.name,
                  coachName: resolvedCoach.name,
                }
            }
            userId={user.id}
            onClose={() => setDraftTarget(null)}
            recommendedAction={draftTarget.recommendedAction}
          />
        )
      })()}
      {draftTarget && !targetCoach && !draftTarget.coachId && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 999,
            background: 'rgba(0,0,0,0.4)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setDraftTarget(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 12, padding: '24px 28px',
              maxWidth: 380, boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
              No active coaches
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
              Add a coach to {school.short_name || school.name} before drafting an email.
            </div>
            <button
              onClick={() => setDraftTarget(null)}
              style={{
                padding: '8px 20px', background: '#0f172a', color: '#fff',
                border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
              }}
            >OK</button>
          </div>
        </div>
      )}
      {prepOpen && (
        <PrepForCallModal
          school={school}
          coaches={coaches}
          onClose={() => setPrepOpen(false)}
          onGenerated={refetchPrepDocs}
        />
      )}
      {editOpen && (
        <SchoolModal
          school={school}
          userId={user.id}
          onUpdate={async (updates) => { await updateSchool(school.id, updates) }}
          onDelete={async () => { await deleteSchool(school.id); router.push('/schools') }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  )
}

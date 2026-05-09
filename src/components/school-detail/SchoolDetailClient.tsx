'use client'

import { useState, useMemo, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { School, ContactLogEntry, ActionItem, Coach, ContactChannel, ContactDirection, Category, AdmitLikelihood, CampWithRelations } from '@/lib/types'
import { useSchools, useContactLog, useActionItems, useCoaches, useCamps } from '@/hooks/useRealtimeData'
import { deriveStage, stageLabel, STAGE_LABELS } from '@/lib/stages'
import { getRankedFeaturedAction } from '@/lib/todayLogic'
import { getCampsForSchool } from '@/lib/camps'
import { todayStr } from '@/lib/utils'
import DraftModal from '@/components/DraftModal'
import PrepForCallModal from '@/components/PrepForCallModal'
import AddCampModal from '@/components/AddCampModal'
import EditableActionRow from '@/components/EditableActionRow'

// ─── Design tokens ────────────────────────────────────────────────────────────

const SD = {
  paper:     '#F6F1E8',
  paperDeep: '#EFE8D8',
  ink:       '#0E0E0E',
  inkSoft:   '#1F1F1F',
  inkMid:    '#4A4A4A',
  inkLo:     '#7A7570',
  inkMute:   '#A8A39B',
  line:      '#E2DBC9',
  line2:     '#D3CAB3',
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
  school, stage, prevSchool, nextSchool, onTierChange,
}: {
  school: School; stage: number
  prevSchool: School | null; nextSchool: School | null
  onTierChange?: (tier: string) => void
}) {
  const router = useRouter()
  const metaParts = [school.division, school.conference, school.location].filter(Boolean).join(' · ')

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
          {/* "..." menu — routes to pipeline modal for edits */}
          <button
            onClick={() => router.push(`/pipeline?school=${school.id}`)}
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
        <div style={{ fontSize: 12, color: SD.inkMid, fontWeight: 500 }}>
          {stageLabel(stage)}{' '}
          <span style={{ color: SD.inkLo }}>· step {stage} of 6</span>
        </div>

        {metaParts && (
          <>
            <div style={{ width: 1, height: 14, background: SD.line2, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: SD.inkMid }}>{metaParts}</div>
          </>
        )}

        {school.status !== 'Not Contacted' && (
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
    </div>
  )
}

// ─── Action bar ───────────────────────────────────────────────────────────────

function ActionBar({
  school, actionItems, contactLog, today, onDraft, onComplete,
}: {
  school: School
  actionItems: ActionItem[]
  contactLog: ContactLogEntry[]
  today: string
  onDraft: (kind: 'fresh' | 'reply', entryId?: string, channel?: string) => void
  onComplete: (id: string) => Promise<void>
}) {
  const featured = getRankedFeaturedAction(actionItems, contactLog, [school], today)
  const schoolLabel = school.short_name || school.name

  // ── Caught up ──────────────────────────────────────────────────────────────
  if (!featured) {
    return (
      <div style={{
        margin: 'clamp(14px, 3vw, 20px) clamp(16px, 4vw, 40px) 0',
        background: SD.tealSoft, borderRadius: 14, padding: '18px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: SD.tealDeep, marginBottom: 2 }}>
            You&apos;re caught up on {schoolLabel}.
          </div>
          <div style={{ fontSize: 12, color: SD.tealDeep, opacity: 0.8 }}>
            No urgent actions. Keep the conversation moving.
          </div>
        </div>
        <button
          onClick={() => onDraft('fresh')}
          style={{
            padding: '8px 16px', background: SD.tealDeep, color: '#fff',
            border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 650,
            cursor: 'pointer', letterSpacing: -0.1, flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          Draft check-in
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    )
  }

  // ── Priority action ────────────────────────────────────────────────────────
  const isOverdue = !!(featured.actionItem?.due_date && featured.actionItem.due_date < today)
  const badgeText = `Next for ${schoolLabel}${isOverdue ? ' · overdue' : ''}`

  async function handleCTA() {
    if (!featured) return
    if (featured.type === 'action_item' && featured.actionItem) {
      await onComplete(featured.actionItem.id)
    } else {
      if (featured.inboundEntry) {
        onDraft('reply', featured.inboundEntry.id, featured.inboundEntry.channel)
      } else {
        onDraft('fresh')
      }
    }
  }

  return (
    <div style={{
      margin: 'clamp(14px, 3vw, 20px) clamp(16px, 4vw, 40px) 0',
      background: SD.red, borderRadius: 16, overflow: 'hidden', position: 'relative',
      boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 18px 42px -22px rgba(200,16,46,0.38)',
    }}>
      {/* Decorative arrow watermark */}
      <div style={{
        position: 'absolute', right: -10, bottom: -40,
        fontSize: 'clamp(120px, 18vw, 200px)', fontWeight: 800, lineHeight: 1,
        letterSpacing: -10, color: 'rgba(0,0,0,0.16)', fontStyle: 'italic',
        pointerEvents: 'none', userSelect: 'none',
      }}>→</div>

      <div
        className="action-bar-grid"
        style={{
          padding: 'clamp(18px, 3vw, 24px) clamp(20px, 4vw, 30px)',
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 'clamp(16px, 3vw, 28px)', alignItems: 'center',
          position: 'relative',
        }}
      >
        {/* Left: label + title + context */}
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '3px 9px', borderRadius: 999, background: 'rgba(0,0,0,0.22)',
            fontSize: 10, fontWeight: 800, letterSpacing: 1.4,
            textTransform: 'uppercase', color: '#fff', marginBottom: 10,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />
            {badgeText}
          </div>
          <div style={{
            fontSize: 'clamp(18px, 3vw, 26px)', fontWeight: 700,
            letterSpacing: -0.6, lineHeight: 1.15, color: '#fff',
          }}>
            {featured.title}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: SD.redInk, opacity: 0.9 }}>
            {featured.context}
          </div>
        </div>

        {/* Right: CTA + snooze */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
          <button
            onClick={handleCTA}
            style={{
              background: '#fff', color: SD.red, border: 'none', borderRadius: 12,
              padding: 'clamp(11px, 2vw, 14px) clamp(16px, 2.5vw, 22px)',
              fontSize: 'clamp(13px, 1.5vw, 15px)', fontWeight: 700,
              letterSpacing: -0.2, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, minWidth: 170,
              boxShadow: '0 1px 0 rgba(0,0,0,0.08), 0 6px 18px -8px rgba(0,0,0,0.25)',
            }}
          >
            {featured.ctaLabel}
            <span style={{
              width: 24, height: 24, borderRadius: '50%',
              background: SD.red, color: '#fff', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </button>
          <div style={{
            fontSize: 11, color: SD.redInk, opacity: 0.8, cursor: 'default',
            textAlign: 'center', letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 600,
          }}>
            Snooze 1 day
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .action-bar-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
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

  const sectionHeader = (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      marginBottom: 18, gap: 12,
    }}>
      <h2 style={{
        margin: 0, fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 700,
        letterSpacing: '-0.04em', color: SD.ink, fontStyle: 'italic',
      }}>Conversation.</h2>
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
            No conversation yet.
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
      {merged.map((te, i) => {
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
              <div key={id} style={{
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
                          padding: '4px 12px', background: SD.teal, color: '#fff',
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
            <div key={id} onClick={() => toggle(id)} style={{
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

function SidebarCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${SD.line}`,
      borderRadius: 14, padding: '16px 18px',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: SD.inkLo, marginBottom: 14,
      }}>{label}</div>
      {children}
    </div>
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
        marginBottom: 18, padding: 16, borderRadius: 10,
        border: `1px solid ${SD.line}`, background: SD.paperDeep,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
      onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
    >
      {/* Row 1: Direction toggle + Channel */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: `1px solid ${SD.line}` }}>
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
              padding: '6px 14px', borderRadius: 6, border: `1px solid ${SD.line}`,
              background: '#fff', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', color: SD.inkLo,
            }}
          >Cancel</button>
          <button
            onClick={handleSave}
            disabled={!summary.trim() || saving}
            style={{
              padding: '6px 14px', borderRadius: 6, border: 'none',
              background: SD.ink, color: '#fff', fontSize: 11, fontWeight: 600,
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
          cursor: 'pointer', fontSize: 11, fontWeight: 700, color: SD.tealDeep,
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
            padding: '4px 10px', borderRadius: 6, border: `1px solid ${SD.line}`,
            background: '#fff', fontSize: 11, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', color: SD.inkLo,
          }}
        >Cancel</button>
        <button
          onClick={handleSave}
          disabled={!action.trim() || saving}
          style={{
            padding: '4px 10px', borderRadius: 6, border: 'none',
            background: SD.ink, color: '#fff', fontSize: 11, fontWeight: 600,
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

function Sidebar({
  school, coaches, actionItems, completedItems, camps, schools, today, onComplete, onAddAction, onUpdateAction, onUpdateSchool, onDraft, onPrepForCall, onSetPrimary,
}: {
  school: School
  coaches: Coach[]
  actionItems: ActionItem[]
  completedItems: ActionItem[]
  camps: CampWithRelations[]
  schools: School[]
  today: string
  onComplete: (id: string) => Promise<void>
  onAddAction: (action: string, dueDate: string, owner: string) => Promise<void>
  onUpdateAction: (id: string, updates: { action?: string; due_date?: string | null }) => Promise<void>
  onUpdateSchool: (updates: Partial<School>) => Promise<void>
  onDraft: (kind: 'fresh' | 'reply') => void
  onPrepForCall: () => void
  onSetPrimary: (id: string) => Promise<unknown>
}) {
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesText, setNotesText] = useState(school.notes ?? '')
  const [editingRQ, setEditingRQ] = useState(false)
  const [editingRqLink, setEditingRqLink] = useState(false)
  const [rqLinkText, setRqLinkText] = useState(school.rq_link ?? '')
  const [editingTier, setEditingTier] = useState(false)
  const [editingAdmit, setEditingAdmit] = useState(false)
  // ── About rows — only non-null values ────────────────────────────────────────
  const aboutRows: [string, string][] = [
    ['Division',     school.division                                                            ],
    ['Conference',   school.conference                                         ?? ''],
    ['Location',     school.location                                           ?? ''],
    ['Status',       school.status                                                              ],
    ['Last contact', school.last_contact ? fmtShortDate(school.last_contact)  : '' ],
  ].filter(([, v]) => v !== '') as [string, string][]

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 16,
      position: 'sticky', top: 20,
    }}>
      {/* Coach card — coaches table if populated, legacy fallback otherwise */}
      <SidebarCard label="Coach">
        {coaches.length > 0 ? (
          // ── Coaches table records ────────────────────────────────────────────
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {coaches.map(coach => {
              const isPrimary = coach.is_primary
              // Primary email: coach.email first, then generic_team_email fallback
              const emailToShow = isPrimary
                ? (coach.email ?? school.generic_team_email ?? null)
                : null
              return (
                <div key={coach.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  {/* Avatar (primary) or dot (secondary) */}
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
                        fontSize: isPrimary ? 14 : 12, fontWeight: 700,
                        color: isPrimary ? SD.ink : SD.inkMid,
                        letterSpacing: -0.2, lineHeight: 1.3,
                      }}>{coach.name}</span>
                      {coach.needs_review && (
                        <span
                          title="This record was flagged during backfill — verify name, role, and email"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            padding: '1px 6px', borderRadius: 999,
                            background: SD.goldSoft, color: SD.goldInk,
                            fontSize: 9, fontWeight: 800, letterSpacing: 0.3,
                            textTransform: 'uppercase', flexShrink: 0,
                            border: `1px solid ${SD.goldDeep}`,
                            cursor: 'help',
                          }}
                        >Needs review</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: SD.inkLo, fontWeight: 500, marginTop: 1 }}>
                      {coach.role}
                    </div>
                    {emailToShow && (
                      <a href={`mailto:${emailToShow}`} style={{
                        display: 'block', fontSize: 11, color: SD.tealDeep,
                        textDecoration: 'none', fontWeight: 600, marginTop: 2,
                        wordBreak: 'break-all',
                      }}>{emailToShow}</a>
                    )}
                    {!isPrimary && (
                      <button
                        onClick={() => onSetPrimary(coach.id)}
                        style={{
                          marginTop: 4,
                          background: 'none', border: 'none', padding: 0,
                          fontSize: 10, fontWeight: 600, color: SD.inkMute,
                          cursor: 'pointer', fontFamily: 'inherit',
                          textDecoration: 'underline', letterSpacing: 0.1,
                        }}
                      >Set as primary</button>
                    )}
                  </div>
                </div>
              )
            })}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
              <button
                onClick={() => onDraft('fresh')}
                style={{
                  width: '100%', padding: '8px 0',
                  background: SD.ink, color: '#fff', border: 'none',
                  borderRadius: 999, fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', letterSpacing: -0.1, fontFamily: 'inherit',
                }}
              >Draft email</button>
              <button
                onClick={onPrepForCall}
                style={{
                  width: '100%', padding: '7px 0',
                  background: 'transparent', border: `1.3px solid ${SD.line2}`,
                  borderRadius: 999, fontSize: 11, fontWeight: 700, color: SD.inkMid,
                  cursor: 'pointer', letterSpacing: -0.1, fontFamily: 'inherit',
                }}
              >Prep for call</button>
            </div>
          </div>
        ) : school.head_coach ? (
          // ── Legacy fallback — parse head_coach string ────────────────────────
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {parseLegacyCoaches(school.head_coach).map((coach, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
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
                    fontSize: coach.isHead ? 14 : 12, fontWeight: 700,
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
              <button
                onClick={() => onDraft('fresh')}
                style={{
                  width: '100%', padding: '8px 0',
                  background: SD.ink, color: '#fff', border: 'none',
                  borderRadius: 999, fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', letterSpacing: -0.1, fontFamily: 'inherit',
                }}
              >Draft email</button>
              <button
                onClick={onPrepForCall}
                style={{
                  width: '100%', padding: '7px 0',
                  background: 'transparent', border: `1.3px solid ${SD.line2}`,
                  borderRadius: 999, fontSize: 11, fontWeight: 700, color: SD.inkMid,
                  cursor: 'pointer', letterSpacing: -0.1, fontFamily: 'inherit',
                }}
              >Prep for call</button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: SD.inkLo, fontStyle: 'italic' }}>No coach on file.</div>
        )}
      </SidebarCard>

      {/* About block */}
      <SidebarCard label="About">
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

          {/* RQ Status — editable with link + mark updated */}
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
                      const updates: Partial<School> = { rq_status: newStatus }
                      if (newStatus === 'Completed') updates.rq_updated_at = new Date().toISOString()
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
                  onClick={async () => await onUpdateSchool({ rq_updated_at: new Date().toISOString() })}
                  style={{
                    background: 'none', border: `1px solid ${SD.line}`, borderRadius: 4,
                    padding: '1px 6px', fontSize: 9, fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'inherit', color: SD.tealDeep,
                  }}
                >Mark updated</button>
              </div>
              {school.rq_updated_at && (
                <div style={{ fontSize: 10, color: SD.inkLo, marginTop: 2 }}>
                  Last updated: {new Date(school.rq_updated_at).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric' })}
                </div>
              )}
              {/* RQ link */}
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
                      onKeyDown={e => { if (e.key === 'Escape') setEditingRqLink(false); if (e.key === 'Enter') { onUpdateSchool({ rq_link: rqLinkText.trim() || null }); setEditingRqLink(false) } }}
                      placeholder="https://..."
                      style={{ width: 140, padding: '2px 4px', border: `1px solid ${SD.line}`, borderRadius: 4, fontSize: 10, outline: 'none' }}
                    />
                    <button onClick={() => { onUpdateSchool({ rq_link: rqLinkText.trim() || null }); setEditingRqLink(false) }}
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

          {/* Videos sent — with title + link */}
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

          {/* Notes — editable */}
          <div style={{ marginTop: 6, paddingTop: 10, borderTop: `1px solid ${SD.line}`, position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: SD.inkLo }}>Notes</div>
              {!editingNotes && (
                <button
                  onClick={() => { setNotesText(school.notes ?? ''); setEditingNotes(true) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: SD.inkLo, padding: 0, opacity: 0.6 }}
                >&#9998;</button>
              )}
            </div>
            {editingNotes ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea
                  autoFocus
                  value={notesText}
                  onChange={e => setNotesText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setEditingNotes(false) }}
                  rows={4}
                  style={{
                    width: '100%', padding: '6px 8px', border: `1px solid ${SD.line}`,
                    borderRadius: 6, fontSize: 12, fontFamily: 'inherit',
                    background: '#fff', outline: 'none', resize: 'vertical',
                    lineHeight: 1.5, boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditingNotes(false)} style={{ padding: '3px 8px', borderRadius: 4, border: `1px solid ${SD.line}`, background: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: SD.inkLo }}>Cancel</button>
                  <button onClick={async () => { await onUpdateSchool({ notes: notesText.trim() || null }); setEditingNotes(false) }} style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: SD.ink, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => { setNotesText(school.notes ?? ''); setEditingNotes(true) }}
                style={{ fontSize: 12, color: school.notes ? SD.inkMid : SD.inkLo, lineHeight: 1.55, cursor: 'pointer', fontStyle: school.notes ? 'normal' : 'italic' }}
              >{school.notes || 'Add a note'}</div>
            )}
          </div>
        </div>
      </SidebarCard>

      {/* Action items panel */}
      <SidebarCard label={`Actions${actionItems.length > 0 ? ` · ${actionItems.length}` : ''}`}>
        {actionItems.length === 0 ? (
          <div style={{ fontSize: 12, color: SD.inkLo, fontStyle: 'italic' }}>
            No open actions.
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

        {/* Add action inline form */}
        <AddActionForm onAdd={onAddAction} />

        {/* Recently completed */}
        {completedItems.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${SD.line}` }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: SD.inkLo,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              marginBottom: 8,
            }}>Recently completed</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {completedItems.map(item => (
                <div key={item.id}>
                  <div style={{
                    fontSize: 12, color: SD.inkLo,
                    textDecoration: 'line-through', lineHeight: 1.4,
                  }}>{item.action}</div>
                  <div style={{
                    fontSize: 10, color: SD.inkMute, marginTop: 1,
                  }}>
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

      {/* Camps */}
      <SidebarCamps school={school} camps={camps} schools={schools} />
    </div>
  )
}

// ─── Sidebar camps section ───────────────────────────────────────────────────

const CAMP_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  interested: { bg: '#DBEAFE', color: '#1E40AF' },
  targeted:   { bg: '#FEF3C7', color: '#92400E' },
  registered: { bg: '#D7F0ED', color: '#006A65' },
  attended:   { bg: '#F3F4F6', color: '#374151' },
  declined:   { bg: '#FEE2E2', color: '#991B1B' },
}

const CAMP_TIER_STYLE: Record<string, { bg: string; color: string }> = {
  A: { bg: '#FEE2E2', color: '#991B1B' },
  B: { bg: '#DBEAFE', color: '#1E40AF' },
  C: { bg: '#F3F4F6', color: '#374151' },
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
              fontSize: 10, fontWeight: 700, color: SD.tealDeep,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >+ Add</button>
        </div>

        {totalCount === 0 ? (
          <div style={{ fontSize: 12, color: SD.inkLo, fontStyle: 'italic' }}>
            No camps yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Hosted */}
            {hosted.length > 0 && (
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: SD.inkLo,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  marginBottom: 6,
                }}>Hosted</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {hosted.map(c => (
                    <SidebarCampRow key={c.camp.id} camp={c} onClick={() => router.push(`/camps/${c.camp.id}`)} />
                  ))}
                </div>
              </div>
            )}

            {/* Attending */}
            {attending.length > 0 && (
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: SD.inkLo,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  marginBottom: 6,
                }}>Attending</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {attending.map(c => (
                    <SidebarCampRow key={c.camp.id} camp={c} showHost onClick={() => router.push(`/camps/${c.camp.id}`)} />
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
          onCreated={(id) => { setShowAddModal(false); router.push(`/camps/${id}`) }}
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
}

export default function SchoolDetailClient({
  initialSchool,
  user,
}: {
  initialSchool: School
  user: User
}) {
  const today = todayStr()
  const [draftTarget, setDraftTarget] = useState<DraftTarget | null>(null)
  const [prepOpen, setPrepOpen]       = useState(false)

  // ── Realtime subscriptions ─────────────────────────────────────────────────
  const { schools, loading: schoolsLoading, updateSchool } = useSchools()
  const { entries: contactLog, loading: logLoading, insertContact, updateEntry, deleteEntry, snoozeEntry, dismissEntry, undoEntry } = useContactLog(initialSchool.id)
  const { items: actionItems, completedItems, loading: actionsLoading, completeItem, insertItem, updateItem } = useActionItems(initialSchool.id)
  const { coaches, setPrimary } = useCoaches(initialSchool.id)
  const { camps } = useCamps(schools)

  const loading = schoolsLoading || logLoading || actionsLoading

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

  const stage = deriveStage(school)
  const primaryCoach = coaches.find(c => c.is_primary) ?? null

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
        onTierChange={async (tier) => { await updateSchool(school.id, { category: tier as School['category'] }) }}
      />

      <ActionBar
        school={school}
        actionItems={actionItems}
        contactLog={contactLog}
        today={today}
        onDraft={(kind, entryId, channel) => setDraftTarget({ kind, replyToContactLogId: entryId, inboundChannel: channel })}
        onComplete={async (id) => { await completeItem(id) }}
      />

      {/* ── Content: timeline (left) + sidebar placeholder (right) ── */}
      <div className="detail-content" style={{
        padding: '0 clamp(16px, 4vw, 40px)',
        marginTop: 'clamp(24px, 4vw, 40px)',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 288px',
        gap: 'clamp(24px, 4vw, 48px)',
        alignItems: 'start',
        paddingBottom: 'clamp(24px, 4vw, 40px)',
      }}>
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
        <Sidebar
          school={school}
          coaches={coaches}
          actionItems={actionItems}
          completedItems={completedItems}
          camps={camps}
          schools={schools}
          today={today}
          onComplete={async (id) => { await completeItem(id) }}
          onAddAction={async (action, dueDate, owner) => {
            await insertItem({ school_id: school.id, action, owner: owner as 'Finn' | 'Randy', due_date: dueDate })
          }}
          onUpdateAction={async (id, updates) => { await updateItem(id, updates) }}
          onUpdateSchool={async (updates) => { await updateSchool(school.id, updates) }}
          onDraft={(kind) => setDraftTarget({ kind })}
          onPrepForCall={() => setPrepOpen(true)}
          onSetPrimary={setPrimary}
        />
      </div>
      <style>{`
        @media (max-width: 860px) {
          .detail-content { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Modals ── */}
      {draftTarget && primaryCoach && (
        <DraftModal
          mode={draftTarget.kind === 'reply' && draftTarget.replyToContactLogId
            ? {
                kind: 'reply',
                schoolId: school.id,
                coachId: primaryCoach.id,
                schoolName: school.name,
                coachName: primaryCoach.name,
                replyToContactLogId: draftTarget.replyToContactLogId,
                inboundChannel: draftTarget.inboundChannel,
              }
            : {
                kind: 'fresh',
                schoolId: school.id,
                coachId: primaryCoach.id,
                schoolName: school.name,
                coachName: primaryCoach.name,
              }
          }
          userId={user.id}
          onClose={() => setDraftTarget(null)}
        />
      )}
      {prepOpen && (
        <PrepForCallModal
          school={school}
          onClose={() => setPrepOpen(false)}
        />
      )}
    </div>
  )
}

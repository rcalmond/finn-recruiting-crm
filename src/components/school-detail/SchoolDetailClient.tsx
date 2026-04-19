'use client'

import { useState, useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { School, ContactLogEntry, ActionItem } from '@/lib/types'
import type { EmailType } from '@/lib/prompts'
import { useSchools, useContactLog, useActionItems } from '@/hooks/useRealtimeData'
import { deriveStage, stageLabel, STAGE_LABELS } from '@/lib/stages'
import { getRankedFeaturedAction } from '@/lib/todayLogic'
import { todayStr } from '@/lib/utils'
import DraftEmailModal from '@/components/DraftEmailModal'
import PrepForCallModal from '@/components/PrepForCallModal'

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
  school, stage, prevSchool, nextSchool,
}: {
  school: School; stage: number
  prevSchool: School | null; nextSchool: School | null
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
            <span style={{ fontSize: 11, color: SD.inkLo, fontWeight: 600 }}>
              Tier {school.category}
            </span>
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
  onDraft: (emailType: EmailType, coachMessage?: string) => void
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
          onClick={() => onDraft('follow_up')}
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
      onDraft(featured.emailType, featured.inboundEntry?.summary ?? '')
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
  | { kind: 'contact'; entry: ContactLogEntry; sortDate: string }
  | { kind: 'action';  item: ActionItem;       sortDate: string }

function toDateStr(raw: string): string { return raw.slice(0, 10) }

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
  contactLog, actionItems, school, today,
  onDraft, onComplete, onSnooze, onDismiss, onUndo,
}: {
  contactLog: ContactLogEntry[]
  actionItems: ActionItem[]
  school: School
  today: string
  onDraft: (emailType: EmailType, coachMessage?: string) => void
  onComplete: (id: string) => Promise<void>
  onSnooze: (id: string) => Promise<void>
  onDismiss: (id: string) => Promise<void>
  onUndo: (id: string) => Promise<void>
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
        !e.dismissed_at &&
        !(e.snoozed_until && e.snoozed_until > nowIso)
      )
      .forEach(e => {
        const d = toDateStr(e.date)
        if (!outbounds.some(o => toDateStr(o.date) > d)) ids.add(e.id)
      })
    return ids
  }, [contactLog])

  // Merge contact log + action items, sort newest first
  const merged = useMemo((): TLEntry[] => {
    const contacts: TLEntry[] = contactLog.map(e => ({
      kind: 'contact', entry: e, sortDate: toDateStr(e.date),
    }))
    const actions: TLEntry[] = actionItems.map(item => ({
      kind: 'action', item, sortDate: toDateStr(item.due_date ?? item.created_at),
    }))
    return [...contacts, ...actions].sort((a, b) => b.sortDate.localeCompare(a.sortDate))
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

  const sectionHeader = (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      marginBottom: 18, gap: 12,
    }}>
      <h2 style={{
        margin: 0, fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 700,
        letterSpacing: '-0.04em', color: SD.ink, fontStyle: 'italic',
      }}>Conversation.</h2>
      <button
        onClick={() => router.push(`/pipeline?school=${school.id}`)}
        style={{
          padding: '5px 12px', background: 'transparent',
          border: `1.3px solid ${SD.line2}`, borderRadius: 999,
          fontSize: 11, fontWeight: 700, color: SD.inkMid,
          cursor: 'pointer', letterSpacing: -0.1, fontFamily: 'inherit',
        }}
      >+ Log entry</button>
    </div>
  )

  if (merged.length === 0) {
    return (
      <section style={{ minWidth: 0 }}>
        {sectionHeader}
        <div style={{
          padding: '40px 24px', textAlign: 'center',
          background: SD.paperDeep, borderRadius: 14,
          border: `1px solid ${SD.line}`,
        }}>
          <div style={{ fontSize: 14, color: SD.inkLo, marginBottom: 12 }}>
            No conversation yet.
          </div>
          <button
            onClick={() => onDraft('follow_up')}
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
                }}>
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
                  {entry.summary && (
                    <div style={{
                      fontSize: 13, color: SD.inkSoft, lineHeight: 1.55,
                      marginBottom: hasActions ? 10 : 0,
                      overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%',
                    }}>{entry.summary}</div>
                  )}
                  {/* Action buttons — unreplied inbounds only */}
                  {isUnreplied && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => onDraft('follow_up', entry.summary ?? '')}
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

interface CoachEntry { name: string; role: string }

function parseCoaches(raw: string): CoachEntry[] {
  return raw
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const match = entry.match(/^(.+?)\s+[–—]\s+(.+)$/)
      if (match) return { name: match[1].trim(), role: match[2].trim() }
      return { name: entry, role: '' }
    })
}

function coachInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('')
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
  school, actionItems, today, onComplete, onPrepForCall,
}: {
  school: School
  actionItems: ActionItem[]
  today: string
  onComplete: (id: string) => Promise<void>
  onPrepForCall: () => void
}) {
  const coaches     = parseCoaches(school.head_coach ?? '')
  const headIdx     = coaches.findIndex(c => c.role.toLowerCase().includes('head'))
  const headCoachIdx = headIdx !== -1 ? headIdx : 0

  // ── About rows — only non-null values ────────────────────────────────────────
  const aboutRows: [string, string][] = [
    ['Division',     school.division                                                            ],
    ['Conference',   school.conference                                         ?? ''],
    ['Location',     school.location                                           ?? ''],
    ['Tier',         school.category                                                            ],
    ['Admit',        school.admit_likelihood                                   ?? ''],
    ['Status',       school.status                                                              ],
    ['Last contact', school.last_contact ? fmtShortDate(school.last_contact)  : '' ],
    ['RQ status',    school.rq_status                                          ?? ''],
    ['Videos sent',  school.videos_sent ? 'Yes' : 'No'                                        ],
  ].filter(([, v]) => v !== '') as [string, string][]

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 16,
      position: 'sticky', top: 20,
    }}>
      {/* Coach card */}
      <SidebarCard label="Coach">
        {coaches.length === 0 ? (
          <div style={{ fontSize: 12, color: SD.inkLo, fontStyle: 'italic' }}>No coach on file.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {coaches.map((coach, i) => {
              const isHead = i === headCoachIdx
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  {/* Avatar (head only) or small dot (assistants) */}
                  {isHead ? (
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
                      <div style={{
                        width: 5, height: 5, borderRadius: '50%', background: SD.inkMute,
                      }} />
                    </div>
                  )}
                  <div>
                    <div style={{
                      fontSize: isHead ? 14 : 12,
                      fontWeight: 700,
                      color: isHead ? SD.ink : SD.inkMid,
                      letterSpacing: -0.2, lineHeight: 1.3,
                    }}>{coach.name}</div>
                    {coach.role && (
                      <div style={{ fontSize: 11, color: SD.inkLo, fontWeight: 500, marginTop: 1 }}>
                        {coach.role}
                      </div>
                    )}
                    {isHead && school.coach_email && (
                      <a href={`mailto:${school.coach_email}`} style={{
                        display: 'block', fontSize: 11, color: SD.tealDeep,
                        textDecoration: 'none', fontWeight: 600, marginTop: 2,
                      }}>{school.coach_email}</a>
                    )}
                  </div>
                </div>
              )
            })}

            <button
              onClick={onPrepForCall}
              style={{
                width: '100%', padding: '7px 0',
                background: 'transparent',
                border: `1.3px solid ${SD.line2}`,
                borderRadius: 999,
                fontSize: 11, fontWeight: 700, color: SD.inkMid,
                cursor: 'pointer', letterSpacing: -0.1, fontFamily: 'inherit',
                marginTop: 2,
              }}
            >Prep for call</button>
          </div>
        )}
      </SidebarCard>

      {/* About block */}
      <SidebarCard label="About">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {aboutRows.map(([label, value]) => (
            <AboutRow key={label} label={label} value={value} />
          ))}
          {school.notes && (
            <div style={{
              marginTop: 6, paddingTop: 10,
              borderTop: `1px solid ${SD.line}`,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: SD.inkLo, marginBottom: 6,
              }}>Notes</div>
              <div style={{
                fontSize: 12, color: SD.inkMid, lineHeight: 1.55,
              }}>{school.notes}</div>
            </div>
          )}
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
            {actionItems.map(item => {
              const isOverdue = !!(item.due_date && item.due_date < today)
              return (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                  <input
                    type="checkbox"
                    onChange={() => onComplete(item.id)}
                    style={{
                      marginTop: 2, width: 14, height: 14,
                      cursor: 'pointer', flexShrink: 0,
                      accentColor: SD.red,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 12, color: SD.inkSoft,
                      fontWeight: 600, lineHeight: 1.4,
                    }}>{item.action}</div>
                    {item.due_date && (
                      <div style={{
                        marginTop: 2, fontSize: 10, fontWeight: 600,
                        color: isOverdue ? SD.red : SD.inkLo,
                      }}>
                        {isOverdue ? 'Overdue · ' : ''}
                        {fmtShortDate(item.due_date)}
                        {item.owner ? ` · ${item.owner}` : ''}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SidebarCard>
    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

interface DraftTarget {
  emailType: EmailType
  coachMessage?: string
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
  const { schools, loading: schoolsLoading }   = useSchools()
  // School-scoped subscriptions for contact log and action items
  const { entries: contactLog, loading: logLoading, snoozeEntry, dismissEntry, undoEntry } = useContactLog(initialSchool.id)
  const { items: actionItems, loading: actionsLoading, deleteItem } = useActionItems(initialSchool.id)

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
      />

      <ActionBar
        school={school}
        actionItems={actionItems}
        contactLog={contactLog}
        today={today}
        onDraft={(emailType, coachMessage) => setDraftTarget({ emailType, coachMessage })}
        onComplete={async (id) => { await deleteItem(id) }}
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
          today={today}
          onDraft={(emailType, coachMessage) => setDraftTarget({ emailType, coachMessage })}
          onComplete={async (id) => { await deleteItem(id) }}
          onSnooze={async (id) => { await snoozeEntry(id) }}
          onDismiss={async (id) => { await dismissEntry(id) }}
          onUndo={async (id) => { await undoEntry(id) }}
        />
        <Sidebar
          school={school}
          actionItems={actionItems}
          today={today}
          onComplete={async (id) => { await deleteItem(id) }}
          onPrepForCall={() => setPrepOpen(true)}
        />
      </div>
      <style>{`
        @media (max-width: 860px) {
          .detail-content { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Modals ── */}
      {draftTarget && (
        <DraftEmailModal
          school={school}
          userId={user.id}
          initialEmailType={draftTarget.emailType}
          initialCoachMessage={draftTarget.coachMessage}
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

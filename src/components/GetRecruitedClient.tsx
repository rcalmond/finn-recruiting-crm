'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { School, ContactLogEntry, SchoolConversationSummary, SchoolOffer, RecommendedActionCategory } from '@/lib/types'
import { useSchools, useContactLog, useActionItems, useCamps } from '@/hooks/useRealtimeData'
import { createClient } from '@/lib/supabase/client'
import { isTargetTier } from '@/lib/awaiting-reply'
import { classifySchoolRecency, SCHOOL_RECENCY_STYLE } from '@/lib/school-recency-state'
import FunnelGrid from './home/FunnelGrid'
import SyncHealthBanner from './today/SyncHealthBanner'
import type { SourceHealth } from '@/lib/ingestion-health'

// ─── Design tokens: March vocabulary ──────────────────────────────────────────

const M = {
  paper:     '#F6F1E8',
  cardWhite: '#FFFDF9',
  ink:       '#0E0E0E',
  inkMid:    '#4A4A4A',
  inkLo:     '#7A7570',
  inkMute:   '#A8A39B',
  line:      '#E2DBC9',
  lineWarm:  '#DDD5C3',
  rust:      '#B5502F',
  rustSoft:  '#D4815F',
  rustBg:    '#FAF0EA',
  charcoal:  '#2E2B28',
  charcoalMid: '#3D3A36',
  cream:     '#F6F1E8',
  teal:      '#00B2A9',
  tealDeep:  '#006A65',
}

const CATEGORY_STRIPE: Record<RecommendedActionCategory, string> = {
  reply:     '#D03A2E',
  follow_up: '#E8A33C',
  check_in:  '#D4A017',
  introduce: '#1E40AF',
  new_topic: '#1E40AF',
  wait:      '#9CA3A8',
}

// ─── pickDailyPriority ────────────────────────────────────────────────────────
//
// Deterministic rule-based priority picker. Precedence:
//   1. School with an OPEN offer received in the last 14 days — BYPASSES
//      wait exclusion (offer schools can win the priority slot even when
//      their summary category is 'wait')
//   2. recommended_action.category='reply' with the oldest unanswered inbound
//   3. follow_up whose description references time-sensitive terms
//   4. Most recent HOT school (classifySchoolRecency = 'hot')
//
// allEligible = all A/B/C non-Inactive schools (INCLUDING wait-category).
// nonWaitSchools = the visible queue (wait excluded). Rule 1 searches
// allEligible; rules 2-4 search nonWaitSchools only.

function pickDailyPriority(
  allEligible: School[],
  nonWaitSchools: School[],
  summaryMap: Map<string, SchoolConversationSummary>,
  offers: SchoolOffer[],
  contactLog: ContactLogEntry[],
): string | null {
  const today = new Date()
  const allIds = new Set(allEligible.map(s => s.id))

  // Rule 1: Open offer received in last 14 days — searches ALL eligible, bypasses wait
  const recentOpenOffer = offers.find(o => {
    if (o.status !== 'open' || !o.received_on) return false
    if (!allIds.has(o.school_id)) return false
    const daysAgo = Math.floor((today.getTime() - new Date(o.received_on).getTime()) / 86400000)
    return daysAgo <= 14
  })
  if (recentOpenOffer) return recentOpenOffer.school_id

  if (nonWaitSchools.length === 0) return null

  // Rule 2: Oldest reply-category school
  const replySchools = nonWaitSchools.filter(s => {
    const sum = summaryMap.get(s.id)
    return sum?.recommended_action.category === 'reply'
  })
  if (replySchools.length > 0) {
    const sorted = [...replySchools].sort((a, b) => {
      const aE = contactLog.filter(e => e.school_id === a.id)
      const bE = contactLog.filter(e => e.school_id === b.id)
      const aMax = aE.length ? aE.reduce((m, e) => e.sent_at > m ? e.sent_at : m, '') : ''
      const bMax = bE.length ? bE.reduce((m, e) => e.sent_at > m ? e.sent_at : m, '') : ''
      return aMax.localeCompare(bMax)
    })
    return sorted[0].id
  }

  // Rule 3: follow_up with time-sensitive terms
  const TIME_TERMS = /deadline|camp|awaiting|date|window|opens|closes|register|before/i
  const followUpSchools = nonWaitSchools.filter(s => {
    const sum = summaryMap.get(s.id)
    return sum?.recommended_action.category === 'follow_up' &&
      TIME_TERMS.test(sum.recommended_action.description)
  })
  if (followUpSchools.length > 0) return followUpSchools[0].id

  // Rule 4: Most recent HOT school
  const hotSchools = nonWaitSchools.filter(s => {
    const cl = contactLog.filter(e => e.school_id === s.id)
    const rec = classifySchoolRecency(s, cl)
    return rec.state === 'hot'
  })
  if (hotSchools.length > 0) {
    const sorted = [...hotSchools].sort((a, b) => {
      const aE = contactLog.filter(e => e.school_id === a.id)
      const bE = contactLog.filter(e => e.school_id === b.id)
      const aMax = aE.length ? aE.reduce((m, e) => e.sent_at > m ? e.sent_at : m, '') : ''
      const bMax = bE.length ? bE.reduce((m, e) => e.sent_at > m ? e.sent_at : m, '') : ''
      return bMax.localeCompare(aMax)
    })
    return sorted[0].id
  }

  return nonWaitSchools[0].id
}

// ─── Ghost numeral ────────────────────────────────────────────────────────────

function GhostNumeral({ n, color, opacity }: { n: number | string; color: string; opacity: number }) {
  return (
    <div style={{
      position: 'absolute', top: -14, right: 6,
      fontSize: 110, fontWeight: 800, fontStyle: 'italic',
      color, opacity, lineHeight: 1, pointerEvents: 'none',
      userSelect: 'none', letterSpacing: '-0.06em',
    }}>
      {n}
    </div>
  )
}

// ─── Eyebrow ──────────────────────────────────────────────────────────────────

function Eyebrow({ text, color }: { text: string; color?: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
      letterSpacing: '0.1em', color: color ?? M.inkMute,
      marginBottom: 6,
    }}>
      {text}
    </div>
  )
}

// ─── Offer deadline fragment (A2: passed-date hardening) ─────────────────────
//
// Parses month names from key_dates. If the date has PASSED, flips the language
// from future tense ("opens Aug 1") to past/present ("window open since Aug 1").
// Never says "opens" for a date that has already happened.

function findNearOfferDeadline(offers: SchoolOffer[]): string | null {
  const today = new Date()
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const currentMonth = today.getMonth()
  const nearMonths = [months[currentMonth], months[(currentMonth + 1) % 12]]

  for (const o of offers) {
    if (o.status !== 'open' || !o.key_dates) continue
    const lower = o.key_dates.toLowerCase()
    for (const m of nearMonths) {
      if (lower.includes(m)) {
        const idx = lower.indexOf(m)
        const start = Math.max(0, o.key_dates.lastIndexOf(';', idx) + 1)
        const end = o.key_dates.indexOf(';', idx)
        let fragment = o.key_dates.slice(start, end > 0 ? end : undefined).trim()
        const schoolName = o.school?.short_name || o.school?.name
        if (!schoolName || !fragment) continue

        // A2: Detect if the mentioned date has passed
        // Try to extract a date like "Aug 1" or "Oct 1" from the fragment
        const dateMatch = fragment.match(/(\w{3,9})\s+(\d{1,2})/i)
        if (dateMatch) {
          const monthIdx = months.indexOf(dateMatch[1].toLowerCase().slice(0, 3))
          if (monthIdx >= 0) {
            const day = parseInt(dateMatch[2])
            const mentionedDate = new Date(today.getFullYear(), monthIdx, day)
            if (mentionedDate < today) {
              // Date has passed — rewrite "opens" → "open since"
              fragment = fragment
                .replace(/\bopens\b/gi, 'open since')
                .replace(/\bcloses\b/gi, 'closed')
            }
          }
        }

        return `${schoolName}: ${fragment}`
      }
    }
  }
  return null
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GetRecruitedClient({
  user,
  ingestionHealth,
}: {
  user: User
  ingestionHealth?: SourceHealth[]
}) {
  const { schools, loading: schoolsLoading } = useSchools()
  const { entries: contactLog, loading: logLoading } = useContactLog()
  const { items: actionItems, loading: actionsLoading } = useActionItems()
  const { camps, loading: campsLoading } = useCamps(schools)
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const gridRef = useRef<HTMLDivElement>(null)

  const loading = schoolsLoading || logLoading || actionsLoading || campsLoading

  // ── Conversation summaries ────────────────────────────────────────────────
  const [summaries, setSummaries] = useState<SchoolConversationSummary[]>([])

  useEffect(() => {
    let cancelled = false
    supabase.from('school_conversation_summary').select('*').then(({ data }) => {
      if (!cancelled && data) setSummaries(data as SchoolConversationSummary[])
    })
    return () => { cancelled = true }
  }, [supabase])

  const summaryMap = useMemo(
    () => new Map(summaries.map(s => [s.school_id, s])),
    [summaries]
  )

  // ── Offers (for priority picker + deadline fragment) ─────────────────────
  const [offers, setOffers] = useState<(SchoolOffer & { school?: { id: string; name: string; short_name: string | null } })[]>([])

  useEffect(() => {
    let cancelled = false
    supabase.from('school_offers')
      .select('*, school:schools(id, name, short_name)')
      .eq('status', 'open')
      .then(({ data }) => {
        if (!cancelled && data) setOffers(data as typeof offers)
      })
    return () => { cancelled = true }
  }, [supabase])

  // ── School cards: active A/B/C sorted by recency ──────────────────────────
  const [showAll, setShowAll] = useState(false)

  const schoolContactMap = useMemo(() => {
    const map = new Map<string, ContactLogEntry[]>()
    for (const e of contactLog) {
      if (!e.school_id) continue
      if (!map.has(e.school_id)) map.set(e.school_id, [])
      map.get(e.school_id)!.push(e)
    }
    return map
  }, [contactLog])

  const { allEligible, nonWaitSchools, waitSchools } = useMemo(() => {
    const eligible = schools.filter(s => isTargetTier(s) && s.status !== 'Inactive')
    const sortByRecency = (list: School[]) => [...list].sort((a, b) => {
      const aEntries = schoolContactMap.get(a.id) ?? []
      const bEntries = schoolContactMap.get(b.id) ?? []
      const aLatest = aEntries.length > 0 ? aEntries.reduce((max, e) => e.sent_at > max ? e.sent_at : max, '') : ''
      const bLatest = bEntries.length > 0 ? bEntries.reduce((max, e) => e.sent_at > max ? e.sent_at : max, '') : ''
      return bLatest.localeCompare(aLatest)
    })
    const nonWait = sortByRecency(eligible.filter(s => {
      const summary = summaryMap.get(s.id)
      return !summary || summary.recommended_action.category !== 'wait'
    }))
    const wait = sortByRecency(eligible.filter(s => {
      const summary = summaryMap.get(s.id)
      return summary?.recommended_action.category === 'wait'
    }))
    return { allEligible: eligible, nonWaitSchools: nonWait, waitSchools: wait }
  }, [schools, schoolContactMap, summaryMap])

  // ── Priority pick (A1: rule 1 bypasses wait exclusion) ────────────────────
  const priorityId = useMemo(
    () => pickDailyPriority(allEligible, nonWaitSchools, summaryMap, offers, contactLog),
    [allEligible, nonWaitSchools, summaryMap, offers, contactLog]
  )

  // A1: If priority school is in waitSchools (not in nonWaitSchools), inject it
  const priorityIsWait = priorityId ? !nonWaitSchools.some(s => s.id === priorityId) : false
  const prioritySchool = priorityId ? schools.find(s => s.id === priorityId) ?? null : null
  const prioritySummary = priorityId ? summaryMap.get(priorityId) ?? null : null
  const priorityRecency = prioritySchool
    ? classifySchoolRecency(prioritySchool, schoolContactMap.get(prioritySchool.id) ?? [])
    : null
  const priorityRecencyStyle = priorityRecency?.state ? SCHOOL_RECENCY_STYLE[priorityRecency.state] : null

  // Secondary schools = non-wait minus priority
  const secondarySchools = useMemo(
    () => nonWaitSchools.filter(s => s.id !== priorityId),
    [nonWaitSchools, priorityId]
  )
  const defaultSecondaries = secondarySchools.slice(0, 4)

  // Total active = nonWait + priority (if injected from wait) + wait
  const allActiveCount = nonWaitSchools.length + waitSchools.length + (priorityIsWait ? 0 : 0)
  // Queue has content if non-wait has items OR priority was injected from wait
  const hasQueue = nonWaitSchools.length > 0 || priorityId !== null

  // ── HOT count for masthead ────────────────────────────────────────────────
  const hotCount = useMemo(() => {
    return schools.filter(s => {
      if (!isTargetTier(s) || s.status === 'Inactive') return false
      const cl = schoolContactMap.get(s.id) ?? []
      const rec = classifySchoolRecency(s, cl)
      return rec.state === 'hot'
    }).length
  }, [schools, schoolContactMap])

  const offerDeadline = useMemo(() => findNearOfferDeadline(offers), [offers])

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: M.inkLo, fontSize: 14,
      }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: M.paper,
      fontFamily: "'Inter', -apple-system, sans-serif",
      paddingBottom: 80,
    }}>
      {ingestionHealth && <SyncHealthBanner sources={ingestionHealth} />}

      {/* Masthead */}
      <div style={{ padding: '24px clamp(28px, 4vw, 56px) 4px' }}>
        <h1 style={{
          margin: 0,
          fontSize: 'clamp(56px, 7vw, 88px)',
          fontWeight: 700, letterSpacing: '-0.04em',
          color: M.ink, lineHeight: 0.95, fontStyle: 'italic',
        }}>Get Recruited.</h1>

        {/* Status line */}
        <div style={{ margin: '14px 0 0', display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          {hotCount > 0 ? (
            <Link href="/schools?signal=hot" style={{
              fontSize: 15, fontWeight: 650, color: M.rust,
              textDecoration: 'none', letterSpacing: '-0.01em',
            }}>
              {hotCount} school{hotCount !== 1 ? 's' : ''} awaiting your response →
            </Link>
          ) : (
            <span style={{ fontSize: 15, fontWeight: 450, color: M.inkMute, letterSpacing: '-0.01em' }}>
              Nothing waiting on you
            </span>
          )}
        </div>

        {/* Offer deadline notice (A2: passed-date aware) */}
        {offerDeadline && (
          <div style={{
            margin: '8px 0 0', padding: '6px 0',
            fontSize: 13, fontWeight: 600, color: M.rust,
            letterSpacing: '-0.01em',
          }}>
            · {offerDeadline}
          </div>
        )}
      </div>

      {/* Main content */}
      <div style={{ padding: '0 clamp(28px, 4vw, 56px)', maxWidth: 900 }}>

        {/* ── Queue section ──────────────────────────────────────── */}
        <section style={{ marginBottom: 36 }}>
          <Eyebrow text="QUEUE" color={M.rust} />
          <h2 style={{
            margin: '0 0 18px', fontSize: 'clamp(18px, 2.5vw, 22px)', fontWeight: 700,
            letterSpacing: '-0.03em', color: M.ink, fontStyle: 'italic',
          }}>Up next.</h2>

          {!hasQueue ? (
            /* ── Zero state: Caught up ──────────────────────────── */
            <div style={{
              background: M.charcoal, borderRadius: 14,
              padding: 'clamp(28px, 4vw, 40px)',
              position: 'relative', overflow: 'hidden',
            }}>
              <GhostNumeral n="0" color="#fff" opacity={0.08} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 16, color: M.teal }}>✓</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: M.teal, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    All clear
                  </span>
                </div>
                <h3 style={{
                  margin: '0 0 8px', fontSize: 22, fontWeight: 700,
                  color: M.cream, fontStyle: 'italic', letterSpacing: '-0.03em',
                }}>
                  Caught up.
                </h3>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#A8A39B', lineHeight: 1.6 }}>
                  Nothing pressing right now. The board below is still worth a scan.
                </p>
                <button
                  onClick={() => gridRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  style={{
                    all: 'unset', cursor: 'pointer',
                    padding: '7px 16px', fontSize: 12, fontWeight: 650,
                    color: M.cream, border: `1.5px solid ${M.cream}`,
                    borderRadius: 999, letterSpacing: '-0.01em',
                  }}
                >
                  Scan the board →
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* ── Priority card ──────────────────────────────────── */}
              {prioritySchool && prioritySummary && (
                <div
                  onClick={() => router.push(`/schools/${prioritySchool.id}`)}
                  style={{
                    background: M.cardWhite,
                    border: `1px solid ${M.lineWarm}`,
                    borderLeft: `6px solid ${M.rust}`,
                    borderRadius: '0 12px 12px 0',
                    padding: '18px 20px',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 3px 12px rgba(0,0,0,0.08)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
                >
                  <GhostNumeral n="1" color={M.rust} opacity={0.09} />
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                        letterSpacing: '0.08em', color: M.rust,
                      }}>
                        Priority №1 · {priorityRecencyStyle?.label ?? ''}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: M.inkMute }}>
                        {prioritySchool.short_name || prioritySchool.name}
                      </span>
                    </div>

                    <h3 style={{
                      margin: '0 0 6px', fontSize: 16, fontWeight: 700,
                      color: M.ink, fontStyle: 'italic', letterSpacing: '-0.02em',
                      lineHeight: 1.3,
                    }}>
                      {prioritySummary.recommended_action.description}
                    </h3>

                    <p style={{ margin: '0 0 12px', fontSize: 13, color: M.inkMid, lineHeight: 1.55 }}>
                      {prioritySummary.summary}
                    </p>

                    <button
                      onClick={e => { e.stopPropagation(); router.push(`/schools/${prioritySchool.id}`) }}
                      style={{
                        all: 'unset', cursor: 'pointer',
                        padding: '7px 16px', fontSize: 12, fontWeight: 700,
                        color: '#fff', background: M.rust,
                        borderRadius: 999, letterSpacing: '-0.01em',
                      }}
                    >
                      {prioritySummary.recommended_action.category === 'reply' ? 'Draft reply' :
                       prioritySummary.recommended_action.category === 'follow_up' ? 'Follow up' :
                       'Open school'} →
                    </button>
                  </div>
                </div>
              )}

              {/* ── Secondary cards ────────────────────────────────── */}
              {(showAll ? secondarySchools : defaultSecondaries).map((school, idx) => {
                const summary = summaryMap.get(school.id)
                const cl = schoolContactMap.get(school.id) ?? []
                const recency = classifySchoolRecency(school, cl)
                const recencyStyle = recency.state ? SCHOOL_RECENCY_STYLE[recency.state] : null
                const stripeColor = summary ? CATEGORY_STRIPE[summary.recommended_action.category] ?? M.inkMute : M.inkMute
                const ghostNum = idx + 2

                return (
                  <div
                    key={school.id}
                    onClick={() => router.push(`/schools/${school.id}`)}
                    style={{
                      background: M.cardWhite,
                      border: `1px solid ${M.lineWarm}`,
                      borderLeft: `3px solid ${stripeColor}`,
                      borderRadius: '0 12px 12px 0',
                      padding: '14px 18px',
                      cursor: 'pointer',
                      position: 'relative',
                      overflow: 'hidden',
                      transition: 'box-shadow 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
                  >
                    <GhostNumeral n={ghostNum} color={M.ink} opacity={0.04} />
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: M.ink }}>
                          {school.short_name || school.name}
                        </span>
                        {recencyStyle && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 6,
                            background: recencyStyle.bgColor, color: recencyStyle.textColor,
                            whiteSpace: 'nowrap',
                          }}>
                            {recencyStyle.label}
                          </span>
                        )}
                      </div>
                      {summary && (
                        <p style={{ margin: '6px 0 0', fontSize: 12, color: M.inkMid, lineHeight: 1.5 }}>
                          {summary.recommended_action.description}
                        </p>
                      )}
                      {summary && (
                        <div style={{ marginTop: 10 }}>
                          <button
                            onClick={e => { e.stopPropagation(); router.push(`/schools/${school.id}`) }}
                            style={{
                              all: 'unset', cursor: 'pointer',
                              padding: '5px 12px', fontSize: 11, fontWeight: 650,
                              color: M.inkLo, border: `1.3px solid ${M.lineWarm}`,
                              borderRadius: 999, letterSpacing: '-0.01em',
                            }}
                          >
                            Open school →
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {showAll && waitSchools.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 4px' }}>
                    <div style={{ flex: 1, height: 1, background: M.inkMute, opacity: 0.3 }} />
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: M.inkMute, whiteSpace: 'nowrap' }}>Waiting on coaches</span>
                    <div style={{ flex: 1, height: 1, background: M.inkMute, opacity: 0.3 }} />
                  </div>
                  {waitSchools.filter(s => s.id !== priorityId).map(school => {
                    const summary = summaryMap.get(school.id)
                    const stripeColor = summary ? CATEGORY_STRIPE[summary.recommended_action.category] ?? M.inkMute : M.inkMute
                    return (
                      <div key={school.id} onClick={() => router.push(`/schools/${school.id}`)} style={{
                        background: M.cardWhite, border: `1px solid ${M.lineWarm}`,
                        borderLeft: `3px solid ${stripeColor}`, borderRadius: '0 12px 12px 0',
                        padding: '14px 18px', cursor: 'pointer', opacity: 0.7,
                      }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: M.ink }}>{school.short_name || school.name}</span>
                        {summary && <p style={{ margin: '4px 0 0', fontSize: 12, color: M.inkMid, lineHeight: 1.5 }}>{summary.recommended_action.description}</p>}
                      </div>
                    )
                  })}
                </>
              )}

              {allActiveCount > (defaultSecondaries.length + 1) && (
                <button onClick={() => setShowAll(v => !v)} style={{
                  marginTop: 4, padding: '7px 16px', background: 'transparent',
                  border: `1.3px solid ${M.inkMute}`, borderRadius: 999,
                  fontSize: 12, fontWeight: 600, color: M.inkLo, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {showAll ? 'Show less' : `Show all (${allActiveCount})`}
                </button>
              )}
            </div>
          )}
        </section>

        <div ref={gridRef}>
          <FunnelGrid schools={schools} contactLog={contactLog} />
        </div>
      </div>
    </div>
  )
}

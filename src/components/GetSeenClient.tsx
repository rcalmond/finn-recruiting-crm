'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useSchools } from '@/hooks/useRealtimeData'
import { computeReelCoverage } from '@/lib/strategic-prompts'
import BatchReelModal from '@/components/today/BatchReelModal'
import type { UpcomingCampItem, TimelineEventItem } from '@/app/(app)/get-seen/page'
import type { CalendarEventKind } from '@/lib/types'

// Timeline DATA colors — camp = green (filled = registered), unchanged semantics.
const GREEN = { accent: '#2D6A4F', accentSoft: '#D7EFE0', accentDeep: '#1B4332' }
// Page CHROME — petrol, the Get Seen jewel accent (first in-app jewel migration).
const PETROL = { accent: '#0E5F6B', soft: '#CDE7EA', deep: '#083F47' }
const SD = {
  paper: '#F6F1E8', ink: '#0E0E0E', inkMid: '#4A4A4A', inkLo: '#7A7570',
  inkMute: '#A8A39B', line: '#E2DBC9', cream: '#F6F1E8',
  rust: '#B5502F', rustSoft: '#FAF0EA', amber: '#D4A017', event: '#5B7A99', eventSoft: '#E7EDF3',
}

const WINDOW_DAYS = 70 // 10 weeks

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}
function formatShortDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function daysOutText(d: number): string {
  if (d <= 0) return 'today'
  if (d === 1) return 'tomorrow'
  return `${d}d`
}
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
function ageShort(n: number): string {
  if (n <= 0) return 'today'
  if (n < 7) return `${n}d ago`
  if (n < 28) return `${Math.round(n / 7)}w ago`
  if (n < 365) return `${Math.round(n / 30)}mo ago`
  return `${Math.round(n / 365)}y ago`
}
function freshnessColor(days: number): string {
  if (days <= 30) return GREEN.accent
  if (days <= 90) return SD.amber
  return SD.rust
}

// ─── Merged model ──────────────────────────────────────────────────────────────

type MergedItem = {
  id: string
  source: 'camp' | 'event'
  kind: 'camp' | CalendarEventKind
  label: string
  start_date: string
  end_date: string | null
  d: number
  finn_status?: string | null
  location?: string | null
  href?: string
}

function buildMerged(camps: UpcomingCampItem[], events: TimelineEventItem[]): MergedItem[] {
  const fromCamps: MergedItem[] = camps.map(c => ({
    id: c.id, source: 'camp', kind: 'camp',
    label: c.host_school_short_name || c.host_school_name,
    start_date: c.start_date,
    end_date: c.end_date && c.end_date !== c.start_date ? c.end_date : null,
    d: daysUntil(c.start_date),
    finn_status: c.finn_status, href: '/camps',
  }))
  const fromEvents: MergedItem[] = events.map(e => ({
    id: e.id, source: 'event', kind: e.kind,
    label: e.name, start_date: e.start_date, end_date: e.end_date,
    d: daysUntil(e.start_date), location: e.location,
  }))
  return [...fromCamps, ...fromEvents].sort((a, b) => a.start_date.localeCompare(b.start_date))
}

// ─── Next-move (merged) — the single page message (no status line) ──────────────

function getNextMove(items: MergedItem[], activeCampaignCount: number): { headline: string; body: string; href: string; buttonText: string } {
  const n = items[0]
  if (n && n.kind === 'outreach_moment') {
    return {
      headline: `${n.label} — ${n.d <= 0 ? 'today' : n.d === 1 ? 'tomorrow' : `${n.d} days out`}.`,
      body: 'A send moment is coming up. Line up which schools it targets and have your material ready before the date.',
      href: '/camps', buttonText: 'Open Events →',
    }
  }
  if (n) {
    const isCamp = n.source === 'camp'
    return {
      headline: `${n.label} — ${n.d <= 0 ? 'today' : n.d === 1 ? 'tomorrow' : `${n.d} days out`}.`,
      body: isCamp
        ? 'Your nearest event on the calendar. Review the coaching staff and prep your intro.'
        : 'A showcase or tournament is coming up. Confirm your attendance and note which coaches will be there.',
      href: '/camps', buttonText: 'Open Camps →',
    }
  }
  return {
    headline: 'Plan your fall showcase circuit.',
    body: 'Nothing upcoming. Fall ID camps and showcases are your next exposure window — build the schedule now.',
    href: activeCampaignCount > 0 ? '/campaigns' : '/camps',
    buttonText: activeCampaignCount > 0 ? 'Open Campaigns →' : 'Open Camps →',
  }
}

// ─── Timeline glyphs (DATA colors — unchanged) ──────────────────────────────────

function CampDot({ registered, targeted }: { registered: boolean; targeted: boolean }) {
  return <div style={{
    width: 12, height: 12, borderRadius: '50%',
    background: registered ? GREEN.accent : 'transparent',
    border: `2px solid ${registered || targeted ? GREEN.accent : SD.inkMute}`,
  }} />
}
function EventDot() {
  return <div style={{ width: 11, height: 11, borderRadius: '50%', background: SD.event, border: `2px solid ${SD.event}` }} />
}
function SendGlyph() {
  return (
    <div style={{
      width: 18, height: 18, borderRadius: 5, background: SD.rustSoft, border: `1.5px solid ${SD.rust}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: SD.rust, fontSize: 11, fontWeight: 900, lineHeight: 1,
    }}>↗</div>
  )
}
function ItemGlyph({ it }: { it: MergedItem }) {
  if (it.kind === 'outreach_moment') return <SendGlyph />
  if (it.source === 'camp') return <CampDot registered={it.finn_status === 'registered'} targeted={it.finn_status === 'targeted'} />
  return <EventDot />
}

// ─── Desktop timeline (proportional, TODAY-anchored) ────────────────────────────

function DesktopTimeline({ items, onItemClick }: { items: MergedItem[]; onItemClick: (it: MergedItem) => void }) {
  const clampPct = (d: number) => Math.max(0, Math.min(WINDOW_DAYS, d)) / WINDOW_DAYS * 100
  return (
    <div className="gs-timeline-desktop" style={{ position: 'relative', height: 156, marginTop: 8 }}>
      <div style={{ position: 'absolute', top: 0, left: 8, right: 8, bottom: 0 }}>
        <div style={{ position: 'absolute', top: 78, left: 0, right: 0, height: 2, background: SD.line, borderRadius: 1 }} />
        {[2, 4, 6, 8, 10].map(w => (
          <div key={w} style={{ position: 'absolute', top: 74, left: `${w / 10 * 100}%` }}>
            <div style={{ width: 1, height: 10, background: SD.line }} />
            <div style={{ fontSize: 8, color: SD.inkMute, marginTop: 2, transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>wk {w}</div>
          </div>
        ))}
        <div style={{ position: 'absolute', top: 62, left: 0, transform: 'translateX(-50%)', textAlign: 'center' }}>
          <div style={{ width: 2, height: 32, background: SD.ink, margin: '0 auto' }} />
          <div style={{ fontSize: 8, fontWeight: 800, color: SD.ink, letterSpacing: '0.08em', marginTop: 2 }}>TODAY</div>
        </div>

        {items.map((it, i) => {
          const above = i % 2 === 0
          const isRange = !!it.end_date && it.end_date !== it.start_date
          const emphasized = i === 0
          const startPct = clampPct(it.d)
          const endPct = isRange ? clampPct(daysUntil(it.end_date!)) : startPct
          const widthPct = Math.max(2, endPct - startPct)
          return (
            <div key={`${it.source}-${it.id}`}>
              {isRange ? (
                <div onClick={() => onItemClick(it)} style={{
                  position: 'absolute', top: 74, left: `${startPct}%`, width: `${widthPct}%`,
                  height: 8, borderRadius: 4, cursor: 'pointer',
                  background: it.source === 'camp' ? GREEN.accent : it.kind === 'outreach_moment' ? SD.rust : SD.event,
                  opacity: it.source === 'camp' && it.finn_status !== 'registered' ? 0.55 : 0.85,
                }} />
              ) : (
                <div onClick={() => onItemClick(it)} style={{ position: 'absolute', top: 72, left: `${startPct}%`, transform: 'translateX(-50%)', cursor: 'pointer' }}>
                  <ItemGlyph it={it} />
                </div>
              )}
              <div onClick={() => onItemClick(it)} style={{
                position: 'absolute', left: `${startPct}%`,
                transform: isRange ? 'none' : 'translateX(-50%)',
                width: 100, textAlign: isRange ? 'left' : 'center', cursor: 'pointer',
                ...(above ? { bottom: 92 } : { top: 92 }),
              }}>
                <div style={{
                  fontSize: emphasized ? 12 : 10.5, fontWeight: emphasized ? 800 : 700,
                  color: SD.ink, lineHeight: 1.15, letterSpacing: '-0.01em',
                  overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>{it.label}</div>
                <div style={{ fontSize: 9, color: SD.inkLo }}>{formatShortDate(it.start_date)}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: it.d <= 3 ? (it.kind === 'outreach_moment' ? SD.rust : GREEN.accent) : SD.inkMute }}>
                  {daysOutText(it.d)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Mobile stacked list ────────────────────────────────────────────────────────

const KIND_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  camp:            { label: 'Camp',       bg: GREEN.accentSoft, color: GREEN.accentDeep },
  showcase:        { label: 'Showcase',   bg: SD.eventSoft, color: '#33506E' },
  tournament:      { label: 'Tournament', bg: SD.eventSoft, color: '#33506E' },
  outreach_moment: { label: 'Send',       bg: SD.rustSoft, color: SD.rust },
  other:           { label: 'Event',      bg: '#F3F4F6', color: '#374151' },
}

function MobileTimeline({ items, onItemClick }: { items: MergedItem[]; onItemClick: (it: MergedItem) => void }) {
  return (
    <div className="gs-timeline-mobile" style={{ display: 'none', marginTop: 8 }}>
      {items.map((it, i) => {
        const badge = KIND_BADGE[it.kind] ?? KIND_BADGE.other
        const isRange = !!it.end_date && it.end_date !== it.start_date
        return (
          <div key={`${it.source}-${it.id}`} onClick={() => onItemClick(it)} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${SD.line}`, cursor: 'pointer',
          }}>
            <div style={{ width: 24, display: 'flex', justifyContent: 'center', flexShrink: 0 }}><ItemGlyph it={it} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: badge.bg, color: badge.color, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{badge.label}</span>
                <span style={{ fontSize: 13, fontWeight: i === 0 ? 800 : 650, color: SD.ink }}>{it.label}</span>
              </div>
              <div style={{ fontSize: 11, color: SD.inkLo, marginTop: 1 }}>
                {isRange ? `${formatShortDate(it.start_date)}–${formatShortDate(it.end_date!)}` : formatShortDate(it.start_date)}
                {it.location ? ` · ${it.location}` : ''}
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: it.d <= 3 ? (it.kind === 'outreach_moment' ? SD.rust : GREEN.accent) : SD.inkMute, flexShrink: 0 }}>
              {daysOutText(it.d)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Legend() {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14, fontSize: 11, color: SD.inkLo }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: GREEN.accent }} /> Camp (filled = registered)
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: SD.event }} /> Showcase / tournament
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: SD.rust }}>↗</span> Outreach send
      </span>
    </div>
  )
}

// ─── Layout primitives ──────────────────────────────────────────────────────────

function ZoneHeader({ title, href, linkText }: { title: string; href?: string; linkText?: string }) {
  return (
    <div style={{ marginBottom: 16, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 'clamp(23px, 3.2vw, 30px)', fontWeight: 700, letterSpacing: '-0.03em', color: SD.ink, fontStyle: 'italic' }}>{title}</h2>
      {href && <Link href={href} style={{ fontSize: 12, fontWeight: 600, color: PETROL.accent, textDecoration: 'none', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{linkText} →</Link>}
    </div>
  )
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div style={{ background: '#fff', border: `1px solid ${SD.line}`, borderRadius: 14, padding: 'clamp(18px, 2.5vw, 24px)' }}>{children}</div>
}

// Kit-card frame — equal-weight exposure-path cards (matches Get Ready).
const TOOL_CARD: React.CSSProperties = {
  background: '#fff', border: `1px solid ${SD.line}`, borderRadius: 14,
  padding: 'clamp(18px, 2.4vw, 22px)', minHeight: 200, height: '100%',
  display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
}
function ToolCard({ title, href, linkText, children }: { title: string; href?: string; linkText?: string; children: React.ReactNode }) {
  return (
    <div style={TOOL_CARD}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: SD.ink, fontStyle: 'italic' }}>{title}</h3>
        {href && <Link href={href} style={{ fontSize: 12, fontWeight: 600, color: PETROL.accent, textDecoration: 'none', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{linkText} →</Link>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>{children}</div>
    </div>
  )
}

const pillLink: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
  background: PETROL.accent, color: '#fff', borderRadius: 999, fontSize: 12, fontWeight: 650,
  textDecoration: 'none', letterSpacing: '-0.01em',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GetSeenClient({
  upcomingCamps, upcomingEvents, activeCampaignCount, userId, coachStats,
}: {
  upcomingCamps: UpcomingCampItem[]
  upcomingEvents: TimelineEventItem[]
  activeCampaignCount: number
  userId: string
  coachStats: { total: number; needsReview: number }
}) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { schools } = useSchools()

  const merged = buildMerged(upcomingCamps, upcomingEvents)
  const nextMove = getNextMove(merged, activeCampaignCount)
  const onItemClick = () => router.push('/camps')

  // ── Film machinery (resurrected) — current reel + batch coverage ──────────
  const [reelUrl, setReelUrl] = useState<string | null>(null)
  const [reelTitle, setReelTitle] = useState<string | null>(null)
  const [reelAgeDays, setReelAgeDays] = useState<number | null>(null)
  const [batchSentIds, setBatchSentIds] = useState<Set<string>>(new Set())
  const [reelModalOpen, setReelModalOpen] = useState(false)

  useEffect(() => {
    supabase.from('assets')
      .select('url, name, created_at')
      .eq('type', 'highlight_reel').eq('is_current', true)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        const d = data as { url: string | null; name: string | null; created_at: string } | null
        const url = d?.url ?? null
        setReelUrl(url)
        setReelTitle(d?.name ?? null)
        setReelAgeDays(d?.created_at ? daysSince(d.created_at) : null)
        if (url) {
          supabase.from('batch_reel_sends')
            .select('school_id').eq('reel_url', url).in('sent_via', ['Email', 'Sports Recruits'])
            .then(({ data: sends }) => setBatchSentIds(new Set((sends ?? []).map((r: { school_id: string }) => r.school_id))))
        }
      })
  }, [supabase])

  const loaded = schools.length > 0
  const activeSchools = schools.filter(s => s.category !== 'Nope' && s.status !== 'Inactive')

  // RQ metric (active A/B/C)
  const rqComplete = activeSchools.filter(s => s.rq_status === 'Completed')
  const rqNotComplete = activeSchools.filter(s => s.rq_status !== 'Completed')

  // Reel coverage — reuse the reel_coverage prompt computation (A/B tier).
  const cov = computeReelCoverage(schools, reelUrl, batchSentIds)
  const reelHave = cov.total - cov.count

  return (
    <div style={{ minHeight: '100vh', background: SD.paper, fontFamily: "'Inter', -apple-system, sans-serif", paddingBottom: 80 }}>
      {/* Masthead — name + purpose subtitle only (no status line) */}
      <div style={{ padding: '24px clamp(28px, 4vw, 56px) 4px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(56px, 7vw, 88px)', fontWeight: 700, letterSpacing: '-0.04em', color: SD.ink, lineHeight: 0.95, fontStyle: 'italic' }}>Get Seen.</h1>
        <p style={{ margin: '12px 0 0', fontSize: 15, color: SD.inkLo, fontWeight: 450, letterSpacing: '-0.01em', maxWidth: 620 }}>
          Camps, showcases, questionnaires, film — every way to get your name in front of the coaches who should know it.
        </p>
      </div>

      {/* Content */}
      <div style={{ padding: '24px clamp(28px, 4vw, 56px)', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* Next-move card (petrol) — the single message */}
        <div style={{ background: PETROL.accent, borderRadius: 14, padding: 'clamp(24px, 3vw, 32px)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -10, right: 8, fontSize: 90, fontWeight: 800, fontStyle: 'italic', color: '#fff', opacity: 0.07, lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }}>◉</div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: PETROL.soft, marginBottom: 6 }}>Next move</div>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: SD.cream, fontStyle: 'italic', letterSpacing: '-0.02em' }}>{nextMove.headline}</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#E4F0F2', lineHeight: 1.55 }}>{nextMove.body}</p>
            <Link href={nextMove.href} style={{ display: 'inline-block', padding: '7px 16px', fontSize: 12, fontWeight: 650, color: SD.cream, border: `1.5px solid ${SD.cream}`, borderRadius: 999, textDecoration: 'none', letterSpacing: '-0.01em' }}>
              {nextMove.buttonText}
            </Link>
          </div>
        </div>

        {/* ── Zone A: The calendar ───────────────────────────────── */}
        <div>
          <ZoneHeader title="The calendar." href="/camps" linkText="Manage on Camps" />
          <SectionCard>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: PETROL.accent, marginBottom: 4 }}>Next 10 weeks</div>
            {merged.length > 0 ? (
              <>
                <DesktopTimeline items={merged} onItemClick={onItemClick} />
                <MobileTimeline items={merged} onItemClick={onItemClick} />
                <Legend />
              </>
            ) : (
              <p style={{ margin: '8px 0 0', fontSize: 13, color: SD.inkLo, lineHeight: 1.6, fontStyle: 'italic' }}>
                Nothing in the next 10 weeks. Add camps, showcases, or outreach moments on the Camps page.
              </p>
            )}
          </SectionCard>
        </div>

        {/* ── Zone B: Every way in ───────────────────────────────── */}
        <div>
          <ZoneHeader title="Every way in." />
          <div className="gs-toolkit" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>

            {/* 1. Questionnaires */}
            <ToolCard title="Recruiting questionnaires." href="/schools" linkText="Open Schools">
              <p style={{ margin: '0 0 12px', fontSize: 13, color: SD.inkMid, lineHeight: 1.5 }}>
                Every program&apos;s first filter — free to complete, noticed when missing.
              </p>
              <div style={{ marginTop: 'auto' }}>
                {loaded ? (
                  <>
                    <div style={{ fontSize: 20, fontWeight: 800, color: SD.ink, letterSpacing: '-0.02em' }}>
                      {rqComplete.length} <span style={{ fontSize: 13, fontWeight: 600, color: SD.inkLo }}>of {activeSchools.length} complete</span>
                    </div>
                    {rqNotComplete.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {rqNotComplete.map(s => (
                          <span key={s.id} style={{ fontSize: 11, fontWeight: 600, color: SD.rust, background: SD.rustSoft, border: `1px solid #EAD5CC`, borderRadius: 999, padding: '2px 9px' }}>
                            {s.short_name || s.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : <div style={{ fontSize: 13, color: SD.inkMute }}>Loading…</div>}
              </div>
            </ToolCard>

            {/* 2. Film */}
            <ToolCard title="Your film.">
              <p style={{ margin: '0 0 12px', fontSize: 13, color: SD.inkMid, lineHeight: 1.5 }}>
                Your reel is the first thing coaches watch — keep it current, and get it in front of everyone.
              </p>
              <div style={{ marginTop: 'auto' }}>
                {reelTitle ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: SD.ink, fontStyle: 'italic', letterSpacing: '-0.01em' }}>{reelTitle}</div>
                    {reelAgeDays !== null && (
                      <div style={{ fontSize: 11, fontWeight: 600, color: freshnessColor(reelAgeDays), marginTop: 2 }}>Updated {ageShort(reelAgeDays)}</div>
                    )}
                    {loaded && cov.total > 0 && (
                      <div style={{ fontSize: 12, color: SD.inkMid, marginTop: 8 }}>
                        <b style={{ color: SD.ink }}>{reelHave} of {cov.total}</b> top schools have your latest reel.
                      </div>
                    )}
                    <button
                      onClick={() => setReelModalOpen(true)}
                      disabled={!reelUrl || cov.allTargetSchoolIds.length === 0}
                      style={{
                        marginTop: 12, ...pillLink, border: 'none', cursor: (!reelUrl || cov.allTargetSchoolIds.length === 0) ? 'default' : 'pointer',
                        fontFamily: 'inherit', background: (!reelUrl || cov.allTargetSchoolIds.length === 0) ? SD.line : PETROL.accent,
                        color: (!reelUrl || cov.allTargetSchoolIds.length === 0) ? SD.inkMute : '#fff',
                      }}
                    >
                      {cov.allTargetSchoolIds.length === 0 ? 'All top schools have it ✓' : 'Send your reel →'}
                    </button>
                  </>
                ) : (
                  <Link href="/assets" style={{ ...pillLink }}>Add your reel →</Link>
                )}
              </div>
            </ToolCard>

            {/* 3. Outreach */}
            <ToolCard title="Outreach at scale." href="/campaigns" linkText="Open Campaigns">
              <p style={{ margin: '0 0 12px', fontSize: 13, color: SD.inkMid, lineHeight: 1.5 }}>
                Going to a showcase? Email every attending coach — personalized, in one pass.
              </p>
              <div style={{ marginTop: 'auto' }}>
                {activeCampaignCount > 0 && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: SD.ink, marginBottom: 10 }}>{activeCampaignCount} active campaign{activeCampaignCount !== 1 ? 's' : ''}</div>
                )}
                <Link href="/campaigns/new" style={pillLink}>+ New Campaign</Link>
              </div>
            </ToolCard>

            {/* 4. Coaches */}
            <ToolCard title="The coaches." href="/schools" linkText="Open Schools">
              <p style={{ margin: '0 0 12px', fontSize: 13, color: SD.inkMid, lineHeight: 1.5 }}>
                Every school&apos;s staff, with emails — scraped weekly, verified by you.
              </p>
              <div style={{ marginTop: 'auto' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: SD.ink, letterSpacing: '-0.02em' }}>
                  {coachStats.total} <span style={{ fontSize: 13, fontWeight: 600, color: SD.inkLo }}>coaches on file</span>
                </div>
                {coachStats.needsReview > 0 && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: SD.rust, marginTop: 4 }}>{coachStats.needsReview} need your review</div>
                )}
              </div>
            </ToolCard>

          </div>
        </div>
      </div>

      {reelModalOpen && (
        <BatchReelModal
          schoolIds={cov.allTargetSchoolIds}
          schools={schools}
          userId={userId}
          reelUrl={reelUrl}
          reelTitle={reelTitle}
          onClose={() => setReelModalOpen(false)}
        />
      )}

      <style>{`
        @media (max-width: 640px) {
          .gs-timeline-desktop { display: none !important; }
          .gs-timeline-mobile { display: block !important; }
          .gs-toolkit { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

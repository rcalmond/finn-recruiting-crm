'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { UpcomingCampItem, TimelineEventItem } from '@/app/(app)/get-seen/page'
import type { CalendarEventKind } from '@/lib/types'

const GREEN = { accent: '#2D6A4F', accentSoft: '#D7EFE0', accentDeep: '#1B4332' }
const SD = {
  paper: '#F6F1E8', ink: '#0E0E0E', inkMid: '#4A4A4A', inkLo: '#7A7570',
  inkMute: '#A8A39B', line: '#E2DBC9', cream: '#F6F1E8',
  rust: '#B5502F', rustSoft: '#FAF0EA', event: '#5B7A99', eventSoft: '#E7EDF3',
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

// ─── Merged model ──────────────────────────────────────────────────────────────

type MergedItem = {
  id: string
  source: 'camp' | 'event'
  kind: 'camp' | CalendarEventKind
  label: string
  start_date: string
  end_date: string | null
  d: number                 // days until start
  finn_status?: string | null
  location?: string | null
  href?: string
}

function buildMerged(camps: UpcomingCampItem[], events: TimelineEventItem[]): MergedItem[] {
  const fromCamps: MergedItem[] = camps.map(c => ({
    id: c.id, source: 'camp', kind: 'camp',
    label: c.host_school_short_name || c.host_school_name,
    start_date: c.start_date,
    end_date: c.end_date && c.end_date !== c.start_date ? c.end_date : null,  // range camps → bars
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

// ─── Status line + next-move (merged) ──────────────────────────────────────────

function getStatusLine(items: MergedItem[]): { text: string; hasEvent: boolean } {
  if (items.length === 0) return { text: 'Nothing on the calendar.', hasEvent: false }
  const n = items[0]
  const isSend = n.kind === 'outreach_moment'
  const verb = isSend ? 'Send' : 'Next'
  const label = n.label.length > 34 ? n.label.slice(0, 32) + '…' : n.label
  if (n.d <= 0) return { text: `Today: ${label}`, hasEvent: true }
  if (n.d === 1) return { text: `${verb} tomorrow: ${label}`, hasEvent: true }
  return { text: `${verb}: ${label} — ${formatShortDate(n.start_date)}, ${n.d} days out.`, hasEvent: true }
}

function getNextMove(items: MergedItem[], activeCampaignCount: number): { headline: string; body: string; href: string; buttonText: string } {
  const n = items[0]
  if (n && n.kind === 'outreach_moment') {
    return {
      headline: `${n.label} — ${n.d <= 0 ? 'today' : n.d === 1 ? 'tomorrow' : `${n.d} days out`}.`,
      body: 'A send moment is coming up. Line up which schools it targets and have the material ready before the date.',
      href: '/camps', buttonText: 'Open Events →',
    }
  }
  if (n) {
    const isCamp = n.source === 'camp'
    return {
      headline: `${n.label} — ${n.d <= 0 ? 'today' : n.d === 1 ? 'tomorrow' : `${n.d} days out`}.`,
      body: isCamp
        ? 'Nearest event on the calendar. Review the coaching staff and prep your intro.'
        : 'A showcase or tournament is coming up. Confirm attendance and note which coaches will be there.',
      href: '/camps', buttonText: 'Open Camps →',
    }
  }
  return {
    headline: 'Plan the fall showcase circuit.',
    body: 'Nothing upcoming. Fall ID camps and showcases are the next exposure window — build the schedule now.',
    href: activeCampaignCount > 0 ? '/campaigns' : '/camps',
    buttonText: activeCampaignCount > 0 ? 'Open Campaigns →' : 'Open Camps →',
  }
}

// ─── Glyphs ────────────────────────────────────────────────────────────────────

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
      {/* Track (fixed inset so % positions resolve against a defined width) */}
      <div style={{ position: 'absolute', top: 0, left: 8, right: 8, bottom: 0 }}>
        {/* baseline */}
        <div style={{ position: 'absolute', top: 78, left: 0, right: 0, height: 2, background: SD.line, borderRadius: 1 }} />
        {/* week ticks */}
        {[2, 4, 6, 8, 10].map(w => (
          <div key={w} style={{ position: 'absolute', top: 74, left: `${w / 10 * 100}%` }}>
            <div style={{ width: 1, height: 10, background: SD.line }} />
            <div style={{ fontSize: 8, color: SD.inkMute, marginTop: 2, transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>wk {w}</div>
          </div>
        ))}
        {/* TODAY marker */}
        <div style={{ position: 'absolute', top: 62, left: 0, transform: 'translateX(-50%)', textAlign: 'center' }}>
          <div style={{ width: 2, height: 32, background: SD.ink, margin: '0 auto' }} />
          <div style={{ fontSize: 8, fontWeight: 800, color: SD.ink, letterSpacing: '0.08em', marginTop: 2 }}>TODAY</div>
        </div>

        {/* Items — each rendered as glyph/bar + label, positioned by date */}
        {items.map((it, i) => {
          const above = i % 2 === 0
          const isRange = !!it.end_date && it.end_date !== it.start_date
          const emphasized = i === 0
          const startPct = clampPct(it.d)
          const endPct = isRange ? clampPct(daysUntil(it.end_date!)) : startPct
          const widthPct = Math.max(2, endPct - startPct)
          return (
            <div key={`${it.source}-${it.id}`}>
              {/* Glyph or range bar on the baseline */}
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
              {/* Label — alternating above/below to avoid overlap */}
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

// ─── Legend ─────────────────────────────────────────────────────────────────────

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

// ─── Section card ────────────────────────────────────────────────────────────────

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div style={{ background: '#fff', border: `1px solid ${SD.line}`, borderRadius: 14, padding: 'clamp(18px, 2.5vw, 24px)' }}>{children}</div>
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GetSeenClient({
  upcomingCamps, upcomingEvents, activeCampaignCount,
}: {
  upcomingCamps: UpcomingCampItem[]
  upcomingEvents: TimelineEventItem[]
  activeCampaignCount: number
}) {
  const router = useRouter()
  const merged = buildMerged(upcomingCamps, upcomingEvents)
  const statusLine = getStatusLine(merged)
  const nextMove = getNextMove(merged, activeCampaignCount)

  const onItemClick = (it: MergedItem) => {
    if (it.source === 'camp') router.push('/camps')
    else router.push('/camps') // events management lives on the Camps page
  }

  return (
    <div style={{ minHeight: '100vh', background: SD.paper, fontFamily: "'Inter', -apple-system, sans-serif", paddingBottom: 80 }}>
      {/* Masthead */}
      <div style={{ padding: '24px clamp(28px, 4vw, 56px) 4px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(56px, 7vw, 88px)', fontWeight: 700, letterSpacing: '-0.04em', color: SD.ink, lineHeight: 0.95, fontStyle: 'italic' }}>Get Seen.</h1>
        <p style={{ margin: '12px 0 0', fontSize: 15, color: SD.inkLo, fontWeight: 450, letterSpacing: '-0.01em' }}>
          Get in front of the coaches who should know your name.
        </p>
        <div style={{ margin: '14px 0 0' }}>
          <Link href="/camps" style={{
            fontSize: 15, fontWeight: statusLine.hasEvent ? 650 : 450,
            color: statusLine.hasEvent ? GREEN.accent : SD.inkMute, textDecoration: 'none', letterSpacing: '-0.01em',
          }}>
            {statusLine.text}{statusLine.hasEvent ? ' →' : ''}
          </Link>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '24px clamp(28px, 4vw, 56px)', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Green next-move card */}
        <div style={{ background: GREEN.accent, borderRadius: 14, padding: 'clamp(24px, 3vw, 32px)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -10, right: 8, fontSize: 90, fontWeight: 800, fontStyle: 'italic', color: '#fff', opacity: 0.06, lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }}>◉</div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: GREEN.accentSoft, marginBottom: 6 }}>Next move</div>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: SD.cream, fontStyle: 'italic', letterSpacing: '-0.02em' }}>{nextMove.headline}</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: GREEN.accentSoft, lineHeight: 1.55 }}>{nextMove.body}</p>
            <Link href={nextMove.href} style={{ display: 'inline-block', padding: '7px 16px', fontSize: 12, fontWeight: 650, color: SD.cream, border: `1.5px solid ${SD.cream}`, borderRadius: 999, textDecoration: 'none', letterSpacing: '-0.01em' }}>
              {nextMove.buttonText}
            </Link>
          </div>
        </div>

        {/* Timeline — the visual centerpiece */}
        <SectionCard>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: GREEN.accent, marginBottom: 4 }}>Next 10 weeks</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: SD.ink, fontStyle: 'italic' }}>The calendar.</h3>
            <Link href="/camps" style={{ fontSize: 12, fontWeight: 600, color: GREEN.accent, textDecoration: 'none', letterSpacing: '-0.01em' }}>Manage on Camps →</Link>
          </div>
          {merged.length > 0 ? (
            <>
              <DesktopTimeline items={merged} onItemClick={onItemClick} />
              <MobileTimeline items={merged} onItemClick={onItemClick} />
              <Legend />
            </>
          ) : (
            <p style={{ margin: '12px 0 0', fontSize: 13, color: SD.inkLo, lineHeight: 1.6, fontStyle: 'italic' }}>
              Nothing in the next 10 weeks. Add camps, showcases, or outreach moments on the Camps page.
            </p>
          )}
        </SectionCard>

        {/* Campaigns */}
        <SectionCard>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: GREEN.accent, marginBottom: 4 }}>Outreach</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: SD.ink, fontStyle: 'italic' }}>Campaigns.</h3>
            <Link href="/campaigns" style={{ fontSize: 12, fontWeight: 600, color: GREEN.accent, textDecoration: 'none', letterSpacing: '-0.01em' }}>Open Campaigns →</Link>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: SD.inkMid, lineHeight: 1.6 }}>
            Going to a showcase? Email every attending coach in one pass. Campaigns batch your outreach so no school gets missed.
          </p>
          {activeCampaignCount > 0 && (
            <div style={{ fontSize: 13, fontWeight: 600, color: SD.ink }}>{activeCampaignCount} active campaign{activeCampaignCount !== 1 ? 's' : ''}</div>
          )}
          <Link href="/campaigns/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, padding: '8px 16px', background: GREEN.accent, color: '#fff', borderRadius: 999, fontSize: 12, fontWeight: 650, textDecoration: 'none', letterSpacing: '-0.01em' }}>
            + New Campaign
          </Link>
        </SectionCard>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .gs-timeline-desktop { display: none !important; }
          .gs-timeline-mobile { display: block !important; }
        }
      `}</style>
    </div>
  )
}

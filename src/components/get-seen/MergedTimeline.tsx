'use client'

import type { CalendarEventKind } from '@/lib/types'

// ─── Input shapes (shared by Get Seen + Calendar) ──────────────────────────────

export interface UpcomingCampItem {
  id: string
  name: string
  start_date: string
  end_date: string | null
  host_school_short_name: string | null
  host_school_name: string
  family_status: string | null  // 'registered' | 'targeted' | 'interested' | null
}

export interface TimelineEventItem {
  id: string
  kind: CalendarEventKind
  name: string
  start_date: string
  end_date: string | null
  location: string | null
  status: string
}

// DATA colors — camp = green (filled = registered), showcase = event blue,
// outreach = rust. These encode the legend's meaning and are NOT touched by the
// brand pass (firewall).
const GREEN = { accent: '#2D6A4F', accentSoft: '#D7EFE0', accentDeep: '#1B4332' }
// CHROME — the "next event" hero card was petrol; migrated to the shared pitch.
const PETROL = { accent: '#1F6B48', soft: '#FBF6EC' }
const SD = {
  ink: '#1A1A1A', inkLo: '#6B655A', inkMute: '#8A8478', line: '#E2DBC9', lineWarm: '#DDD5C3',
  cream: '#FBF6EC', rust: '#B5502F', rustSoft: '#FAF0EA', event: '#5B7A99', eventSoft: '#E7EDF3',
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

export type MergedItem = {
  id: string
  source: 'camp' | 'event'
  kind: 'camp' | CalendarEventKind
  label: string
  start_date: string
  end_date: string | null
  d: number
  family_status?: string | null
  location?: string | null
  href?: string
}

export function buildMerged(camps: UpcomingCampItem[], events: TimelineEventItem[]): MergedItem[] {
  const fromCamps: MergedItem[] = camps.map(c => ({
    id: c.id, source: 'camp', kind: 'camp',
    label: c.host_school_short_name || c.host_school_name,
    start_date: c.start_date,
    end_date: c.end_date && c.end_date !== c.start_date ? c.end_date : null,
    d: daysUntil(c.start_date),
    family_status: c.family_status, href: '/calendar',
  }))
  const fromEvents: MergedItem[] = events.map(e => ({
    id: e.id, source: 'event', kind: e.kind,
    label: e.name, start_date: e.start_date, end_date: e.end_date,
    d: daysUntil(e.start_date), location: e.location,
  }))
  return [...fromCamps, ...fromEvents].sort((a, b) => a.start_date.localeCompare(b.start_date))
}

// ─── Markers (DATA colors — enlarged with white rings) ─────────────────────────

function AttendMarker({ color, filled }: { color: string; filled: boolean }) {
  return <div style={{
    width: 17, height: 17, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
    background: filled ? color : '#fff', border: `2.5px solid ${color}`, boxShadow: '0 0 0 3px #fff',
  }} />
}
function SendMarker() {
  return <div style={{
    width: 16, height: 16, borderRadius: 5, flexShrink: 0, background: SD.rust,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 10, fontWeight: 900, lineHeight: 1, boxShadow: '0 0 0 3px #fff',
  }}>↗</div>
}
function RailMarker({ it }: { it: MergedItem }) {
  if (it.kind === 'outreach_moment') return <SendMarker />
  if (it.source === 'camp') return <AttendMarker color={GREEN.accent} filled={it.family_status === 'registered'} />
  return <AttendMarker color={SD.event} filled />
}

function cardStyle(isHero: boolean, isOutreach: boolean): React.CSSProperties {
  if (isHero) return { background: PETROL.accent, borderRadius: 10, padding: '9px 11px', boxShadow: '0 6px 16px rgba(31,107,72,0.28)' }
  return {
    background: '#fff', borderRadius: 10, padding: '8px 10px',
    border: `${isOutreach ? '1.5px' : '1px'} solid ${isOutreach ? SD.rust : SD.line}`,
    boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
  }
}

// ─── Desktop timeline (proportional, TODAY-anchored) ────────────────────────────

function spanDays(it: MergedItem): number {
  if (!it.end_date || it.end_date === it.start_date) return 1
  return Math.round((new Date(it.end_date + 'T00:00:00').getTime() - new Date(it.start_date + 'T00:00:00').getTime()) / 86400000) + 1
}
function cardDateText(it: MergedItem): string {
  return it.end_date && it.end_date !== it.start_date
    ? `${formatShortDate(it.start_date)}–${formatShortDate(it.end_date)}`
    : formatShortDate(it.start_date)
}

const CARD_W = 122

function DesktopTimeline({ items, onItemClick }: { items: MergedItem[]; onItemClick: (it: MergedItem) => void }) {
  const H = 224
  const RAIL_Y = 112
  const STEM = [14, 64]
  const THRESH = 14
  const clampPct = (d: number) => Math.max(0, Math.min(WINDOW_DAYS, d)) / WINDOW_DAYS * 100

  const lastPct: Record<'above' | 'below', number> = { above: -999, below: -999 }
  const lastTier: Record<'above' | 'below', number> = { above: 0, below: 0 }
  const placed = items.map((it, i) => {
    const side: 'above' | 'below' = i % 2 === 0 ? 'above' : 'below'
    const pct = clampPct(it.d)
    let tier = 0
    if (Math.abs(pct - lastPct[side]) < THRESH) tier = lastTier[side] === 0 ? 1 : 0
    lastPct[side] = pct; lastTier[side] = tier
    return { it, side, tier, pct }
  })

  return (
    <div className="mt-timeline-desktop" style={{ position: 'relative', height: H, marginTop: 8 }}>
      <div style={{ position: 'absolute', top: 0, left: 12, right: 12, bottom: 0 }}>
        <div style={{ position: 'absolute', top: RAIL_Y - 2, left: 0, right: 0, height: 4, background: SD.lineWarm, borderRadius: 2 }} />
        {[2, 4, 6, 8, 10].map(w => (
          <div key={w} style={{ position: 'absolute', top: RAIL_Y + 8, left: `${w / 10 * 100}%` }}>
            <div style={{ width: 1, height: 7, background: SD.line }} />
            <div style={{ fontSize: 8, color: SD.inkMute, marginTop: 2, transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>wk {w}</div>
          </div>
        ))}
        <div style={{ position: 'absolute', top: RAIL_Y - 18, left: 0, transform: 'translateX(-50%)', textAlign: 'center', zIndex: 4 }}>
          <div style={{ width: 3, height: 36, background: SD.ink, margin: '0 auto', borderRadius: 1 }} />
          <div style={{ fontSize: 8, fontWeight: 800, color: SD.ink, letterSpacing: '0.12em', marginTop: 3 }}>TODAY</div>
        </div>

        {placed.map(({ it, side, tier, pct }, i) => {
          const isHero = i === 0
          const isBar = spanDays(it) >= 4
          const isOutreach = it.kind === 'outreach_moment'
          const stemLen = STEM[tier]
          const endPct = isBar ? clampPct(daysUntil(it.end_date!)) : pct
          const barW = Math.max(2, endPct - pct)
          const stemColor = isOutreach ? SD.rust : isHero ? PETROL.accent : SD.lineWarm
          const cardLeft = isBar
            ? `clamp(0px, calc(${pct}% - 8px), calc(100% - ${CARD_W}px))`
            : `clamp(0px, calc(${pct}% - ${CARD_W / 2}px), calc(100% - ${CARD_W}px))`

          return (
            <div key={`${it.source}-${it.id}`}>
              {isBar ? (
                <div onClick={() => onItemClick(it)} style={{
                  position: 'absolute', top: RAIL_Y - 4, left: `${pct}%`, width: `${barW}%`, height: 8,
                  borderRadius: 4, cursor: 'pointer', zIndex: 2,
                  background: it.source === 'camp' ? GREEN.accent : isOutreach ? SD.rust : SD.event,
                  opacity: it.source === 'camp' && it.family_status !== 'registered' ? 0.6 : 0.9,
                  boxShadow: '0 0 0 2px #fff',
                }} />
              ) : (
                <div onClick={() => onItemClick(it)} style={{ position: 'absolute', top: RAIL_Y, left: `${pct}%`, transform: 'translate(-50%, -50%)', cursor: 'pointer', zIndex: 2 }}>
                  <RailMarker it={it} />
                </div>
              )}

              <div style={{
                position: 'absolute', left: `${pct}%`, width: 2, background: stemColor, transform: 'translateX(-50%)', zIndex: 1,
                ...(side === 'above' ? { top: RAIL_Y - stemLen, height: stemLen } : { top: RAIL_Y, height: stemLen }),
              }} />

              <div
                onClick={() => onItemClick(it)}
                style={{
                  position: 'absolute', left: cardLeft, width: CARD_W, cursor: 'pointer', zIndex: 3,
                  ...(side === 'above' ? { bottom: H - (RAIL_Y - stemLen) } : { top: RAIL_Y + stemLen }),
                  ...cardStyle(isHero, isOutreach),
                }}
              >
                <div style={{
                  fontSize: isHero ? 12.5 : 11.5, fontWeight: isHero ? 800 : 700,
                  color: isHero ? SD.cream : SD.ink, lineHeight: 1.2, letterSpacing: '-0.01em',
                  overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                }}>{it.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 9.5, color: isHero ? PETROL.soft : SD.inkLo, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{cardDateText(it)}</span>
                  {isHero ? (
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: PETROL.accent, background: SD.cream, borderRadius: 999, padding: '1px 8px', flexShrink: 0 }}>{daysOutText(it.d)}</span>
                  ) : (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: it.d <= 3 ? (isOutreach ? SD.rust : GREEN.accent) : SD.inkMute, flexShrink: 0 }}>{daysOutText(it.d)}</span>
                  )}
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
    <div className="mt-timeline-mobile" style={{ display: 'none', flexDirection: 'column', gap: 10, marginTop: 8 }}>
      {items.map((it, i) => {
        const isHero = i === 0
        const isOutreach = it.kind === 'outreach_moment'
        const isRange = !!it.end_date && it.end_date !== it.start_date
        const badge = KIND_BADGE[it.kind] ?? KIND_BADGE.other
        return (
          <div key={`${it.source}-${it.id}`} onClick={() => onItemClick(it)} style={{
            display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', ...cardStyle(isHero, isOutreach),
          }}>
            <RailMarker it={it} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {!isHero && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: badge.bg, color: badge.color, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{badge.label}</span>}
                <span style={{ fontSize: 13, fontWeight: isHero ? 800 : 650, color: isHero ? SD.cream : SD.ink }}>{it.label}</span>
              </div>
              <div style={{ fontSize: 11, color: isHero ? PETROL.soft : SD.inkLo, marginTop: 1 }}>
                {isRange ? `${formatShortDate(it.start_date)}–${formatShortDate(it.end_date!)}` : formatShortDate(it.start_date)}
                {it.location ? ` · ${it.location}` : ''}
              </div>
            </div>
            {isHero ? (
              <span style={{ fontSize: 11, fontWeight: 800, color: PETROL.accent, background: SD.cream, borderRadius: 999, padding: '2px 10px', flexShrink: 0 }}>{daysOutText(it.d)}</span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 700, color: it.d <= 3 ? (isOutreach ? SD.rust : GREEN.accent) : SD.inkMute, flexShrink: 0 }}>{daysOutText(it.d)}</span>
            )}
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

// ─── Public component ──────────────────────────────────────────────────────────

export default function MergedTimeline({
  camps, events, onItemClick, emptyText,
}: {
  camps: UpcomingCampItem[]
  events: TimelineEventItem[]
  onItemClick: (it: MergedItem) => void
  emptyText?: string
}) {
  const merged = buildMerged(camps, events)
  if (merged.length === 0) {
    return (
      <p style={{ margin: '8px 0 0', fontSize: 13, color: SD.inkLo, lineHeight: 1.6, fontStyle: 'italic' }}>
        {emptyText ?? 'Nothing in the next 10 weeks. Add camps, showcases, or outreach moments below.'}
      </p>
    )
  }
  return (
    <>
      <DesktopTimeline items={merged} onItemClick={onItemClick} />
      <MobileTimeline items={merged} onItemClick={onItemClick} />
      <Legend />
      <style>{`
        @media (max-width: 640px) {
          .mt-timeline-desktop { display: none !important; }
          .mt-timeline-mobile { display: flex !important; }
        }
      `}</style>
    </>
  )
}

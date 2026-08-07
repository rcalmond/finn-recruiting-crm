'use client'

import Link from 'next/link'
import type { UpcomingCampItem } from '@/app/(app)/get-seen/page'

const GREEN = { accent: '#2D6A4F', accentSoft: '#D7EFE0', accentDeep: '#1B4332' }
const SD = {
  paper: '#F6F1E8', ink: '#0E0E0E', inkMid: '#4A4A4A', inkLo: '#7A7570',
  inkMute: '#A8A39B', line: '#E2DBC9', cream: '#F6F1E8',
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${SD.line}`, borderRadius: 14, padding: 'clamp(18px, 2.5vw, 24px)' }}>
      {children}
    </div>
  )
}

// ─── Status line logic ────────────────────────────────────────────────────────

function getSeenStatusLine(camps: UpcomingCampItem[]): { text: string; hasEvent: boolean } {
  if (camps.length === 0) return { text: 'No camps on the calendar.', hasEvent: false }
  const nearest = camps[0]
  const days = daysUntil(nearest.start_date)
  const name = nearest.host_school_short_name || nearest.host_school_name
  const label = nearest.name.length > 30 ? name : nearest.name
  if (days === 0) return { text: `Today: ${label}`, hasEvent: true }
  if (days === 1) return { text: `Tomorrow: ${label}`, hasEvent: true }
  return { text: `Next: ${label} — ${formatShortDate(nearest.start_date)}, ${days} days out.`, hasEvent: true }
}

// ─── Next-move card logic ─────────────────────────────────────────────────────

function getSeenNextMove(camps: UpcomingCampItem[]): { headline: string; body: string; href: string; buttonText: string } {
  if (camps.length > 0) {
    const nearest = camps[0]
    const days = daysUntil(nearest.start_date)
    const name = nearest.host_school_short_name || nearest.host_school_name
    const status = nearest.finn_status
    const registered = status === 'registered'
    return {
      headline: `${name} — ${days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `${days} days out`}.`,
      body: registered
        ? `Registered and ready. Review the coaching staff and prep your intro.`
        : `${status === 'targeted' ? 'Targeted but not registered yet.' : 'On the radar.'} Check deadlines and confirm attendance.`,
      href: '/camps',
      buttonText: 'Open Camps →',
    }
  }
  return {
    headline: 'Plan the fall showcase circuit.',
    body: 'No upcoming camps. Fall ID camps are the next major exposure window — build the schedule now.',
    href: '/campaigns',
    buttonText: 'Open Campaigns →',
  }
}

// ─── Camps Timeline ───────────────────────────────────────────────────────────

function CampsTimeline({ camps }: { camps: UpcomingCampItem[] }) {
  if (camps.length === 0) return null

  return (
    <>
      {/* Desktop: horizontal timeline */}
      <div className="camps-timeline-desktop" style={{
        position: 'relative', padding: '18px 0 8px', marginTop: 6,
      }}>
        {/* Line */}
        <div style={{
          position: 'absolute', top: 24, left: 0, right: 0,
          height: 2, background: SD.line, borderRadius: 1,
        }} />

        {/* Dots */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', gap: 4,
          position: 'relative',
        }}>
          {camps.map(camp => {
            const days = daysUntil(camp.start_date)
            const registered = camp.finn_status === 'registered'
            const targeted = camp.finn_status === 'targeted'
            const name = camp.host_school_short_name || camp.host_school_name.slice(0, 10)
            return (
              <Link key={camp.id} href="/camps" style={{ textDecoration: 'none', flex: 1, maxWidth: 120 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  {/* Dot */}
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: registered ? GREEN.accent : 'transparent',
                    border: `2px solid ${registered || targeted ? GREEN.accent : SD.inkMute}`,
                    flexShrink: 0,
                  }} />
                  {/* Label */}
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: SD.ink, lineHeight: 1.2 }}>{name}</div>
                    <div style={{ fontSize: 9, color: SD.inkLo }}>{formatShortDate(camp.start_date)}</div>
                    <div style={{
                      fontSize: 9, fontWeight: 600,
                      color: days <= 3 ? GREEN.accent : SD.inkMute,
                    }}>
                      {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `${days}d`}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Mobile: stacked list */}
      <div className="camps-timeline-mobile" style={{ display: 'none', marginTop: 8 }}>
        {camps.map(camp => {
          const days = daysUntil(camp.start_date)
          const registered = camp.finn_status === 'registered'
          const targeted = camp.finn_status === 'targeted'
          const name = camp.host_school_short_name || camp.host_school_name
          return (
            <Link key={camp.id} href="/camps" style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 0', borderBottom: `1px solid ${SD.line}`,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: registered ? GREEN.accent : 'transparent',
                  border: `2px solid ${registered || targeted ? GREEN.accent : SD.inkMute}`,
                }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: SD.ink }}>{name}</span>
                  <span style={{ fontSize: 11, color: SD.inkLo, marginLeft: 6 }}>{formatShortDate(camp.start_date)}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: days <= 3 ? GREEN.accent : SD.inkMute }}>
                  {days === 0 ? 'today' : days === 1 ? 'tmrw' : `${days}d`}
                </span>
              </div>
            </Link>
          )
        })}
      </div>

      <style>{`
        @media (max-width: 600px) {
          .camps-timeline-desktop { display: none !important; }
          .camps-timeline-mobile { display: block !important; }
        }
      `}</style>
    </>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GetSeenClient({
  upcomingCamps,
  activeCampaignCount,
}: {
  upcomingCamps: UpcomingCampItem[]
  activeCampaignCount: number
}) {
  const statusLine = getSeenStatusLine(upcomingCamps)
  const nextMove = getSeenNextMove(upcomingCamps)

  return (
    <div style={{ minHeight: '100vh', background: SD.paper, fontFamily: "'Inter', -apple-system, sans-serif", paddingBottom: 80 }}>
      {/* Masthead */}
      <div style={{ padding: '24px clamp(28px, 4vw, 56px) 4px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(56px, 7vw, 88px)', fontWeight: 700, letterSpacing: '-0.04em', color: SD.ink, lineHeight: 0.95, fontStyle: 'italic' }}>Get Seen.</h1>
        <p style={{ margin: '12px 0 0', fontSize: 15, color: SD.inkLo, fontWeight: 450, letterSpacing: '-0.01em' }}>
          Get in front of the coaches who should know your name.
        </p>
        {/* Status line */}
        <div style={{ margin: '14px 0 0' }}>
          <Link href="/camps" style={{
            fontSize: 15, fontWeight: statusLine.hasEvent ? 650 : 450,
            color: statusLine.hasEvent ? GREEN.accent : SD.inkMute,
            textDecoration: 'none', letterSpacing: '-0.01em',
          }}>
            {statusLine.text}{statusLine.hasEvent ? ' →' : ''}
          </Link>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '24px clamp(28px, 4vw, 56px)', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Green next-move card */}
        <div style={{
          background: GREEN.accent, borderRadius: 14,
          padding: 'clamp(24px, 3vw, 32px)',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Ghost calendar */}
          <div style={{
            position: 'absolute', top: -10, right: 8,
            fontSize: 90, fontWeight: 800, fontStyle: 'italic',
            color: '#fff', opacity: 0.06, lineHeight: 1,
            pointerEvents: 'none', userSelect: 'none',
          }}>◉</div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: GREEN.accentSoft, marginBottom: 6 }}>Next move</div>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: SD.cream, fontStyle: 'italic', letterSpacing: '-0.02em' }}>{nextMove.headline}</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: GREEN.accentSoft, lineHeight: 1.55 }}>{nextMove.body}</p>
            <Link href={nextMove.href} style={{
              display: 'inline-block', padding: '7px 16px', fontSize: 12, fontWeight: 650,
              color: SD.cream, border: `1.5px solid ${SD.cream}`, borderRadius: 999,
              textDecoration: 'none', letterSpacing: '-0.01em',
            }}>
              {nextMove.buttonText}
            </Link>
          </div>
        </div>

        {/* Camps timeline */}
        <SectionCard>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: GREEN.accent, marginBottom: 4 }}>Exposure</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: SD.ink, fontStyle: 'italic' }}>Camps & Showcases.</h3>
            <Link href="/camps" style={{ fontSize: 12, fontWeight: 600, color: GREEN.accent, textDecoration: 'none', letterSpacing: '-0.01em' }}>Open Camps →</Link>
          </div>
          {upcomingCamps.length > 0 ? (
            <CampsTimeline camps={upcomingCamps} />
          ) : (
            <p style={{ margin: '12px 0 0', fontSize: 13, color: SD.inkLo, lineHeight: 1.6, fontStyle: 'italic' }}>
              No upcoming camps in the next 8 weeks. Plan the fall circuit.
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
          <Link href="/campaigns/new" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginTop: 12, padding: '8px 16px',
            background: GREEN.accent, color: '#fff',
            borderRadius: 999, fontSize: 12, fontWeight: 650,
            textDecoration: 'none', letterSpacing: '-0.01em',
          }}>
            + New Campaign
          </Link>
        </SectionCard>
      </div>
    </div>
  )
}

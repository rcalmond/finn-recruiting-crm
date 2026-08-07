'use client'

import Link from 'next/link'

const GREEN = { accent: '#2D6A4F', accentSoft: '#D7EFE0', accentDeep: '#1B4332' }
const SD = {
  paper: '#F6F1E8', ink: '#0E0E0E', inkMid: '#4A4A4A', inkLo: '#7A7570',
  inkMute: '#A8A39B', line: '#E2DBC9', cream: '#F6F1E8',
  rust: '#B5502F', amber: '#D4A017',
}

function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24))
}

function daysAgoText(n: number): string {
  if (n === 0) return 'today'
  if (n === 1) return '1 day ago'
  return `${n} days ago`
}

// Freshness color bands: ≤30d green, 31-90d amber, >90d rust
function freshnessColor(days: number): string {
  if (days <= 30) return GREEN.accent
  if (days <= 90) return SD.amber
  return SD.rust
}

function GhostGlyph({ children, opacity }: { children: React.ReactNode; opacity?: number }) {
  return (
    <div style={{
      position: 'absolute', top: -8, right: 8,
      fontSize: 90, fontWeight: 800, fontStyle: 'italic',
      color: SD.ink, opacity: opacity ?? 0.04, lineHeight: 1,
      pointerEvents: 'none', userSelect: 'none',
    }}>
      {children}
    </div>
  )
}

function SectionCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${SD.line}`, borderRadius: 14,
      padding: 'clamp(18px, 2.5vw, 24px)', position: 'relative', overflow: 'hidden',
      ...style,
    }}>
      {children}
    </div>
  )
}

function SectionHeader({ eyebrow, label, href, linkText }: { eyebrow: string; label: string; href?: string; linkText?: string }) {
  return (
    <div style={{ marginBottom: 14, position: 'relative', zIndex: 1 }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: GREEN.accent, marginBottom: 4 }}>{eyebrow}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: SD.ink, fontStyle: 'italic' }}>{label}</h3>
        {href && <Link href={href} style={{ fontSize: 12, fontWeight: 600, color: GREEN.accent, textDecoration: 'none', letterSpacing: '-0.01em' }}>{linkText ?? 'View all'} →</Link>}
      </div>
    </div>
  )
}

// ─── Status line logic ────────────────────────────────────────────────────────
// Precedence: reel >90d → resume >60d → transcript stale → all fresh

function getReadyStatusLine(
  reelAsset: { created_at: string } | null,
  resumeAsset: { created_at: string } | null,
  transcriptAsset: { created_at: string } | null,
): { text: string; urgent: boolean } {
  if (reelAsset) {
    const days = daysSince(reelAsset.created_at)
    if (days > 90) return { text: `Reel is ${days} days old — fall film season is your refresh window.`, urgent: true }
  } else {
    return { text: 'No highlight reel uploaded.', urgent: true }
  }
  if (resumeAsset) {
    const days = daysSince(resumeAsset.created_at)
    if (days > 60) return { text: `Resume is ${days} days old — update with summer results.`, urgent: true }
  } else {
    return { text: 'No resume uploaded.', urgent: true }
  }
  if (!transcriptAsset) {
    return { text: 'No transcript uploaded — coaches check academics early.', urgent: true }
  }
  const tDays = daysSince(transcriptAsset.created_at)
  if (tDays > 120) return { text: `Transcript is ${tDays} days old — request a current copy.`, urgent: false }
  return { text: 'Profile is current.', urgent: false }
}

// ─── Next-move card logic ─────────────────────────────────────────────────────

function getReadyNextMove(
  reelAsset: { created_at: string } | null,
  resumeAsset: { created_at: string } | null,
): { headline: string; body: string; href: string; buttonText: string } | null {
  if (!reelAsset || daysSince(reelAsset.created_at) > 90) {
    return {
      headline: 'Plan the fall reel.',
      body: 'Your reel is the first thing coaches watch. Fall club season is the refresh window — capture footage now.',
      href: '/assets',
      buttonText: 'Open Library →',
    }
  }
  if (!resumeAsset || daysSince(resumeAsset.created_at) > 60) {
    return {
      headline: 'Update the resume.',
      body: 'Summer stats, new test scores, and fall courseload — make sure coaches see the latest.',
      href: '/assets',
      buttonText: 'Open Library →',
    }
  }
  return null // all fresh — no card
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GetReadyClient({
  reelAsset,
  resumeAsset,
  transcriptAsset,
  activeMessageCount,
  activeQuestionCount,
  tierCounts,
  totalSchools,
}: {
  reelAsset: { name: string; created_at: string } | null
  resumeAsset: { name: string; version: number; created_at: string } | null
  transcriptAsset: { name: string; created_at: string } | null
  activeMessageCount: number
  activeQuestionCount: number
  tierCounts: { A: number; B: number; C: number }
  totalSchools: number
}) {
  const statusLine = getReadyStatusLine(reelAsset, resumeAsset, transcriptAsset)
  const nextMove = getReadyNextMove(reelAsset, resumeAsset)

  return (
    <div style={{ minHeight: '100vh', background: SD.paper, fontFamily: "'Inter', -apple-system, sans-serif", paddingBottom: 80 }}>
      {/* Masthead */}
      <div style={{ padding: '24px clamp(28px, 4vw, 56px) 4px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(56px, 7vw, 88px)', fontWeight: 700, letterSpacing: '-0.04em', color: SD.ink, lineHeight: 0.95, fontStyle: 'italic' }}>Get Ready.</h1>
        <p style={{ margin: '12px 0 0', fontSize: 15, color: SD.inkLo, fontWeight: 450, letterSpacing: '-0.01em' }}>
          Build the profile, film, and school list that make coaches take notice.
        </p>
        {/* Status line */}
        <div style={{ margin: '14px 0 0' }}>
          <Link href="/assets" style={{
            fontSize: 15, fontWeight: statusLine.urgent ? 650 : 450,
            color: statusLine.urgent ? GREEN.accent : SD.inkMute,
            textDecoration: 'none', letterSpacing: '-0.01em',
          }}>
            {statusLine.text}{statusLine.urgent ? ' →' : ''}
          </Link>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '24px clamp(28px, 4vw, 56px)', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Green next-move card */}
        {nextMove && (
          <div style={{
            background: GREEN.accent, borderRadius: 14,
            padding: 'clamp(24px, 3vw, 32px)',
            position: 'relative', overflow: 'hidden',
          }}>
            <GhostGlyph opacity={0.08}>▶</GhostGlyph>
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
        )}

        {/* Assets card */}
        <SectionCard>
          <GhostGlyph>▶</GhostGlyph>
          <SectionHeader eyebrow="Profile" label="Assets." href="/assets" linkText="Open Library" />
          <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
            {[
              { label: 'Current reel', value: reelAsset?.name ?? 'Not uploaded', age: reelAsset ? daysSince(reelAsset.created_at) : null },
              { label: 'Resume', value: resumeAsset ? `v${resumeAsset.version}` : 'Not uploaded', age: resumeAsset ? daysSince(resumeAsset.created_at) : null },
              { label: 'Transcript', value: transcriptAsset ? 'Current' : 'Not uploaded', age: transcriptAsset ? daysSince(transcriptAsset.created_at) : null },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${SD.line}` }}>
                <span style={{ fontSize: 13, color: SD.inkMid, fontWeight: 500 }}>{row.label}</span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: SD.ink }}>{row.value}</span>
                  {row.age !== null && (
                    <span style={{ fontSize: 11, marginLeft: 6, fontWeight: 600, color: freshnessColor(row.age) }}>
                      {daysAgoText(row.age)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Message inventory card */}
        <SectionCard>
          <GhostGlyph>{activeMessageCount}</GhostGlyph>
          <SectionHeader eyebrow="Messaging" label="Message Inventory." href="/messages" linkText="Open Messages" />
          <div style={{ display: 'flex', gap: 24, position: 'relative', zIndex: 1 }}>
            {[
              { n: activeMessageCount, label: 'active messages' },
              { n: activeQuestionCount, label: 'questions' },
              { n: activeMessageCount - activeQuestionCount, label: 'updates' },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontSize: 28, fontWeight: 700, color: SD.ink, letterSpacing: '-0.03em' }}>{item.n}</div>
                <div style={{ fontSize: 12, color: SD.inkLo, marginTop: 2 }}>{item.label}</div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* School list card */}
        <SectionCard>
          <GhostGlyph>{totalSchools}</GhostGlyph>
          <SectionHeader eyebrow="Target list" label="School List." href="/schools" linkText="Open Schools" />
          <div style={{ display: 'flex', gap: 24, alignItems: 'baseline', position: 'relative', zIndex: 1 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: SD.ink, letterSpacing: '-0.03em' }}>{totalSchools}</div>
              <div style={{ fontSize: 12, color: SD.inkLo, marginTop: 2 }}>active schools</div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              {(['A', 'B', 'C'] as const).map(tier => (
                <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: 5,
                    background: tier === 'A' ? '#DCFCE7' : tier === 'B' ? '#DBEAFE' : '#FEF3C7',
                    color: tier === 'A' ? '#166534' : tier === 'B' ? '#1E40AF' : '#92400E',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                  }}>{tier}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: SD.ink }}>{tierCounts[tier]}</span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* School Discovery placeholder */}
        <SectionCard style={{ border: `1.5px dashed ${SD.line}`, background: SD.paper }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: SD.inkMute, fontStyle: 'italic' }}>School Discovery.</h3>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: GREEN.accent, background: GREEN.accentSoft, border: `1px solid ${GREEN.accent}30`, borderRadius: 4, padding: '2px 8px' }}>Coming soon</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: SD.inkMute, lineHeight: 1.6 }}>
            Browse by division, region, and academics — then find more schools like the ones you love.
          </p>
        </SectionCard>
      </div>
    </div>
  )
}

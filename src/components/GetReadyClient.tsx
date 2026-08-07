'use client'

import Link from 'next/link'
import DiscoverSection from '@/components/get-ready/DiscoverSection'
import type { PlayerScores } from '@/lib/types'

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
  // All assets fresh — point at Discovery: the next move is widening the list.
  return {
    headline: 'Widen the list.',
    body: 'Profile and film are current. Now grow the target list — browse by division, region, and academics, or find more like the schools you already like.',
    href: '#discover',
    buttonText: 'Discover schools →',
  }
}

// ─── Visual asset cards ───────────────────────────────────────────────────────

function ReelCard({ reelAsset }: { reelAsset: { name: string; created_at: string } | null }) {
  const present = !!reelAsset
  const age = present ? daysSince(reelAsset!.created_at) : null
  return (
    <Link href="/assets" style={{ textDecoration: 'none' }}>
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: present ? '#fff' : SD.paper,
        border: present ? `1px solid ${SD.line}` : `1.5px dashed ${SD.line}`,
        borderRadius: 14, padding: 'clamp(22px, 3vw, 30px)', minHeight: 128,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}>
        <div style={{
          position: 'absolute', top: '50%', right: 'clamp(16px, 3vw, 36px)', transform: 'translateY(-50%)',
          fontSize: 128, lineHeight: 1, color: GREEN.accent, opacity: present ? 0.1 : 0.06,
          pointerEvents: 'none', userSelect: 'none',
        }}>▶</div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: GREEN.accent, marginBottom: 6 }}>Highlight reel</div>
          <div style={{ fontSize: 'clamp(17px, 2.2vw, 20px)', fontWeight: 700, color: present ? SD.ink : SD.inkMute, fontStyle: 'italic', letterSpacing: '-0.02em', lineHeight: 1.25, maxWidth: '70%' }}>
            {present ? reelAsset!.name : 'No reel uploaded'}
          </div>
          {age !== null && (
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: freshnessColor(age) }}>
              Updated {daysAgoText(age)}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

function DocCard({ label, glyph, value, age, present }: {
  label: string; glyph: string; value: string; age: number | null; present: boolean
}) {
  return (
    <Link href="/assets" style={{ textDecoration: 'none' }}>
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: present ? '#fff' : SD.paper,
        border: present ? `1px solid ${SD.line}` : `1.5px dashed ${SD.line}`,
        borderRadius: 12, padding: 16, minHeight: 96,
      }}>
        <div style={{ position: 'absolute', top: -6, right: 8, fontSize: 64, lineHeight: 1, color: SD.ink, opacity: 0.05, pointerEvents: 'none', userSelect: 'none' }}>{glyph}</div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: SD.inkLo, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: present ? SD.ink : SD.inkMute }}>{value}</div>
          {age !== null && <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: freshnessColor(age) }}>{daysAgoText(age)}</div>}
        </div>
      </div>
    </Link>
  )
}

// Scores are DATA — this card shows the numbers from player_profile.player_scores.
function TestScoresCard({ scores, reportCount }: { scores: PlayerScores | null; reportCount: number }) {
  const sat = scores?.sat
  const ap = scores?.ap ?? []
  const has = !!(sat || ap.length)
  return (
    <Link href="/assets" style={{ textDecoration: 'none' }}>
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: '#fff', border: `1px solid ${SD.line}`, borderRadius: 12, padding: 16, minHeight: 96,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: GREEN.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Test scores</div>
        {has ? (
          <>
            {sat && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: SD.ink, letterSpacing: '-0.03em' }}>{sat.total}</span>
                <span style={{ fontSize: 12, color: SD.inkLo }}>SAT · {sat.math}M / {sat.ebrw}V</span>
              </div>
            )}
            {ap.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {ap.map(a => (
                  <span key={a.subject} style={{ fontSize: 11, fontWeight: 600, color: SD.inkMid, background: SD.paper, border: `1px solid ${SD.line}`, borderRadius: 4, padding: '2px 6px' }}>
                    {a.subject} <span style={{ color: GREEN.accent, fontWeight: 800 }}>{a.score}</span>
                  </span>
                ))}
              </div>
            )}
            {scores?.note && <div style={{ marginTop: 8, fontSize: 11, color: SD.inkLo, fontStyle: 'italic' }}>{scores.note}</div>}
            {reportCount > 0 && <div style={{ marginTop: 8, fontSize: 10, color: SD.inkMute }}>{reportCount} score report{reportCount !== 1 ? 's' : ''} in Library →</div>}
          </>
        ) : (
          <div style={{ fontSize: 14, color: SD.inkMute }}>No scores recorded</div>
        )}
      </div>
    </Link>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GetReadyClient({
  reelAsset,
  resumeAsset,
  transcriptAsset,
  playerScores,
  testScoresCount,
  activeMessageCount,
  activeQuestionCount,
  tierCounts,
  totalSchools,
}: {
  reelAsset: { name: string; created_at: string } | null
  resumeAsset: { name: string; version: number; created_at: string } | null
  transcriptAsset: { name: string; created_at: string } | null
  playerScores: PlayerScores | null
  testScoresCount: number
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

        {/* Assets — visual cards */}
        <div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: GREEN.accent, marginBottom: 4 }}>Profile</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: SD.ink, fontStyle: 'italic' }}>Assets.</h3>
              <Link href="/assets" style={{ fontSize: 12, fontWeight: 600, color: GREEN.accent, textDecoration: 'none', letterSpacing: '-0.01em' }}>Open Library →</Link>
            </div>
          </div>

          {/* Reel — the largest card, ghost play-triangle anchor */}
          <ReelCard reelAsset={reelAsset} />

          {/* Document + scores cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
            <DocCard label="Resume" glyph="▤" value={resumeAsset ? `v${resumeAsset.version}` : 'Not uploaded'}
              age={resumeAsset ? daysSince(resumeAsset.created_at) : null} present={!!resumeAsset} />
            <DocCard label="Transcript" glyph="▤" value={transcriptAsset ? 'Current' : 'Not uploaded'}
              age={transcriptAsset ? daysSince(transcriptAsset.created_at) : null} present={!!transcriptAsset} />
            <TestScoresCard scores={playerScores} reportCount={testScoresCount} />
          </div>
        </div>

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

        {/* School Discovery — live */}
        <DiscoverSection />
      </div>
    </div>
  )
}

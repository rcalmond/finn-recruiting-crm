'use client'

import Link from 'next/link'
import DiscoverSection from '@/components/get-ready/DiscoverSection'
import type { PlayerScores } from '@/lib/types'

// Brand chrome (Throughball, Brand Sweep Pass 2). The one accent is --tb-pitch;
// GREEN is repointed at it so every chrome use migrates from the old emerald to
// the shared token. DATA-semantic ramps (tier/depth/selectivity/division bars)
// are inlined below and NOT routed through this — the firewall holds.
const PITCH = '#1F6B48'
const PITCH_SOFT = '#E3EFE9' // subtle active-state tint (a fill, not cream)
const CREAM = '#FBF6EC'      // SOLID on green/ink fills — never opacity-blended (AA)
const WARM_WHITE = '#FFFDF9'
const GREEN = { accent: PITCH, accentSoft: PITCH_SOFT, accentDeep: PITCH }
const SD = {
  paper: '#F6F1E8', ink: '#1A1A1A', inkMid: '#4A4A4A', inkLo: '#6B655A',
  inkMute: '#8A8478', line: '#E2DBC9',
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

// Compact age: 5d / 3w / 2mo / 1y
function ageShort(n: number): string {
  if (n < 7) return `${n}d`
  if (n < 28) return `${Math.round(n / 7)}w`
  if (n < 365) return `${Math.round(n / 30)}mo`
  return `${Math.round(n / 365)}y`
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

// Zone header — a single bold-italic header with a trailing period (no eyebrow).
// Optional supporting line + optional right-side link (house "Open X →" pattern).
function ZoneHeader({ title, sub, href, linkText }: { title: string; sub?: string; href?: string; linkText?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 'clamp(23px, 3.2vw, 30px)', fontWeight: 700, letterSpacing: '-0.03em', color: SD.ink, fontStyle: 'italic' }}>
          {title.replace(/\.$/, '')}<span style={{ color: PITCH }}>.</span>
        </h2>
        {href && (
          <Link href={href} style={{ fontSize: 12, fontWeight: 600, color: GREEN.accent, textDecoration: 'none', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
            {linkText} →
          </Link>
        )}
      </div>
      {sub && <p style={{ margin: '6px 0 0', fontSize: 13, color: SD.inkLo, lineHeight: 1.5, maxWidth: 540 }}>{sub}</p>}
    </div>
  )
}

// A card's own title + optional link (no eyebrow).
function CardTitle({ title, href, linkText }: { title: string; href?: string; linkText?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, position: 'relative', zIndex: 1 }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: SD.ink, fontStyle: 'italic' }}>{title.replace(/\.$/, '')}<span style={{ color: PITCH }}>.</span></h3>
      {href && <Link href={href} style={{ fontSize: 12, fontWeight: 600, color: GREEN.accent, textDecoration: 'none', letterSpacing: '-0.01em' }}>{linkText ?? 'View all'} →</Link>}
    </div>
  )
}

// Unified metric row: LABEL (small caps, left) · segmented bar · legend with
// counts. One consistent format for every dimension of the target list. A
// white hairline divides adjacent segments so even a 90/10 split reads as two.
// Counts always appear in the legend — color is never the only carrier.
function MetricRow({ label, segments }: { label: string; segments: { label: string; n: number; color: string }[] }) {
  const shown = segments.filter(s => s.n > 0)
  if (shown.length === 0) return null
  return (
    <div style={{ marginTop: 16, position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: GREEN.accent, width: 74, flexShrink: 0 }}>{label}</div>
        <div style={{ flex: 1, display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: SD.line }}>
          {shown.map((s, i) => (
            <div key={s.label} title={`${s.n} ${s.label}`} style={{
              flex: s.n, background: s.color,
              borderLeft: i > 0 ? '1.5px solid #fff' : 'none',
            }} />
          ))}
        </div>
      </div>
      <div style={{ marginLeft: 86, marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '3px 12px', fontSize: 11.5, color: SD.inkMid }}>
        {shown.map(s => (
          <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <b style={{ color: SD.ink }}>{s.n}</b> {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Next-move card logic ─────────────────────────────────────────────────────
// The single rule-derived message for this phase (there is no masthead status
// line — this card is the message). Precedence: stale/missing reel → stale/
// missing resume → all fresh, point at Discovery.

function getReadyNextMove(
  reelAsset: { created_at: string } | null,
  resumeAsset: { created_at: string } | null,
): { headline: string; body: string; href: string; buttonText: string } | null {
  if (!reelAsset || daysSince(reelAsset.created_at) > 90) {
    return {
      headline: 'Plan your fall reel.',
      body: 'Your reel is the first thing coaches watch. Fall club season is your refresh window — capture your footage now.',
      href: '/kit',
      buttonText: 'Open Library →',
    }
  }
  if (!resumeAsset || daysSince(resumeAsset.created_at) > 60) {
    return {
      headline: 'Update your resume.',
      body: 'Summer stats, new test scores, and your fall courseload — make sure coaches see your latest.',
      href: '/kit',
      buttonText: 'Open Library →',
    }
  }
  return {
    headline: 'Widen your list.',
    body: 'Your profile and film are current. Now grow your target list — browse by division, region, and academics, or let Regista find more like the schools you already like.',
    href: '#discover',
    buttonText: 'Discover schools →',
  }
}

// ─── The 2×2 asset grid — four equal-weight cards ─────────────────────────────
// Same frame for all four; each distinguished by glyph + content. All four
// headings use the phase-accent green.

const ASSET_CARD: React.CSSProperties = {
  position: 'relative', overflow: 'hidden',
  borderRadius: 14, padding: 'clamp(18px, 2.4vw, 22px)',
  minHeight: 150, height: '100%',
  display: 'flex', flexDirection: 'column',
}

function AssetCardFrame({ present, glyph, glyphColor, glyphOpacity, children }: {
  present: boolean; glyph: string; glyphColor?: string; glyphOpacity?: number; children: React.ReactNode
}) {
  return (
    <Link href="/kit" style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
      <div style={{
        ...ASSET_CARD,
        background: present ? '#fff' : SD.paper,
        border: present ? `1px solid ${SD.line}` : `1.5px dashed ${SD.line}`,
      }}>
        <div style={{
          position: 'absolute', top: -6, right: 6, fontSize: 92, lineHeight: 1,
          color: glyphColor ?? SD.ink, opacity: glyphOpacity ?? 0.05,
          pointerEvents: 'none', userSelect: 'none',
        }}>{glyph}</div>
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {children}
        </div>
      </div>
    </Link>
  )
}

// All four asset cards share the green heading treatment (phase accent).
function assetLabel(): React.CSSProperties {
  return { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: GREEN.accent, marginBottom: 8 }
}

function ReelCard({ reelAsset }: { reelAsset: { name: string; created_at: string } | null }) {
  const age = reelAsset ? daysSince(reelAsset.created_at) : null
  return (
    <AssetCardFrame present={!!reelAsset} glyph="▶" glyphColor={GREEN.accent} glyphOpacity={0.1}>
      <div style={assetLabel()}>Highlight reel</div>
      <div style={{ fontSize: 'clamp(16px, 2vw, 19px)', fontWeight: 700, color: reelAsset ? SD.ink : SD.inkMute, fontStyle: 'italic', letterSpacing: '-0.02em', lineHeight: 1.25, maxWidth: '78%' }}>
        {reelAsset ? reelAsset.name : 'Add your reel'}
      </div>
      <div style={{ marginTop: 'auto', paddingTop: 12 }}>
        {age !== null
          ? <span style={{ fontSize: 12, fontWeight: 600, color: freshnessColor(age) }}>Updated {daysAgoText(age)}</span>
          : <span style={{ fontSize: 12, fontWeight: 600, color: GREEN.accent }}>Upload in Library →</span>}
      </div>
    </AssetCardFrame>
  )
}

// Scores are DATA — the numbers come from player_profile.player_scores.
function ScoresCard({ scores }: { scores: PlayerScores | null }) {
  const sat = scores?.sat
  const ap = scores?.ap ?? []
  const has = !!(sat || ap.length)
  return (
    <AssetCardFrame present={has} glyph="★" glyphColor={GREEN.accent} glyphOpacity={0.08}>
      <div style={assetLabel()}>Test scores</div>
      {has ? (
        <>
          {sat && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'clamp(30px, 4vw, 38px)', fontWeight: 800, color: SD.ink, letterSpacing: '-0.03em', lineHeight: 1 }}>{sat.total}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: SD.inkLo }}>SAT · {sat.math}M / {sat.ebrw}V</span>
            </div>
          )}
          {ap.length > 0 && (
            <div style={{ marginTop: 'auto', paddingTop: 12, fontSize: 11.5, fontWeight: 500, color: SD.inkMid, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 800, color: SD.inkLo }}>AP</span>{' '}
              {ap.map(a => `${a.subject} ${a.score}`).join('  ·  ')}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 15, color: SD.inkMute }}>Add your test scores</div>
      )}
    </AssetCardFrame>
  )
}

function ResumeCard({ resumeAsset }: { resumeAsset: { version: number; created_at: string } | null }) {
  const age = resumeAsset ? daysSince(resumeAsset.created_at) : null
  return (
    <AssetCardFrame present={!!resumeAsset} glyph="▤" glyphColor={GREEN.accent} glyphOpacity={0.08}>
      <div style={assetLabel()}>Resume</div>
      {resumeAsset ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 'clamp(26px, 3.4vw, 32px)', fontWeight: 800, color: SD.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>v{resumeAsset.version}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: SD.inkLo }}>current</span>
        </div>
      ) : (
        <div style={{ fontSize: 15, color: SD.inkMute }}>Add your resume</div>
      )}
      <div style={{ marginTop: 'auto', paddingTop: 12 }}>
        {age !== null && <span style={{ fontSize: 12, fontWeight: 600, color: freshnessColor(age) }}>Updated {daysAgoText(age)}</span>}
      </div>
    </AssetCardFrame>
  )
}

function TranscriptCard({ transcriptAsset }: { transcriptAsset: { created_at: string } | null }) {
  const age = transcriptAsset ? daysSince(transcriptAsset.created_at) : null
  return (
    <AssetCardFrame present={!!transcriptAsset} glyph="☰" glyphColor={GREEN.accent} glyphOpacity={0.09}>
      <div style={assetLabel()}>Transcript</div>
      {transcriptAsset ? (
        <div style={{ fontSize: 'clamp(21px, 2.6vw, 25px)', fontWeight: 800, color: SD.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>Current</div>
      ) : (
        <div style={{ fontSize: 15, color: SD.inkMute }}>Add your transcript</div>
      )}
      <div style={{ marginTop: 'auto', paddingTop: 12 }}>
        {age !== null && <span style={{ fontSize: 12, fontWeight: 600, color: freshnessColor(age) }}>Updated {daysAgoText(age)}</span>}
      </div>
    </AssetCardFrame>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

type TalkingPoints = {
  newestTitle: string | null
  newestAgeDays: number | null
  staleCount: number
  coveragePct: number | null
}
type ListInsights = {
  depth: { advancing: number; evaluating: number; building: number }
  selectivity: { most_selective: number; highly_selective: number; selective: number; accessible: number; unrated: number }
  division: { D1: number; D2: number; D3: number; other: number }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GetReadyClient({
  reelAsset,
  resumeAsset,
  transcriptAsset,
  playerScores,
  talkingPoints,
  listInsights,
  tierCounts,
  totalSchools,
}: {
  reelAsset: { name: string; created_at: string } | null
  resumeAsset: { name: string; version: number; created_at: string } | null
  transcriptAsset: { name: string; created_at: string } | null
  playerScores: PlayerScores | null
  testScoresCount: number
  talkingPoints: TalkingPoints
  listInsights: ListInsights
  tierCounts: { A: number; B: number; C: number }
  totalSchools: number
}) {
  const nextMove = getReadyNextMove(reelAsset, resumeAsset)
  const { newestTitle, newestAgeDays, staleCount, coveragePct } = talkingPoints
  const { depth, selectivity, division } = listInsights

  // One color discipline per row: tier reuses the established chip colors
  // (categorical); depth/selectivity/division each use a single hue family with
  // clearly stepped lightness so adjacent segments read at bar height.
  const tierSegments = [
    { label: 'A', n: tierCounts.A, color: '#166534' },
    { label: 'B', n: tierCounts.B, color: '#1E40AF' },
    { label: 'C', n: tierCounts.C, color: '#92400E' },
  ]
  const depthSegments = [
    { label: 'advancing', n: depth.advancing, color: '#B5502F' },
    { label: 'evaluating', n: depth.evaluating, color: '#CE8468' },
    { label: 'building', n: depth.building, color: '#E8C5B4' },
  ]
  // DATA-semantic selectivity ramp — a stepped green family for the segmented
  // bar. Inlined literals (NOT the brand token) so the data read is untouched by
  // the chrome migration. Firewall: this is meaning, not brand chrome.
  const selectivitySegments = [
    { label: 'most selective', n: selectivity.most_selective, color: '#1B4332' },
    { label: 'highly selective', n: selectivity.highly_selective, color: '#2D6A4F' },
    { label: 'selective', n: selectivity.selective, color: '#5B9C7B' },
    { label: 'accessible', n: selectivity.accessible, color: '#A7D9BF' },
    { label: 'unrated', n: selectivity.unrated, color: '#CFC8BA' },
  ]
  const divisionSegments = [
    { label: 'D1', n: division.D1, color: '#334155' },
    { label: 'D2', n: division.D2, color: '#64748B' },
    { label: 'D3', n: division.D3, color: '#B8C2CD' },
    { label: 'other', n: division.other, color: '#CFC8BA' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: SD.paper, fontFamily: "'Inter', -apple-system, sans-serif", paddingBottom: 80 }}>
      {/* Masthead — phase name + subtitle only (no status line; the next-move card is the message) */}
      <div style={{ padding: '24px clamp(28px, 4vw, 56px) 4px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(56px, 7vw, 88px)', fontWeight: 700, letterSpacing: '-0.04em', color: SD.ink, lineHeight: 0.95, fontStyle: 'italic' }}>Get Ready<span style={{ color: PITCH }}>.</span></h1>
        <p style={{ margin: '12px 0 0', fontSize: 15, color: SD.inkLo, fontWeight: 450, letterSpacing: '-0.01em' }}>
          Build your list and your profile so coaches take notice.
        </p>
      </div>

      {/* Content */}
      <div style={{ padding: '24px clamp(28px, 4vw, 56px)', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* Next-move card — the single rule-derived message */}
        {nextMove && (
          <div style={{
            background: GREEN.accent, borderRadius: 14,
            padding: 'clamp(24px, 3vw, 32px)',
            position: 'relative', overflow: 'hidden',
          }}>
            <GhostGlyph opacity={0.08}>▶</GhostGlyph>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: CREAM, marginBottom: 6 }}>Next move</div>
              <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: WARM_WHITE, fontStyle: 'italic', letterSpacing: '-0.02em' }}>{nextMove.headline}</h3>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: CREAM, lineHeight: 1.55 }}>{nextMove.body}</p>
              <Link href={nextMove.href} style={{
                display: 'inline-block', padding: '7px 16px', fontSize: 12, fontWeight: 650,
                color: CREAM, border: `1.5px solid ${CREAM}`, borderRadius: 999,
                textDecoration: 'none', letterSpacing: '-0.01em',
              }}>
                {nextMove.buttonText}
              </Link>
            </div>
          </div>
        )}

        {/* ── The kit: the 2×2 asset grid ────────────────────────── */}
        <div>
          <ZoneHeader title="The kit." href="/kit" linkText="Open the kit" />
          <div className="gr-asset-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <ReelCard reelAsset={reelAsset} />
            <ScoresCard scores={playerScores} />
            <ResumeCard resumeAsset={resumeAsset} />
            <TranscriptCard transcriptAsset={transcriptAsset} />
          </div>
        </div>

        {/* ── Talking points — standalone card between the kit and the list ─── */}
        <SectionCard>
          <GhostGlyph opacity={0.05}>❝</GhostGlyph>
          <CardTitle title="Your talking points." href="/talking-points" linkText="Open Talking Points" />
          <p style={{ margin: '0 0 14px', fontSize: 13, color: SD.inkLo, lineHeight: 1.5, maxWidth: 560, position: 'relative', zIndex: 1 }}>
            The updates, questions, and storylines that fuel your outreach — so every email has something worth saying.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', zIndex: 1 }}>
            {newestTitle && newestAgeDays !== null && (
              <div style={{ fontSize: 13.5, color: SD.inkMid, lineHeight: 1.55 }}>
                Newest: <span style={{ fontWeight: 600, color: SD.ink }}>{newestTitle}</span>
                {', '}{newestAgeDays === 0 ? 'today' : `${ageShort(newestAgeDays)} ago`}
                {staleCount > 0 && <> · <span style={{ fontWeight: 700, color: SD.amber }}>{staleCount} going stale</span></>}
              </div>
            )}
            {coveragePct !== null && (
              <div style={{ fontSize: 13.5, color: SD.inkMid, lineHeight: 1.55 }}>
                Your top schools have heard <span style={{ fontWeight: 800, color: GREEN.accent }}>{coveragePct}%</span> of your story.
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── The list: summary + insights + Discover ────────────── */}
        <div>
          <ZoneHeader title="The list." />

          <SectionCard>
            <GhostGlyph>{totalSchools}</GhostGlyph>
            <CardTitle title="Your targets." href="/schools" linkText="Open Schools" />

            {/* Total */}
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: SD.ink, letterSpacing: '-0.03em' }}>{totalSchools}</div>
              <div style={{ fontSize: 12, color: SD.inkLo, marginTop: 2 }}>active schools</div>
            </div>

            {/* Unified metric rows */}
            <MetricRow label="Tier" segments={tierSegments} />
            <MetricRow label="Depth" segments={depthSegments} />
            <MetricRow label="Selectivity" segments={selectivitySegments} />
            <MetricRow label="Division" segments={divisionSegments} />
          </SectionCard>

          {/* Discover — the featured citizen of this zone */}
          <div style={{ marginTop: 12 }}>
            <DiscoverSection />
          </div>
        </div>
      </div>

      {/* Responsive: 2×2 asset grid collapses to a single column */}
      <style>{`
        @media (max-width: 600px) {
          .gr-asset-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

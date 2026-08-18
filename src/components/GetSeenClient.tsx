'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useSchools } from '@/hooks/useRealtimeData'
import { computeReelCoverage } from '@/lib/strategic-prompts'
import { summarizeRq } from '@/lib/rq'
import BatchReelModal from '@/components/today/BatchReelModal'
import MergedTimeline, { buildMerged, type MergedItem, type UpcomingCampItem, type TimelineEventItem } from '@/components/get-seen/MergedTimeline'

// Brand chrome (Throughball, Brand Sweep Pass 3B). The old petrol jewel accent
// and the freshness green are repointed at the shared --tb-pitch token. The
// timeline's DATA dot colors live in MergedTimeline and are NOT touched here.
const PITCH = '#1F6B48'
const CREAM = '#FBF6EC'      // SOLID on pitch/ink fills (AA)
const WARM_WHITE = '#FFFDF9'
const GREEN = { accent: PITCH, accentSoft: '#E3EFE9', accentDeep: PITCH }   // freshness ≤30d
const PETROL = { accent: PITCH, soft: CREAM, deep: PITCH }                  // was #0E5F6B
const SD = {
  paper: '#F6F1E8', ink: '#1A1A1A', inkMid: '#4A4A4A', inkLo: '#6B655A',
  inkMute: '#8A8478', line: '#E2DBC9', lineWarm: '#DDD5C3', cream: CREAM,
  rust: '#B5502F', rustSoft: '#FAF0EA', amber: '#D4A017', event: '#5B7A99', eventSoft: '#E7EDF3',
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

// ─── Next-move (merged) — the single page message (no status line) ──────────────

function getNextMove(items: MergedItem[], activeCampaignCount: number): { headline: string; body: string; href: string; buttonText: string } {
  const n = items[0]
  if (n && n.kind === 'outreach_moment') {
    return {
      headline: `${n.label} — ${n.d <= 0 ? 'today' : n.d === 1 ? 'tomorrow' : `${n.d} days out`}.`,
      body: 'A send moment is coming up. Line up which schools it targets and have your material ready before the date.',
      href: '/calendar', buttonText: 'Open Events →',
    }
  }
  if (n) {
    const isCamp = n.source === 'camp'
    return {
      headline: `${n.label} — ${n.d <= 0 ? 'today' : n.d === 1 ? 'tomorrow' : `${n.d} days out`}.`,
      body: isCamp
        ? 'Your nearest event on the calendar. Review the coaching staff and prep your intro.'
        : 'A showcase or tournament is coming up. Confirm your attendance and note which coaches will be there.',
      href: '/calendar', buttonText: 'Open Calendar →',
    }
  }
  return {
    headline: 'Plan your fall showcase circuit.',
    body: 'Nothing upcoming. Fall ID camps and showcases are your next exposure window — build the schedule now.',
    href: activeCampaignCount > 0 ? '/campaigns' : '/calendar',
    buttonText: activeCampaignCount > 0 ? 'Open Campaigns →' : 'Open Calendar →',
  }
}

// ─── Layout primitives ──────────────────────────────────────────────────────────

function ZoneHeader({ title, href, linkText }: { title: string; href?: string; linkText?: string }) {
  return (
    <div style={{ marginBottom: 16, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 'clamp(23px, 3.2vw, 30px)', fontWeight: 700, letterSpacing: '-0.03em', color: SD.ink, fontStyle: 'italic' }}>{title.replace(/\.$/, '')}<span style={{ color: PITCH }}>.</span></h2>
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
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: SD.ink, fontStyle: 'italic' }}>{title.replace(/\.$/, '')}<span style={{ color: PITCH }}>.</span></h3>
        {href && <Link href={href} style={{ fontSize: 12, fontWeight: 600, color: PETROL.accent, textDecoration: 'none', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{linkText} →</Link>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>{children}</div>
    </div>
  )
}

const pillLink: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
  background: PETROL.accent, color: CREAM, borderRadius: 999, fontSize: 12, fontWeight: 650,
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
  const onItemClick = () => router.push('/calendar')

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

  // Server-fetched props are complete by construction — zero schools is a real
  // state (a new family), never "still loading". No length-derived gate.
  const activeSchools = schools.filter(s => s.category !== 'Nope' && s.status !== 'Inactive')

  // RQ metric (active A/B/C) — derived via the shared helper so the card and
  // the /questionnaires page can't disagree.
  const rq = summarizeRq(activeSchools)
  const rqCompleted = rq.current + rq.needsUpdate // status = Completed (fresh or stale)
  const rqNotStarted = activeSchools.filter(s => s.rq_status !== 'Completed')

  // Reel coverage — reuse the reel_coverage prompt computation (A/B tier).
  const cov = computeReelCoverage(schools, reelUrl, batchSentIds)
  const reelHave = cov.total - cov.count

  return (
    <div style={{ minHeight: '100vh', background: SD.paper, fontFamily: "'Inter', -apple-system, sans-serif", paddingBottom: 80 }}>
      {/* Masthead — name + purpose subtitle only (no status line) */}
      <div style={{ padding: '24px clamp(28px, 4vw, 56px) 4px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(56px, 7vw, 88px)', fontWeight: 700, letterSpacing: '-0.04em', color: SD.ink, lineHeight: 0.95, fontStyle: 'italic' }}>Get Seen<span style={{ color: PITCH }}>.</span></h1>
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
            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: WARM_WHITE, fontStyle: 'italic', letterSpacing: '-0.02em' }}>{nextMove.headline}</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: CREAM, lineHeight: 1.55 }}>{nextMove.body}</p>
            <Link href={nextMove.href} style={{ display: 'inline-block', padding: '7px 16px', fontSize: 12, fontWeight: 650, color: SD.cream, border: `1.5px solid ${SD.cream}`, borderRadius: 999, textDecoration: 'none', letterSpacing: '-0.01em' }}>
              {nextMove.buttonText}
            </Link>
          </div>
        </div>

        {/* ── Zone A: The calendar ───────────────────────────────── */}
        <div>
          <ZoneHeader title="The calendar." href="/calendar" linkText="Manage on Calendar" />
          <SectionCard>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: PETROL.accent, marginBottom: 4 }}>Next 10 weeks</div>
            <MergedTimeline
              camps={upcomingCamps}
              events={upcomingEvents}
              onItemClick={onItemClick}
              emptyText="Nothing in the next 10 weeks. Add camps, showcases, or outreach moments on the Camps page."
            />
          </SectionCard>
        </div>

        {/* ── Zone B: Every way in ───────────────────────────────── */}
        <div>
          <ZoneHeader title="Every way in." />
          <div className="gs-toolkit" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>

            {/* 1. Questionnaires */}
            <ToolCard title="Recruiting questionnaires." href="/questionnaires" linkText="Open workbench">
              <p style={{ margin: '0 0 12px', fontSize: 13, color: SD.inkMid, lineHeight: 1.5 }}>
                Every program&apos;s first filter — free to complete, noticed when missing.
              </p>
              <div style={{ marginTop: 'auto' }}>
                {(
                  <>
                    <div style={{ fontSize: 20, fontWeight: 800, color: SD.ink, letterSpacing: '-0.02em' }}>
                      {rqCompleted} <span style={{ fontSize: 13, fontWeight: 600, color: SD.inkLo }}>of {rq.total} complete</span>
                    </div>
                    {rq.needsUpdate > 0 && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: SD.rust, marginTop: 4 }}>{rq.needsUpdate} need an update</div>
                    )}
                    {rqNotStarted.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {rqNotStarted.map(s => (
                          <span key={s.id} style={{ fontSize: 11, fontWeight: 600, color: SD.rust, background: SD.rustSoft, border: `1px solid #EAD5CC`, borderRadius: 999, padding: '2px 9px' }}>
                            {s.short_name || s.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
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
                    {cov.total > 0 && (
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
                        color: (!reelUrl || cov.allTargetSchoolIds.length === 0) ? SD.inkMute : CREAM,
                      }}
                    >
                      {cov.allTargetSchoolIds.length === 0 ? 'All top schools have it ✓' : 'Send your reel →'}
                    </button>
                  </>
                ) : (
                  <Link href="/kit" style={{ ...pillLink }}>Add your reel →</Link>
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
          .gs-toolkit { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

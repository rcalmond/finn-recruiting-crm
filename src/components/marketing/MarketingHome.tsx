'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ThroughballMark, ThroughballWordmark } from '@/components/brand/ThroughballLogo'

// ─── Brand tokens (Throughball — Brand Sweep Pass 1) ─────────────────────────
// The one-accent system: Pitch Green points, ink carries weight, warm neutrals
// hold the ground. See /docs/throughball-brand-guidelines.md §5.

const T = {
  parchment:  '#F6F1E8',
  warmWhite:  '#FFFDF9',
  ink:        '#1A1A1A',
  muted:      '#6B655A',
  faint:      '#8A8478',
  border:     '#E2DBC9',
  borderDeep: '#C9C2B2',
  pitch:      '#1F6B48',
  pitchLight: '#7BC49A',
  cream:      '#FBF6EC', // SOLID on ink/green fills — never opacity-blended (AA)
}

// The ghost-numeral ramp — momentum shown through DEPTH, not hue.
// 01 faint parchment-tone → 02 warm tan → 03 green → 04 full ink.
const RAMP = ['#E2DBC9', '#D8C9A8', '#1F6B48', '#1A1A1A']

// ─── Session-aware header CTA ────────────────────────────────────────────────

function HeaderCTA() {
  const [state, setState] = useState<'loading' | 'in' | 'out'>('loading')

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      setState(data.user ? 'in' : 'out')
    }).catch(() => {
      if (!cancelled) setState('out')
    })
    return () => { cancelled = true }
  }, [])

  const signedIn = state === 'in'

  return (
    <div style={{ visibility: state === 'loading' ? 'hidden' : 'visible', minWidth: 96, display: 'flex', justifyContent: 'flex-end' }}>
      <Link
        href={signedIn ? '/get-recruited' : '/auth/login'}
        style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '8px 16px', borderRadius: 999,
          background: T.ink, color: T.cream,
          fontSize: 13, fontWeight: 650, letterSpacing: '-0.01em',
          textDecoration: 'none', whiteSpace: 'nowrap',
        }}
      >
        {signedIn ? 'Open Throughball →' : 'Start free'}
      </Link>
    </div>
  )
}

// ─── Small building blocks ───────────────────────────────────────────────────

function Eyebrow({ text, color }: { text: string; color?: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.12em', color: color ?? T.faint, marginBottom: 14,
    }}>
      {text}
    </div>
  )
}

// "Throughball." period accent for headings
function Dot() {
  return <span style={{ color: T.pitch }}>.</span>
}

// ─── The board: 2×2 quadrant illustration ────────────────────────────────────
// The product's data taxonomy shown as-is — tier dots and temperature zones keep
// their own colors (DATA-SEMANTIC firewall). The brand chrome around them is
// green-and-ink; the data rainbow governs meaning. Chips are recognizable
// programs from the discovery universe — an ILLUSTRATION, not a real pipeline.

type ChipSchool = { name: string; tier: 'A' | 'B' | 'C' }
const TIER_DOT: Record<string, string> = { A: '#166534', B: '#1E40AF', C: '#92400E' } // tier data — untouched

type QuadKey = 'deepHot' | 'shallowHot' | 'deepCold' | 'shallowCold'
// Temperature-zone tints — data illustration (the recency axis), left intact.
const QUAD_TINT: Record<QuadKey, string> = {
  deepHot: 'rgba(208, 74, 46, 0.10)',
  shallowHot: 'rgba(30, 64, 175, 0.07)',
  deepCold: 'rgba(232, 163, 60, 0.12)',
  shallowCold: 'rgba(156, 163, 168, 0.10)',
}
const QUAD_BORDER: Record<QuadKey, string> = {
  deepHot: 'rgba(208, 74, 46, 0.30)',
  shallowHot: 'rgba(30, 64, 175, 0.22)',
  deepCold: 'rgba(232, 163, 60, 0.32)',
  shallowCold: 'rgba(156, 163, 168, 0.30)',
}

const QUADRANTS: { key: QuadKey; label: string; schools: ChipSchool[] }[] = [
  { key: 'shallowHot',  label: 'Convert', schools: [
    { name: 'UCLA', tier: 'A' }, { name: 'Providence', tier: 'B' }, { name: 'Grand Canyon', tier: 'C' }, { name: 'Rollins', tier: 'B' }, { name: 'Messiah', tier: 'C' },
  ] },
  { key: 'deepHot',     label: 'Close',   schools: [
    { name: 'Georgetown', tier: 'A' }, { name: 'Denver', tier: 'B' }, { name: 'Tampa', tier: 'C' }, { name: 'Amherst', tier: 'A' }, { name: 'Kenyon', tier: 'B' },
  ] },
  { key: 'shallowCold', label: 'Nudge',   schools: [
    { name: 'Wake Forest', tier: 'A' }, { name: 'Vermont', tier: 'B' }, { name: 'Colorado Mesa', tier: 'C' }, { name: 'Calvin', tier: 'C' }, { name: 'Trinity (CT)', tier: 'B' },
  ] },
  { key: 'deepCold',    label: 'Re-warm', schools: [
    { name: 'Indiana', tier: 'A' }, { name: 'Creighton', tier: 'B' }, { name: 'Chico State', tier: 'C' }, { name: 'Ohio Wesleyan', tier: 'C' }, { name: 'Conn College', tier: 'B' },
  ] },
]

function BoardChip({ school }: { school: ChipSchool }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 999,
      border: `1px solid ${T.border}`,
      background: T.warmWhite, fontSize: 11, fontWeight: 600, color: T.ink,
      whiteSpace: 'nowrap', lineHeight: 1.4,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: TIER_DOT[school.tier] }} />
      {school.name}
    </span>
  )
}

function QuadrantBoard() {
  return (
    <div className="mh-quad" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {QUADRANTS.map(q => (
        <div key={q.key} className={`mh-quad-cell mh-quad-${q.key}`} style={{
          background: QUAD_TINT[q.key], border: `1px solid ${QUAD_BORDER[q.key]}`,
          borderRadius: 12, padding: '15px 16px 18px', minHeight: 108, position: 'relative',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
            color: T.muted,
          }}>
            {q.label}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {q.schools.map(s => <BoardChip key={s.name} school={s} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── The Roadmap — four numbered acts, one color deepening ───────────────────

const ACTS = [
  { n: '01', name: 'Get Ready', desc: 'Build your profile, your film, and your list — and see at a glance what has gone stale.' },
  { n: '02', name: 'Get Seen',  desc: 'Get in front of the right coaches — camps, showcases, and outreach on one calendar.' },
  { n: '03', name: 'Get Recruited', desc: 'Work every conversation. Your next move ranked at the top, the rest lined up behind it.' },
  { n: '04', name: 'Get In', desc: 'Offers, admissions, the decision — deadlines side by side, decided on your terms.' },
]

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MarketingHome() {
  const roadmapRef = useRef<HTMLDivElement>(null)

  const primaryPill: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '13px 26px', borderRadius: 999, background: T.pitch, color: T.cream,
    fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', textDecoration: 'none',
  }
  const secondaryPill: React.CSSProperties = {
    all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '13px 26px', borderRadius: 999, border: `1.5px solid ${T.borderDeep}`,
    fontSize: 15, fontWeight: 650, color: T.ink, letterSpacing: '-0.01em',
    fontFamily: 'inherit', textDecoration: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', background: T.parchment, fontFamily: "'Inter', -apple-system, sans-serif", color: T.ink }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px clamp(20px, 5vw, 56px)', maxWidth: 1120, margin: '0 auto',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <ThroughballWordmark size={20} />
        </Link>
        <HeaderCTA />
      </header>

      {/* ── 1. Hero ────────────────────────────────────────────── */}
      <section style={{ padding: 'clamp(28px, 6vw, 64px) clamp(20px, 5vw, 56px) clamp(28px, 5vw, 56px)', maxWidth: 1120, margin: '0 auto' }}>
        <ThroughballMark size={210} treatment="pitch" showRunner={false} style={{ marginBottom: 18 }} />
        <h1 style={{
          margin: 0, fontSize: 'clamp(42px, 7.5vw, 84px)', fontWeight: 800,
          letterSpacing: '-0.035em', color: T.ink, lineHeight: 1.0, fontStyle: 'italic',
          maxWidth: 940,
        }}>
          Your kid does the running.<br /><span style={{ color: T.pitch }}>We play the pass.</span>
        </h1>
        <p style={{
          margin: '22px 0 0', fontSize: 'clamp(16px, 2.2vw, 20px)', color: T.muted,
          fontWeight: 450, lineHeight: 1.5, maxWidth: 600, letterSpacing: '-0.01em',
        }}>
          Every coach reply read, every next move weighted, every email perfectly timed. The assist for your kid&apos;s recruiting.
        </p>
        <div className="mh-hero-ctas" style={{ display: 'flex', gap: 12, marginTop: 30, flexWrap: 'wrap' }}>
          <Link href="/demo" style={primaryPill}>Start free →</Link>
          <button onClick={() => roadmapRef.current?.scrollIntoView({ behavior: 'smooth' })} style={secondaryPill}>
            See how it works
          </button>
        </div>
      </section>

      {/* ── 2. The Throughball Roadmap ─────────────────────────── */}
      <section ref={roadmapRef} style={{ padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 56px)', maxWidth: 1120, margin: '0 auto' }}>
        <Eyebrow text="The journey" />
        <h2 style={{ margin: '0 0 8px', fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 800, letterSpacing: '-0.03em', color: T.ink, fontStyle: 'italic' }}>
          The Throughball Roadmap<Dot />
        </h2>
        <p style={{ margin: '0 0 32px', fontSize: 15, color: T.muted, lineHeight: 1.5, maxWidth: 560 }}>
          Four acts, one path — from your first profile to the final decision. The numbers deepen as the stakes do; you always know where you are.
        </p>

        <div className="mh-roadmap" style={{
          background: T.warmWhite, border: `1px solid ${T.border}`, borderRadius: 20,
          padding: 'clamp(22px, 3vw, 36px)',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'clamp(20px, 3vw, 36px)',
        }}>
          {ACTS.map((a, i) => (
            <div key={a.n} className="mh-act">
              <div style={{
                fontSize: 'clamp(40px, 5vw, 56px)', fontWeight: 800, fontStyle: 'italic',
                lineHeight: 1, letterSpacing: '-0.04em', color: RAMP[i], marginBottom: 12,
              }}>
                {a.n}
              </div>
              <div style={{ fontSize: 'clamp(17px, 2vw, 20px)', fontWeight: 800, fontStyle: 'italic', letterSpacing: '-0.02em', color: T.ink, marginBottom: 6 }}>
                {a.name}<Dot />
              </div>
              <p style={{ margin: 0, fontSize: 13.5, color: T.muted, lineHeight: 1.5 }}>
                {a.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3. Regista — the judgment engine ───────────────────── */}
      <section style={{ padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 56px)', maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ background: T.ink, borderRadius: 20, padding: 'clamp(28px, 5vw, 56px)', position: 'relative', overflow: 'hidden' }}>
          <Eyebrow text="Powered by Regista" color={T.pitchLight} />
          <h2 style={{ margin: '0 0 14px', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, letterSpacing: '-0.03em', color: T.cream, fontStyle: 'italic', maxWidth: 680, lineHeight: 1.14 }}>
            When a coach says &ldquo;not right now,&rdquo; Regista knows what that means — and what to send back.
          </h2>
          <p style={{ margin: '0 0 32px', fontSize: 15, color: T.pitchLight, lineHeight: 1.6, maxWidth: 640, fontWeight: 450 }}>
            Regista is the judgment layer — it reads every reply the way an experienced advisor would, ranks your next move each morning, and drafts the graceful response. Perfectly weighted.
          </p>

          <div className="mh-intel" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(16px, 3vw, 28px)', alignItems: 'stretch' }}>
            {/* The coach's reply */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 22 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.faint, marginBottom: 12 }}>
                The reply · Coach Delgado, Ridgeline
              </div>
              <p style={{ margin: 0, fontSize: 14, color: T.cream, lineHeight: 1.65, fontStyle: 'italic' }}>
                &ldquo;Sam, thanks for reaching out and for the film — you&apos;re a sound defender. We&apos;re pretty deep at center back in the 2028 class right now, but keep us posted on your season and send updated footage when you have it.&rdquo;
              </p>
            </div>

            {/* Regista's read — the next-move card */}
            <div style={{ background: '#111', border: `1px solid rgba(123,196,154,0.28)`, borderRadius: 14, padding: 22, position: 'relative', overflow: 'hidden' }}>
              <span style={{ position: 'absolute', right: 16, top: -14, fontSize: 84, fontWeight: 800, fontStyle: 'italic', color: 'rgba(31,107,72,0.34)', lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }}>1</span>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.pitchLight, marginBottom: 8 }}>
                  Regista · your move
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 600, fontStyle: 'italic', color: T.cream, lineHeight: 1.35 }}>
                  A roster-depth soft-no — not a hard close.
                </p>
                <p style={{ margin: '0 0 14px', fontSize: 13.5, color: T.borderDeep, lineHeight: 1.6 }}>
                  Don&apos;t ask what it would take to earn a spot. Acknowledge it gracefully, state your fall plan without asking permission, and keep one line of value — send the updated reel when the season starts. Keep the door open; don&apos;t lean on it.
                </p>
                <span style={{ display: 'inline-block', padding: '7px 16px', fontSize: 12, fontWeight: 700, color: T.ink, background: T.cream, borderRadius: 999 }}>
                  Draft reply →
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. The board ───────────────────────────────────────── */}
      <section style={{ padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 56px)', maxWidth: 1120, margin: '0 auto' }}>
        <Eyebrow text="The pipeline" />
        <h2 style={{ margin: '0 0 8px', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, letterSpacing: '-0.03em', color: T.ink, fontStyle: 'italic' }}>
          The whole board, at a glance<Dot />
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: 15, color: T.muted, lineHeight: 1.5, maxWidth: 560 }}>
          Every school placed by how deep the relationship runs and how warm it&apos;s going. The dots keep their meaning — that read is the point.
        </p>
        <QuadrantBoard />
      </section>

      {/* ── 5. Closing CTA ─────────────────────────────────────── */}
      <section style={{ padding: 'clamp(36px, 6vw, 72px) clamp(20px, 5vw, 56px)', maxWidth: 1120, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 'clamp(28px, 5vw, 46px)', fontWeight: 800, letterSpacing: '-0.03em', color: T.ink, fontStyle: 'italic', lineHeight: 1.05 }}>
          Get recruited<Dot /> Without the guesswork<Dot />
        </h2>
        <p style={{ margin: '0 auto 28px', fontSize: 16, color: T.muted, lineHeight: 1.5, maxWidth: 460 }}>
          Five minutes, your kid&apos;s actual schools, and Regista&apos;s read on where each one stands.
        </p>
        <Link href="/demo" style={primaryPill}>Start free →</Link>
      </section>

      {/* ── 6. Footer ──────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${T.border}` }}>
        <div style={{
          maxWidth: 1120, margin: '0 auto', padding: '28px clamp(20px, 5vw, 56px)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <ThroughballWordmark size={16} />
            <span style={{ fontSize: 12, color: T.faint }}>powered by Regista</span>
          </div>
          <a href="mailto:hello@finnsoccer.com" style={{ fontSize: 13, fontWeight: 600, color: T.muted, textDecoration: 'none' }}>
            hello@finnsoccer.com
          </a>
        </div>
      </footer>

      {/* ── Responsive rules ───────────────────────────────────── */}
      <style>{`
        @media (max-width: 860px) {
          .mh-roadmap { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 760px) {
          .mh-intel { grid-template-columns: 1fr !important; }
          .mh-quad { grid-template-columns: 1fr !important; }
          .mh-quad-deepHot { order: 1; }
          .mh-quad-shallowHot { order: 2; }
          .mh-quad-deepCold { order: 3; }
          .mh-quad-shallowCold { order: 4; }
        }
        @media (max-width: 460px) {
          .mh-roadmap { grid-template-columns: 1fr !important; }
        }
        .mh-hero-ctas > * { flex: 0 0 auto; }
        @media (max-width: 440px) {
          .mh-hero-ctas > * { width: 100%; }
        }
      `}</style>
    </div>
  )
}

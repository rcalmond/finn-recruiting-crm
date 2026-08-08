'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ─── Design tokens: unified March vocabulary ─────────────────────────────────
// Pulled 1:1 from the phase clients so the front door matches the rooms.

const M = {
  paper:      '#F6F1E8',
  cardWhite:  '#FFFDF9',
  ink:        '#0E0E0E',
  inkMid:     '#4A4A4A',
  inkLo:      '#7A7570',
  inkMute:    '#A8A39B',
  line:       '#E2DBC9',
  lineWarm:   '#DDD5C3',
  rust:       '#B5502F',
  rustBg:     '#FAF0EA',
  charcoal:   '#2E2B28',
  charcoalLo: '#4D4A46',
  cream:      '#F6F1E8',
  creamMid:   '#D8D2C6',
  creamLo:    '#A8A39B',
  green:      '#2D6A4F',
  greenSoft:  '#D7EFE0',
  gold:       '#7A6200', // Get Seen — marketing phase accent (NEW; darkened from #8B6F00 so cream body clears AA on the fill)
  amber:      '#D4A017',
  teal:       '#00B2A9',
  logoMark:   '#C8102E', // sidebar logo crimson — kept for lockup fidelity
}

// Light-on-dark type for the filled phase cards. Bodies are a SOLID warm-cream
// (not opacity-blended) so contrast clears AA on the two lighter fills — rust
// and gold — where opacity-blended cream would fall below 4.5:1.
const CARD = {
  head:  '#FFFDF9',                    // headings on any fill
  body:  '#FBF6EC',                    // body copy — solid, AA-safe on all four fills
  dim:   'rgba(255, 253, 249, 0.68)',  // eyebrows / labels on dark fills
  faint: 'rgba(255, 253, 249, 0.42)',  // secondary labels
  hair:  'rgba(255, 255, 255, 0.14)',  // dividers / panel borders
}

// Vignette panels sit on the card fill. A soft black overlay deepens the local
// ground beneath each panel so cream text pops regardless of which fill it's on.
const glass: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.18)',
  border: `1px solid ${CARD.hair}`,
  borderRadius: 14,
  padding: 18,
  position: 'relative',
  overflow: 'hidden',
}

// ─── Session-aware header CTA ────────────────────────────────────────────────
// Reads only the visitor's own session (no protected data). Renders nothing
// visible until auth resolves, to avoid flashing the wrong label.

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
          padding: signedIn ? '8px 16px' : '8px 4px',
          borderRadius: 999,
          background: signedIn ? M.ink : 'transparent',
          color: signedIn ? '#fff' : M.inkMid,
          fontSize: 13, fontWeight: 650, letterSpacing: '-0.01em',
          textDecoration: 'none', whiteSpace: 'nowrap',
        }}
      >
        {signedIn ? 'Open the app →' : 'Sign in'}
      </Link>
    </div>
  )
}

// ─── Small building blocks ───────────────────────────────────────────────────

function Eyebrow({ text, color }: { text: string; color?: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
      letterSpacing: '0.1em', color: color ?? M.inkMute, marginBottom: 8,
    }}>
      {text}
    </div>
  )
}

function GhostNumeral({ n, color, opacity }: { n: number | string; color: string; opacity: number }) {
  return (
    <div style={{
      position: 'absolute', top: -14, right: 6,
      fontSize: 96, fontWeight: 800, fontStyle: 'italic',
      color, opacity, lineHeight: 1, pointerEvents: 'none',
      userSelect: 'none', letterSpacing: '-0.06em',
    }}>
      {n}
    </div>
  )
}

// ─── Vignette: Get Ready — asset status card (light-on-dark) ─────────────────

function AssetVignette() {
  const rows = [
    { label: 'Current reel', value: 'Fall 2027 highlights', age: 'today', ageColor: '#9BE3BE' },
    { label: 'Resume', value: 'v4', age: '22 days ago', ageColor: CARD.dim },
    { label: 'SAT / test scores', value: 'Uploaded', age: '48 days ago', ageColor: '#F2C879' },
  ]
  return (
    <div style={glass}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: CARD.dim, marginBottom: 4 }}>Profile</div>
      <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: CARD.head, fontStyle: 'italic', letterSpacing: '-0.02em' }}>Assets.</h4>
      {rows.map((r, idx) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '8px 0', borderBottom: idx < rows.length - 1 ? `1px solid ${CARD.hair}` : 'none' }}>
          <span style={{ fontSize: 12, color: CARD.dim, fontWeight: 500 }}>{r.label}</span>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: CARD.head }}>{r.value}</span>
            <span style={{ fontSize: 11, marginLeft: 6, fontWeight: 600, color: r.ageColor }}>{r.age}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Vignette: Get Seen — camps timeline, 3 dots (light-on-dark) ─────────────

function CampsVignette() {
  const camps = [
    { name: 'Ridgeline', date: 'Sep 14', out: 'registered' },
    { name: 'Camden', date: 'Oct 5', out: 'targeted' },
    { name: 'Westfield', date: 'Oct 26', out: 'radar' },
  ]
  return (
    <div style={glass}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: CARD.dim, marginBottom: 4 }}>Exposure</div>
      <h4 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: CARD.head, fontStyle: 'italic', letterSpacing: '-0.02em' }}>Camps &amp; Showcases.</h4>
      <div style={{ position: 'relative', padding: '18px 0 4px' }}>
        <div style={{ position: 'absolute', top: 24, left: 6, right: 6, height: 2, background: 'rgba(255,255,255,0.28)', borderRadius: 1 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
          {camps.map(c => {
            const registered = c.out === 'registered'
            const targeted = c.out === 'targeted'
            return (
              <div key={c.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: registered ? CARD.head : 'transparent',
                  border: `2px solid ${registered || targeted ? CARD.head : CARD.faint}`,
                }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: CARD.head, lineHeight: 1.2 }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: CARD.dim }}>{c.date}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Vignette: Get Recruited — priority card (light-on-dark, inverted pill) ───

function PriorityVignette() {
  return (
    <div style={{
      ...glass,
      background: 'rgba(0, 0, 0, 0.20)',
      borderLeft: `5px solid ${CARD.head}`,
      borderRadius: '0 12px 12px 0',
      padding: '18px 20px',
    }}>
      <GhostNumeral n="1" color="#FFFFFF" opacity={0.12} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: CARD.head }}>
            Priority №1 · Awaiting you
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: CARD.faint }}>Ridgeline</span>
        </div>
        <h4 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: CARD.head, fontStyle: 'italic', letterSpacing: '-0.02em', lineHeight: 1.3 }}>
          Reply to Coach Delgado — he asked for your fall schedule.
        </h4>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: CARD.body, lineHeight: 1.55 }}>
          Positive reply four days ago after the ID camp. He wants dates to come watch — this one is warm and waiting on you.
        </p>
        <span style={{
          display: 'inline-block', padding: '7px 16px', fontSize: 12, fontWeight: 700,
          color: M.rust, background: CARD.head, borderRadius: 999, letterSpacing: '-0.01em',
        }}>
          Draft reply →
        </span>
      </div>
    </div>
  )
}

// ─── Vignette: Get In — offer card (light-on-dark, deepened on charcoal) ──────

function OfferVignette() {
  const fields = [
    { label: 'Money', value: '$28,000/yr merit — renewable' },
    { label: 'Conditions', value: 'Official transcript to finalize' },
    { label: 'Key dates', value: 'Aid letter mid-December' },
  ]
  return (
    <div style={{ ...glass, background: 'rgba(0, 0, 0, 0.24)', padding: 22 }}>
      <div style={{
        position: 'absolute', top: -10, right: 8, fontSize: 96, fontWeight: 800,
        fontStyle: 'italic', color: '#fff', opacity: 0.05, lineHeight: 1,
        pointerEvents: 'none', userSelect: 'none',
      }}>$</div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: CARD.dim }}>Westfield Tech</span>
          <span style={{ padding: '3px 10px', borderRadius: 999, background: 'rgba(134, 239, 172, 0.18)', color: '#86EFAC', fontSize: 10, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>Open</span>
        </div>
        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: CARD.faint, marginBottom: 6 }}>Conditional admission</div>
        <h4 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: CARD.head, fontStyle: 'italic', lineHeight: 1.3 }}>
          Conditional admission — Mechanical Engineering
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fields.map(f => (
            <div key={f.label} style={{ display: 'flex', gap: 8, fontSize: 12.5, lineHeight: 1.5 }}>
              <span style={{ width: 74, flexShrink: 0, fontWeight: 600, color: CARD.dim, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 1 }}>{f.label}</span>
              <span style={{ color: CARD.body }}>{f.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── The four phases — bold filled cards, a warming ladder ────────────────────

const PHASES = [
  {
    name: 'Get Ready.',
    fill: M.green,
    sentence: 'Build your profile, your film, and your school list — and know at a glance what has gone stale.',
    vignette: <AssetVignette />,
  },
  {
    name: 'Get Seen.',
    fill: M.gold,
    sentence: 'Get your name in front of the coaches who matter — camps, showcases, and outreach on one calendar.',
    vignette: <CampsVignette />,
  },
  {
    name: 'Get Recruited.',
    fill: M.rust,
    sentence: 'Work every conversation. One priority to act on first, the rest ranked behind it — nothing slips.',
    vignette: <PriorityVignette />,
  },
  {
    name: 'Get In.',
    fill: M.charcoal,
    sentence: 'Your offers, your admissions, your decision — deadlines side by side, decided on your terms.',
    vignette: <OfferVignette />,
  },
]

// ─── The board: simplified 2×2 quadrant summary ──────────────────────────────
// The idea of the full FunnelGrid without the machinery. Depth × temperature
// collapses to four action zones; a few fictional chips sit in each.

type FictSchool = { name: string; tier: 'A' | 'B' | 'C' }
const TIER_DOT: Record<string, string> = { A: '#166534', B: '#1E40AF', C: '#92400E' }

type QuadKey = 'deepHot' | 'shallowHot' | 'deepCold' | 'shallowCold'
const QUAD_TINT: Record<QuadKey, string> = {
  deepHot: 'rgba(181, 80, 47, 0.10)',
  shallowHot: 'rgba(30, 64, 175, 0.07)',
  deepCold: 'rgba(232, 163, 60, 0.12)',
  shallowCold: 'rgba(156, 163, 168, 0.10)',
}
const QUAD_BORDER: Record<QuadKey, string> = {
  deepHot: 'rgba(181, 80, 47, 0.30)',
  shallowHot: 'rgba(30, 64, 175, 0.22)',
  deepCold: 'rgba(232, 163, 60, 0.32)',
  shallowCold: 'rgba(156, 163, 168, 0.30)',
}

// Fictional placement — reuses the invented school set. Top row Close | Convert,
// bottom row Re-warm | Nudge, matching the real grid's zone geometry.
const QUADRANTS: { key: QuadKey; label: string; schools: FictSchool[] }[] = [
  { key: 'deepHot',     label: 'Close',   schools: [{ name: 'Ridgeline', tier: 'A' }, { name: 'Camden', tier: 'A' }] },
  { key: 'shallowHot',  label: 'Convert', schools: [{ name: 'Westfield Tech', tier: 'B' }, { name: 'Ardsley', tier: 'C' }] },
  { key: 'deepCold',    label: 'Re-warm', schools: [{ name: 'Pinecrest', tier: 'A' }, { name: 'Northgate', tier: 'B' }] },
  { key: 'shallowCold', label: 'Nudge',   schools: [{ name: 'Hollis', tier: 'B' }, { name: 'Glenmoor', tier: 'C' }] },
]

function BoardChip({ school, close }: { school: FictSchool; close: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 999,
      border: close ? '1px solid rgba(181, 80, 47, 0.35)' : `1px solid ${M.lineWarm}`,
      background: '#FFFDF9', fontSize: 11, fontWeight: 600, color: M.ink,
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
        <div key={q.key} style={{
          background: QUAD_TINT[q.key], border: `1px solid ${QUAD_BORDER[q.key]}`,
          borderRadius: 12, padding: '15px 16px 18px', minHeight: 108, position: 'relative',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
            color: q.key === 'deepHot' ? M.rust : M.inkLo,
          }}>
            {q.label}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {q.schools.map(s => <BoardChip key={s.name} school={s} close={q.key === 'deepHot'} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MarketingHome() {
  const phasesRef = useRef<HTMLDivElement>(null)

  const DemoCTA = ({ style }: { style?: React.CSSProperties }) => (
    <Link href="/demo" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '13px 26px', borderRadius: 999, background: M.ink, color: '#fff',
      fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', textDecoration: 'none',
      ...style,
    }}>
      Try the demo →
    </Link>
  )

  return (
    <div style={{ minHeight: '100vh', background: M.paper, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px clamp(20px, 5vw, 56px)', maxWidth: 1120, margin: '0 auto',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7, background: M.logoMark, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800, letterSpacing: -0.3, fontStyle: 'italic', flexShrink: 0,
          }}>F</div>
          <span style={{ fontSize: 15, fontWeight: 700, color: M.ink, letterSpacing: -0.4 }}>finnsoccer</span>
        </Link>
        <HeaderCTA />
      </header>

      {/* ── 1. Hero ────────────────────────────────────────────── */}
      <section style={{ padding: 'clamp(36px, 7vw, 80px) clamp(20px, 5vw, 56px) clamp(28px, 5vw, 56px)', maxWidth: 1120, margin: '0 auto' }}>
        <h1 style={{
          margin: 0, fontSize: 'clamp(46px, 8vw, 92px)', fontWeight: 700,
          letterSpacing: '-0.04em', color: M.ink, lineHeight: 0.98, fontStyle: 'italic',
          maxWidth: 900,
        }}>
          Get recruited.<br /><span style={{ color: M.rust }}>Without the guesswork.</span>
        </h1>
        <p style={{
          margin: '24px 0 0', fontSize: 'clamp(16px, 2.2vw, 20px)', color: M.inkMid,
          fontWeight: 450, lineHeight: 1.5, maxWidth: 620, letterSpacing: '-0.01em',
        }}>
          Your recruiting process, organized — every coach conversation, camp, and offer in one place, with a clear next move at every step.
        </p>
        <div className="mh-hero-ctas" style={{ display: 'flex', gap: 12, marginTop: 32, flexWrap: 'wrap' }}>
          <DemoCTA />
          <button
            onClick={() => phasesRef.current?.scrollIntoView({ behavior: 'smooth' })}
            style={{
              all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: '13px 26px', borderRadius: 999, border: `1.5px solid ${M.lineWarm}`,
              fontSize: 15, fontWeight: 650, color: M.inkMid, letterSpacing: '-0.01em',
              fontFamily: 'inherit',
            }}
          >
            See how it works
          </button>
        </div>
      </section>

      {/* ── 2. The four phases ─────────────────────────────────── */}
      <section ref={phasesRef} style={{ padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 56px)', maxWidth: 1120, margin: '0 auto' }}>
        <Eyebrow text="The journey" color={M.inkMute} />
        <h2 style={{ margin: '0 0 8px', fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 700, letterSpacing: '-0.03em', color: M.ink, fontStyle: 'italic' }}>
          Your recruiting roadmap.
        </h2>
        <p style={{ margin: '0 0 40px', fontSize: 15, color: M.inkLo, lineHeight: 1.5, maxWidth: 560 }}>
          From building your profile to weighing your offers, the app guides you through the entire recruiting process — and always knows what comes next.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {PHASES.map((p, i) => (
            <div key={p.name} className="mh-phase-row" style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(20px, 4vw, 48px)',
              alignItems: 'center',
              background: p.fill, borderRadius: 20,
              padding: 'clamp(24px, 3.2vw, 38px)',
              position: 'relative', overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div className={i % 2 === 1 ? 'mh-phase-text-alt' : ''} style={{ order: i % 2 === 1 ? 2 : 1 }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: CARD.dim, marginBottom: 8 }}>
                  Phase {i + 1}
                </div>
                <h3 style={{ margin: '0 0 12px', fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, letterSpacing: '-0.03em', color: CARD.head, fontStyle: 'italic', lineHeight: 1 }}>
                  {p.name}
                </h3>
                <p style={{ margin: 0, fontSize: 15, color: CARD.body, lineHeight: 1.55, maxWidth: 420 }}>
                  {p.sentence}
                </p>
              </div>
              <div className="mh-phase-vignette" style={{ order: i % 2 === 1 ? 1 : 2 }}>
                {p.vignette}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3. The judgment section ────────────────────────────── */}
      <section style={{ padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 56px)', maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ background: M.charcoal, borderRadius: 20, padding: 'clamp(28px, 5vw, 56px)', position: 'relative', overflow: 'hidden' }}>
          <Eyebrow text="The judgment layer" color={M.creamLo} />
          <h2 style={{ margin: '0 0 14px', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.03em', color: M.cream, fontStyle: 'italic', maxWidth: 660, lineHeight: 1.12 }}>
            When a coach says &ldquo;not right now,&rdquo; the app knows what that means — and what to send back.
          </h2>
          <p style={{ margin: '0 0 32px', fontSize: 15, color: M.creamMid, lineHeight: 1.6, maxWidth: 640 }}>
            Every reply gets read the way an experienced recruiting advisor would read it: what the coach actually meant, and the graceful next move — never the desperate one.
          </p>

          <div className="mh-intel" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(16px, 3vw, 28px)', alignItems: 'stretch' }}>
            {/* Before: the coach email */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 22 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: M.creamLo, marginBottom: 12 }}>
                The reply · Coach Delgado, Ridgeline
              </div>
              <p style={{ margin: 0, fontSize: 14, color: M.cream, lineHeight: 1.65, fontStyle: 'italic' }}>
                &ldquo;Sam, thanks for reaching out and for the film — you&apos;re a sound defender. We&apos;re pretty deep at center back in the 2028 class right now, but keep us posted on your season and send updated footage when you have it.&rdquo;
              </p>
            </div>

            {/* After: the recommended framing */}
            <div style={{ background: M.cardWhite, borderRadius: 12, borderLeft: `6px solid ${M.rust}`, padding: 22, position: 'relative', overflow: 'hidden' }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: M.rust, marginBottom: 10 }}>
                What the app reads · and recommends
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 14, color: M.ink, lineHeight: 1.6, fontWeight: 500 }}>
                Roster-depth soft-no — not a hard close. Don&apos;t ask what it would take to earn a spot.
              </p>
              <p style={{ margin: 0, fontSize: 13.5, color: M.inkMid, lineHeight: 1.6 }}>
                Acknowledge it gracefully, state your fall plan without asking permission, and keep one line of value: send the updated reel when the season starts — nothing more. Keep the door open; don&apos;t lean on it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. The board ───────────────────────────────────────── */}
      <section style={{ padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 56px)', maxWidth: 1120, margin: '0 auto' }}>
        <Eyebrow text="Pipeline" color={M.inkMute} />
        <h2 style={{ margin: '0 0 8px', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.03em', color: M.ink, fontStyle: 'italic' }}>
          The whole board, at a glance.
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: 15, color: M.inkLo, lineHeight: 1.5, maxWidth: 560 }}>
          Every school, placed by how deep the relationship is and how warm it&apos;s running.
        </p>
        <QuadrantBoard />
        <p style={{ margin: '18px 0 0', fontSize: 13, color: M.inkMute, lineHeight: 1.5, fontStyle: 'italic' }}>
          Inside the app, this expands into the full board.
        </p>
      </section>

      {/* ── 5. Closing CTA ─────────────────────────────────────── */}
      <section style={{ padding: 'clamp(36px, 6vw, 72px) clamp(20px, 5vw, 56px)', maxWidth: 1120, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 'clamp(28px, 5vw, 46px)', fontWeight: 700, letterSpacing: '-0.03em', color: M.ink, fontStyle: 'italic', lineHeight: 1.05 }}>
          See it on your own list.
        </h2>
        <p style={{ margin: '0 auto 28px', fontSize: 16, color: M.inkMid, lineHeight: 1.5, maxWidth: 460 }}>
          Five minutes. Your kid&apos;s actual schools. See what it finds.
        </p>
        <DemoCTA />
      </section>

      {/* ── 6. Footer ──────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${M.line}` }}>
        <div style={{
          maxWidth: 1120, margin: '0 auto', padding: '28px clamp(20px, 5vw, 56px)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: M.ink, letterSpacing: -0.4 }}>finnsoccer</span>
          <a href="mailto:hello@finnsoccer.com" style={{ fontSize: 13, fontWeight: 600, color: M.inkLo, textDecoration: 'none' }}>
            hello@finnsoccer.com
          </a>
        </div>
      </footer>

      {/* ── Responsive rules ───────────────────────────────────── */}
      <style>{`
        @media (max-width: 760px) {
          .mh-phase-row { grid-template-columns: 1fr !important; }
          .mh-phase-row .mh-phase-text-alt { order: 1 !important; }
          .mh-phase-row .mh-phase-vignette { order: 2 !important; }
          .mh-intel { grid-template-columns: 1fr !important; }
          .mh-quad { grid-template-columns: 1fr !important; }
        }
        .mh-hero-ctas > * { flex: 0 0 auto; }
        @media (max-width: 440px) {
          .mh-hero-ctas > * { width: 100%; }
        }
      `}</style>
    </div>
  )
}

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
  amber:      '#D4A017',
  teal:       '#00B2A9',
  logoMark:   '#C8102E', // sidebar logo crimson — kept for lockup fidelity
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

// ─── Vignette: Get Ready — asset status card ─────────────────────────────────

function AssetVignette() {
  const rows = [
    { label: 'Current reel', value: 'Fall 2027 highlights', age: 'today', ageColor: M.green },
    { label: 'Resume', value: 'v4', age: '22 days ago', ageColor: M.green },
    { label: 'SAT / test scores', value: 'Uploaded', age: '48 days ago', ageColor: M.amber },
  ]
  return (
    <div style={{
      background: '#fff', border: `1px solid ${M.line}`, borderRadius: 14,
      padding: 20, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: M.green, marginBottom: 4 }}>Profile</div>
      <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: M.ink, fontStyle: 'italic', letterSpacing: '-0.02em' }}>Assets.</h4>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${M.line}` }}>
          <span style={{ fontSize: 12, color: M.inkMid, fontWeight: 500 }}>{r.label}</span>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: M.ink }}>{r.value}</span>
            <span style={{ fontSize: 11, marginLeft: 6, fontWeight: 600, color: r.ageColor }}>{r.age}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Vignette: Get Seen — camps timeline (3 dots) ────────────────────────────

function CampsVignette() {
  const camps = [
    { name: 'Ridgeline', date: 'Sep 14', out: 'registered' },
    { name: 'Camden', date: 'Oct 5', out: 'targeted' },
    { name: 'Westfield', date: 'Oct 26', out: 'radar' },
  ]
  return (
    <div style={{
      background: '#fff', border: `1px solid ${M.line}`, borderRadius: 14,
      padding: 20, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: M.green, marginBottom: 4 }}>Exposure</div>
      <h4 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: M.ink, fontStyle: 'italic', letterSpacing: '-0.02em' }}>Camps &amp; Showcases.</h4>
      <div style={{ position: 'relative', padding: '18px 0 4px' }}>
        <div style={{ position: 'absolute', top: 24, left: 6, right: 6, height: 2, background: M.line, borderRadius: 1 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
          {camps.map(c => {
            const registered = c.out === 'registered'
            const targeted = c.out === 'targeted'
            return (
              <div key={c.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: registered ? M.green : 'transparent',
                  border: `2px solid ${registered || targeted ? M.green : M.inkMute}`,
                }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: M.ink, lineHeight: 1.2 }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: M.inkLo }}>{c.date}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Vignette: Get Recruited — priority card (rust edge, ghost numeral) ───────

function PriorityVignette() {
  return (
    <div style={{
      background: M.cardWhite,
      border: `1px solid ${M.lineWarm}`,
      borderLeft: `6px solid ${M.rust}`,
      borderRadius: '0 12px 12px 0',
      padding: '18px 20px',
      position: 'relative', overflow: 'hidden',
    }}>
      <GhostNumeral n="1" color={M.rust} opacity={0.09} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: M.rust }}>
            Priority №1 · Awaiting you
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: M.inkMute }}>Ridgeline</span>
        </div>
        <h4 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: M.ink, fontStyle: 'italic', letterSpacing: '-0.02em', lineHeight: 1.3 }}>
          Reply to Coach Delgado — he asked for your fall schedule.
        </h4>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: M.inkMid, lineHeight: 1.55 }}>
          Positive reply four days ago after the ID camp. He wants dates to come watch — this one is warm and waiting on you.
        </p>
        <span style={{
          display: 'inline-block', padding: '7px 16px', fontSize: 12, fontWeight: 700,
          color: '#fff', background: M.rust, borderRadius: 999, letterSpacing: '-0.01em',
        }}>
          Draft reply →
        </span>
      </div>
    </div>
  )
}

// ─── Vignette: Get In — charcoal offer card ──────────────────────────────────

function OfferVignette() {
  const fields = [
    { label: 'Money', value: '$28,000/yr merit — renewable' },
    { label: 'Conditions', value: 'Official transcript to finalize' },
    { label: 'Key dates', value: 'Aid letter mid-December' },
  ]
  return (
    <div style={{
      background: M.charcoal, borderRadius: 14, padding: 22,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: -10, right: 8, fontSize: 96, fontWeight: 800,
        fontStyle: 'italic', color: '#fff', opacity: 0.04, lineHeight: 1,
        pointerEvents: 'none', userSelect: 'none',
      }}>$</div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: M.creamLo }}>Westfield Tech</span>
          <span style={{ padding: '3px 10px', borderRadius: 999, background: 'rgba(220, 252, 231, 0.15)', color: '#86EFAC', fontSize: 10, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>Open</span>
        </div>
        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: M.creamMid, marginBottom: 6 }}>Conditional admission</div>
        <h4 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: M.cream, fontStyle: 'italic', lineHeight: 1.3 }}>
          Conditional admission — Mechanical Engineering
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fields.map(f => (
            <div key={f.label} style={{ display: 'flex', gap: 8, fontSize: 12.5, lineHeight: 1.5 }}>
              <span style={{ width: 74, flexShrink: 0, fontWeight: 600, color: M.creamMid, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 1 }}>{f.label}</span>
              <span style={{ color: M.cream }}>{f.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── The four phases ─────────────────────────────────────────────────────────

const PHASES = [
  {
    name: 'Get Ready.',
    accent: M.green,
    sentence: 'Build the profile, film, and school list that make coaches take notice — and know at a glance what has gone stale.',
    vignette: <AssetVignette />,
  },
  {
    name: 'Get Seen.',
    accent: M.green,
    sentence: 'Get in front of the coaches who should know the name. Camps, showcases, and batched outreach, one calendar.',
    vignette: <CampsVignette />,
  },
  {
    name: 'Get Recruited.',
    accent: M.rust,
    sentence: 'The daily surface. One priority to act on first, and the rest of the conversations ranked behind it — nothing slips.',
    vignette: <PriorityVignette />,
  },
  {
    name: 'Get In.',
    accent: M.charcoal,
    sentence: 'The endgame. Offers, admissions, and deadlines side by side, so the decision is made on the terms, not the noise.',
    vignette: <OfferVignette />,
  },
]

// ─── The board: faithful fictional FunnelGrid ────────────────────────────────

type GridRow = 'hot' | 'active' | 'cooling' | 'cold' | 'prospecting'
const ROWS: GridRow[] = ['hot', 'active', 'cooling', 'cold', 'prospecting']
const ROW_LABEL: Record<GridRow, string> = {
  hot: 'Awaiting you', active: 'Active', cooling: 'Cooling', cold: 'Cold', prospecting: 'Prospecting',
}
const ROW_DOT: Record<GridRow, string> = {
  hot: '#D03A2E', active: '#00B2A9', cooling: '#E8A33C', cold: '#9CA3A8', prospecting: '#9CA3A8',
}
const STAGES = [1, 2, 3, 4, 5, 6]
const STAGE_LABEL: Record<number, string> = {
  1: 'Research', 2: 'Reach out', 3: 'Engage', 4: 'Evaluate', 5: 'Advance', 6: 'Decide',
}
const TIER_DOT: Record<string, string> = { A: '#166534', B: '#1E40AF', C: '#92400E' }
const ZONE_TINT = {
  deepHot: 'rgba(181, 80, 47, 0.07)', shallowHot: 'rgba(30, 64, 175, 0.06)',
  deepCold: 'rgba(232, 163, 60, 0.08)', shallowCold: 'rgba(156, 163, 168, 0.06)',
}
const ZONE_LABEL = { deepHot: 'Close', shallowHot: 'Convert', deepCold: 'Re-warm', shallowCold: 'Nudge' }

type FictSchool = { name: string; tier: 'A' | 'B' | 'C' }
// Fictional placement across (row, stage). All names invented.
const BOARD: Record<string, FictSchool[]> = {
  'hot-4':         [{ name: 'Ridgeline', tier: 'A' }],
  'hot-3':         [{ name: 'Camden', tier: 'A' }],
  'active-5':      [{ name: 'Westfield Tech', tier: 'B' }],
  'active-2':      [{ name: 'Ardsley', tier: 'C' }],
  'cooling-4':     [{ name: 'Northgate', tier: 'B' }],
  'cooling-1':     [{ name: 'Hollis', tier: 'B' }],
  'cold-5':        [{ name: 'Pinecrest', tier: 'A' }],
  'prospecting-1': [{ name: 'Glenmoor', tier: 'C' }],
}

function zoneFor(row: GridRow, stage: number): keyof typeof ZONE_TINT {
  const isDeep = stage >= 4
  const isHot = row === 'hot' || row === 'active'
  return isDeep ? (isHot ? 'deepHot' : 'deepCold') : (isHot ? 'shallowHot' : 'shallowCold')
}

function BoardChip({ school, close }: { school: FictSchool; close: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 7px', borderRadius: 999,
      border: close ? '1px solid rgba(181, 80, 47, 0.35)' : 'none',
      background: '#EFE8D8', fontSize: 10, fontWeight: 600, color: M.ink,
      whiteSpace: 'nowrap', lineHeight: 1.4,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: TIER_DOT[school.tier] }} />
      {school.name}
    </span>
  )
}

function TheBoard() {
  // Mobile buckets
  const buckets: Record<keyof typeof ZONE_TINT, FictSchool[]> = { deepHot: [], shallowHot: [], deepCold: [], shallowCold: [] }
  for (const [key, arr] of Object.entries(BOARD)) {
    const [row, stageStr] = key.split('-')
    buckets[zoneFor(row as GridRow, Number(stageStr))].push(...arr)
  }

  return (
    <>
      {/* Desktop grid */}
      <div className="mh-board-desktop" style={{
        display: 'grid',
        gridTemplateColumns: '104px repeat(6, 1fr)',
        border: `1px solid ${M.line}`, borderRadius: 10, overflow: 'hidden',
        background: '#fff',
      }}>
        <div style={headerCell()} />
        {STAGES.map(s => (
          <div key={s} style={{ ...headerCell(), borderLeft: `1px solid ${M.line}`, fontWeight: 700, color: M.inkMid }}>
            {STAGE_LABEL[s]}
          </div>
        ))}

        {ROWS.map(row => (
          <div key={row} style={{ display: 'contents' }}>
            <div style={{
              padding: '10px', borderTop: `1px solid ${M.line}`,
              fontSize: 10, fontWeight: 700, color: M.inkLo,
              textTransform: 'uppercase', letterSpacing: '0.04em',
              display: 'flex', alignItems: 'center', background: M.paper,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', marginRight: 6, flexShrink: 0,
                background: ROW_DOT[row], boxShadow: row === 'hot' ? `0 0 4px ${ROW_DOT[row]}40` : 'none',
              }} />
              {ROW_LABEL[row]}
            </div>
            {STAGES.map(stage => {
              const key = `${row}-${stage}`
              const arr = BOARD[key] ?? []
              const zone = zoneFor(row, stage)
              const showZoneLabel =
                (zone === 'shallowHot' && stage === 1 && row === 'hot') ||
                (zone === 'deepHot' && stage === 4 && row === 'hot') ||
                (zone === 'shallowCold' && stage === 1 && row === 'cooling') ||
                (zone === 'deepCold' && stage === 4 && row === 'cooling')
              return (
                <div key={key} style={{
                  padding: '6px 5px', borderTop: `1px solid ${M.line}`, borderLeft: `1px solid ${M.line}`,
                  background: ZONE_TINT[zone], minHeight: 42, position: 'relative',
                }}>
                  {showZoneLabel && (
                    <span style={{
                      position: 'absolute', top: 3, right: 5, fontSize: 8, fontWeight: 800,
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      color: zone === 'deepHot' ? M.rust : M.inkMute, opacity: zone === 'deepHot' ? 0.7 : 0.6,
                    }}>{ZONE_LABEL[zone]}</span>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {arr.map(s => <BoardChip key={s.name} school={s} close={zone === 'deepHot'} />)}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Mobile fallback: 4 zone buckets */}
      <div className="mh-board-mobile" style={{ display: 'none' }}>
        {([
          { key: 'deepHot' as const, label: 'Close', desc: 'Deep + hot' },
          { key: 'shallowHot' as const, label: 'Convert', desc: 'Shallow + hot' },
          { key: 'deepCold' as const, label: 'Re-warm', desc: 'Deep + cold' },
          { key: 'shallowCold' as const, label: 'Nudge', desc: 'Shallow + cold' },
        ]).map(({ key, label, desc }) => {
          const arr = buckets[key]
          if (arr.length === 0) return null
          return (
            <div key={key} style={{ background: ZONE_TINT[key], border: `1px solid ${M.line}`, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: key === 'deepHot' ? M.rust : M.inkLo, marginBottom: 6 }}>
                {label} <span style={{ fontWeight: 500, textTransform: 'none' }}>· {desc}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {arr.map(s => <BoardChip key={s.name} school={s} close={key === 'deepHot'} />)}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function headerCell(): React.CSSProperties {
  return {
    padding: '8px', background: M.paper, fontSize: 10, fontWeight: 600, color: M.inkLo,
    textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em',
  }
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
          The recruiting process, organized — every coach conversation, camp, and offer in one place, with a clear next move at every step.
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
          Four phases, one throughline.
        </h2>
        <p style={{ margin: '0 0 40px', fontSize: 15, color: M.inkLo, lineHeight: 1.5, maxWidth: 560 }}>
          The app is built around how recruiting actually unfolds — not a pile of features. Each phase carries its own color, so you always know where a school sits.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {PHASES.map((p, i) => (
            <div key={p.name} className="mh-phase-row" style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(20px, 4vw, 48px)',
              alignItems: 'center',
              background: '#fff', border: `1px solid ${M.line}`, borderRadius: 16,
              borderTop: `3px solid ${p.accent}`, padding: 'clamp(22px, 3vw, 32px)',
            }}>
              <div className={i % 2 === 1 ? 'mh-phase-text-alt' : ''} style={{ order: i % 2 === 1 ? 2 : 1 }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: p.accent, marginBottom: 8 }}>
                  Phase {i + 1}
                </div>
                <h3 style={{ margin: '0 0 12px', fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, letterSpacing: '-0.03em', color: p.accent, fontStyle: 'italic', lineHeight: 1 }}>
                  {p.name}
                </h3>
                <p style={{ margin: 0, fontSize: 15, color: M.inkMid, lineHeight: 1.55, maxWidth: 420 }}>
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

      {/* ── 3. The intelligence section ────────────────────────── */}
      <section style={{ padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 56px)', maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ background: M.charcoal, borderRadius: 20, padding: 'clamp(28px, 5vw, 56px)', position: 'relative', overflow: 'hidden' }}>
          <Eyebrow text="The judgment layer" color={M.creamLo} />
          <h2 style={{ margin: '0 0 14px', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.03em', color: M.cream, fontStyle: 'italic', maxWidth: 620, lineHeight: 1.1 }}>
            It reads a coach&apos;s reply the way a savvy recruiting parent would.
          </h2>
          <p style={{ margin: '0 0 32px', fontSize: 15, color: M.creamMid, lineHeight: 1.6, maxWidth: 620 }}>
            Every conversation gets summarized. Every next move gets reasoned — not just &ldquo;reply,&rdquo; but what to say and what to leave out. A polite brush-off and a real opening look different, and the app tells them apart.
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
        <p style={{ margin: '0 0 28px', fontSize: 15, color: M.inkLo, lineHeight: 1.5, maxWidth: 560 }}>
          Depth across, temperature down. Every school lands in a zone — close it, convert it, re-warm it, or nudge it — so you see the whole journey without opening a single thread.
        </p>
        <TheBoard />
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
          .mh-board-desktop { display: none !important; }
          .mh-board-mobile { display: block !important; }
        }
        .mh-hero-ctas > * { flex: 0 0 auto; }
        @media (max-width: 440px) {
          .mh-hero-ctas > * { width: 100%; }
        }
      `}</style>
    </div>
  )
}

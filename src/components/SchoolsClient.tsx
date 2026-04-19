'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { useSchools, useContactLog } from '@/hooks/useRealtimeData'
import { deriveStage, stageLabel, STAGE_LABELS } from '@/lib/stages'
import { deriveSignal } from '@/lib/signals'
import type { School, ContactLogEntry, Division, Category } from '@/lib/types'
import type { Signal } from '@/lib/signals'

// ─── Design tokens ────────────────────────────────────────────────────────────

const SL = {
  paper:     '#F6F1E8',
  paperDeep: '#EFE8D8',
  ink:       '#0E0E0E',
  inkMid:    '#4A4A4A',
  inkLo:     '#7A7570',
  inkMute:   '#A8A39B',
  line:      '#E2DBC9',
  line2:     '#D3CAB3',
  teal:      '#00B2A9',
  tealDeep:  '#006A65',
  tealSoft:  '#D7F0ED',
  goldSoft:  '#FBF3C4',
  goldInk:   '#5A4E0F',
  goldDeep:  '#C8B22E',
  ink0:      '#0E0E0E',
}

// ─── Enriched school record (computed once, passed to rows) ───────────────────

interface RichSchool {
  school: School
  stage:  number
  signal: Signal | null
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: string }) {
  const palette =
    tier === 'A' ? { bg: SL.ink,        fg: '#fff',    border: undefined } :
    tier === 'B' ? { bg: 'transparent', fg: SL.ink,    border: SL.ink    } :
                   { bg: 'transparent', fg: SL.inkLo,  border: SL.line2  }
  return (
    <div style={{
      width: 22, height: 22, borderRadius: '50%',
      background: palette.bg, color: palette.fg,
      border: palette.border ? `1.3px solid ${palette.border}` : 'none',
      fontSize: 10, fontWeight: 800, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{tier}</div>
  )
}

function StageDots({ stage, size = 8 }: { stage: number; size?: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {STAGE_LABELS.map((_, i) => {
        const filled  = i < stage
        const current = i === stage - 1
        return (
          <div key={i} style={{
            width: size, height: size, borderRadius: '50%',
            background: filled ? SL.ink : 'transparent',
            border:     filled ? 'none' : `1.3px solid ${SL.inkMute}`,
            boxShadow:  current ? `0 0 0 2px ${SL.paper}, 0 0 0 3px ${SL.ink}` : 'none',
          }} />
        )
      })}
    </div>
  )
}

function SignalPill({ signal, compact }: { signal: Signal; compact?: boolean }) {
  const p = signal.kind === 'cold'
    ? { bg: SL.goldSoft, fg: SL.goldInk, dot: SL.goldDeep }
    : { bg: SL.tealSoft, fg: SL.tealDeep, dot: SL.teal }
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: compact ? '2px 8px' : '3px 10px',
      borderRadius: 999, background: p.bg, color: p.fg,
      fontSize: compact ? 11 : 12, fontWeight: 650, letterSpacing: -0.1,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: p.dot, flexShrink: 0 }} />
      {signal.text}
    </div>
  )
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────

interface DropdownProps {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}

function Dropdown({ label, value, options, onChange }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isActive = value !== 'All'

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', borderRadius: 999,
          background: isActive ? SL.ink : 'transparent',
          border: `1px solid ${isActive ? SL.ink : SL.line2}`,
          color: isActive ? '#fff' : SL.ink,
          fontSize: 13, fontWeight: 550, cursor: 'pointer', letterSpacing: -0.1,
        }}
      >
        <span style={{ color: isActive ? 'rgba(255,255,255,0.7)' : SL.inkLo, fontWeight: 500 }}>
          {label}:
        </span>
        <span style={{ fontWeight: isActive ? 650 : 550 }}>{value}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
          background: '#fff', border: `1px solid ${SL.line2}`,
          borderRadius: 10, padding: '4px 0',
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          minWidth: 130,
        }}>
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 14px', border: 'none', cursor: 'pointer',
                background: opt === value ? SL.paperDeep : '#fff',
                fontSize: 13, fontWeight: opt === value ? 650 : 450,
                color: SL.ink, letterSpacing: -0.1,
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

interface ChipProps {
  label: string
  count: number
  active: boolean
  onClick: () => void
  color: { bg: string; fg: string; bgOn: string; fgOn: string }
}

function Chip({ label, count, active, onClick, color }: ChipProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '6px 12px', borderRadius: 999,
        background: active ? color.bgOn : color.bg,
        color:      active ? color.fgOn : color.fg,
        border: 'none', cursor: 'pointer',
        fontSize: 13, fontWeight: 550, letterSpacing: -0.1, whiteSpace: 'nowrap',
      }}
    >
      {label}
      <span style={{ fontSize: 11, opacity: active ? 0.85 : 0.6, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {count}
      </span>
    </button>
  )
}

// ─── Desktop row ──────────────────────────────────────────────────────────────

function DesktopRow({ rich, even, onClick }: { rich: RichSchool; even: boolean; onClick: () => void }) {
  const { school, stage, signal } = rich
  return (
    <div
      role="button" tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr 100px 170px 180px 16px',
        gap: 18, alignItems: 'center',
        padding: '0 20px', height: 40,
        borderBottom: `1px solid ${SL.line}`,
        background: even ? 'transparent' : 'rgba(239,232,216,0.3)',
        cursor: 'pointer', transition: 'background 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = SL.paperDeep)}
      onMouseLeave={e => (e.currentTarget.style.background = even ? 'transparent' : 'rgba(239,232,216,0.3)')}
    >
      <TierBadge tier={school.category} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: SL.ink, letterSpacing: -0.2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{school.name}</div>
        <div style={{ fontSize: 11, color: SL.inkLo, fontWeight: 500, letterSpacing: 0.2 }}>
          {school.division}
        </div>
      </div>
      <div style={{ fontSize: 12, color: SL.inkMid, fontWeight: 500 }}>{stageLabel(stage)}</div>
      <StageDots stage={stage} />
      <div>
        {signal
          ? <SignalPill signal={signal} />
          : <span style={{ fontSize: 12, color: SL.inkMute }}>—</span>}
      </div>
      <div style={{ color: SL.inkMute, fontSize: 12, textAlign: 'right' }}>›</div>
    </div>
  )
}

// ─── Mobile row ───────────────────────────────────────────────────────────────

function MobileRow({ rich, onClick }: { rich: RichSchool; onClick: () => void }) {
  const { school, stage, signal } = rich
  return (
    <div
      role="button" tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      style={{
        padding: '12px 16px', borderBottom: `1px solid ${SL.line}`,
        display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
      }}
    >
      <TierBadge tier={school.category} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 650, color: SL.ink, letterSpacing: -0.2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: 5,
        }}>{school.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StageDots stage={stage} size={6} />
          {signal && <SignalPill signal={signal} compact />}
        </div>
      </div>
      <div style={{ color: SL.inkMute, fontSize: 14 }}>›</div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div style={{
      padding: '80px 20px', textAlign: 'center',
      borderBottom: `1px solid ${SL.line}`,
    }}>
      <div style={{
        fontSize: 24, fontWeight: 700, color: SL.ink,
        letterSpacing: -0.6, marginBottom: 6, fontStyle: 'italic',
      }}>No schools match your filters.</div>
      <div style={{ fontSize: 13, color: SL.inkMid, marginBottom: 18 }}>
        Try loosening tier, clearing search, or removing quick filters.
      </div>
      <button
        onClick={onReset}
        style={{
          padding: '9px 18px', background: SL.ink, color: '#fff',
          border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 650, cursor: 'pointer',
        }}
      >
        Reset filters
      </button>
    </div>
  )
}

// ─── Filter state types ───────────────────────────────────────────────────────

type QuickFilter = 'awaiting' | 'cold' | 'active' | null

const TIER_OPTIONS   = ['All', 'A', 'B', 'C']
const DIV_OPTIONS    = ['All', 'D1', 'D2', 'D3']
const STAGE_OPTIONS  = ['All', ...STAGE_LABELS]

const TIER_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 }

// ─── Main component ───────────────────────────────────────────────────────────

export default function SchoolsClient({ user: _user }: { user: User }) {
  const router = useRouter()
  const { schools, loading: schoolsLoading } = useSchools()
  const { entries: contactLog, loading: logLoading } = useContactLog()

  // ── Filter state ────────────────────────────────────────────────────────────
  const [searchQ,     setSearchQ]     = useState('')
  const [stageFilter, setStageFilter] = useState('All')
  const [tierFilter,  setTierFilter]  = useState('All')
  const [divFilter,   setDivFilter]   = useState('All')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(null)

  const anyFilterActive = !!(searchQ || stageFilter !== 'All' || tierFilter !== 'All' || divFilter !== 'All' || quickFilter)

  const resetFilters = useCallback(() => {
    setSearchQ('')
    setStageFilter('All')
    setTierFilter('All')
    setDivFilter('All')
    setQuickFilter(null)
  }, [])

  function toggleQuick(q: Exclude<QuickFilter, null>) {
    setQuickFilter(prev => prev === q ? null : q)
  }

  function openSchool(school: School) {
    router.push(`/schools/${school.id}`)
  }

  // ── Loading state ───────────────────────────────────────────────────────────
  if (schoolsLoading || logLoading) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: SL.inkLo, fontSize: 14,
      }}>
        Loading…
      </div>
    )
  }

  // ── Derive and sort all active schools ──────────────────────────────────────
  // Computed once; filter functions below reference these pre-computed values.
  const allRich: RichSchool[] = schools
    .filter(s => s.category !== 'Nope' && s.status !== 'Inactive')
    .map(school => ({
      school,
      stage:  deriveStage(school),
      signal: deriveSignal(school, contactLog),
    }))
    .sort((a, b) => {
      const ta = TIER_ORDER[a.school.category] ?? 9
      const tb = TIER_ORDER[b.school.category] ?? 9
      if (ta !== tb) return ta - tb
      // last_contact desc within tier (null sorts last)
      const la = a.school.last_contact ?? ''
      const lb = b.school.last_contact ?? ''
      return lb.localeCompare(la)
    })

  const total = allRich.length

  // ── Chip counts (computed over full list, not filtered) ─────────────────────
  const awaitingCount = allRich.filter(r => r.signal?.kind === 'awaiting').length
  const coldCount     = allRich.filter(r => r.signal?.kind === 'cold').length
  const activeCount   = allRich.filter(r => r.signal?.kind === 'awaiting' || r.signal?.kind === 'active').length

  // ── Apply filters ───────────────────────────────────────────────────────────
  const q = searchQ.toLowerCase().trim()

  const filtered = allRich.filter(({ school, stage, signal }) => {
    // Search: name, head_coach, location
    if (q) {
      const haystack = [school.name, school.head_coach ?? '', school.location ?? ''].join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }

    // Stage dropdown
    if (stageFilter !== 'All' && stageLabel(stage) !== stageFilter) return false

    // Tier dropdown
    if (tierFilter !== 'All' && school.category !== (tierFilter as Category)) return false

    // Division dropdown
    if (divFilter !== 'All' && school.division !== (divFilter as Division)) return false

    // Quick filters (mutually exclusive)
    if (quickFilter === 'awaiting' && signal?.kind !== 'awaiting') return false
    if (quickFilter === 'cold'     && signal?.kind !== 'cold')     return false
    if (quickFilter === 'active'   && signal?.kind !== 'awaiting' && signal?.kind !== 'active') return false

    return true
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  const filterBar = (
    <div style={{
      padding: '0 40px 10px',
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    }}>
      <Dropdown label="Stage"    value={stageFilter} options={STAGE_OPTIONS} onChange={setStageFilter} />
      <Dropdown label="Tier"     value={tierFilter}  options={TIER_OPTIONS}  onChange={setTierFilter}  />
      <Dropdown label="Division" value={divFilter}   options={DIV_OPTIONS}   onChange={setDivFilter}   />

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: SL.line2, margin: '0 4px' }} />

      <Chip
        label="Awaiting reply"
        count={awaitingCount}
        active={quickFilter === 'awaiting'}
        onClick={() => toggleQuick('awaiting')}
        color={{ bg: SL.tealSoft, fg: SL.tealDeep, bgOn: SL.tealDeep, fgOn: '#fff' }}
      />
      <Chip
        label="Going cold"
        count={coldCount}
        active={quickFilter === 'cold'}
        onClick={() => toggleQuick('cold')}
        color={{ bg: SL.goldSoft, fg: SL.goldInk, bgOn: SL.goldInk, fgOn: '#fff' }}
      />
      <Chip
        label="Active conversations"
        count={activeCount}
        active={quickFilter === 'active'}
        onClick={() => toggleQuick('active')}
        color={{ bg: SL.tealSoft, fg: SL.tealDeep, bgOn: SL.tealDeep, fgOn: '#fff' }}
      />

      {anyFilterActive && (
        <button
          onClick={resetFilters}
          style={{
            marginLeft: 4, padding: '6px 10px', background: 'transparent',
            border: 'none', color: SL.inkLo, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', letterSpacing: -0.1,
            textDecoration: 'underline', textUnderlineOffset: 3,
          }}
        >
          Reset
        </button>
      )}
    </div>
  )

  return (
    <>
      {/* ── Desktop ────────────────────────────────────────────────────────── */}
      <div className="hidden md:block" style={{ minHeight: '100vh', background: SL.paper }}>

        {/* Header */}
        <div style={{
          padding: '24px 40px 18px',
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, flexWrap: 'wrap' }}>
            <h1 style={{
              margin: 0, fontSize: 44, fontWeight: 700,
              letterSpacing: -1.8, color: SL.ink, lineHeight: 1, fontStyle: 'italic',
            }}>Schools.</h1>
            <div style={{ fontSize: 14, color: SL.inkLo, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {filtered.length} of {total}
            </div>
          </div>
          <button style={{
            padding: '8px 16px', background: SL.ink, color: '#fff',
            border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 650,
            cursor: 'pointer', letterSpacing: -0.1,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
            </svg>
            Add school
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '0 40px 14px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 10,
            background: '#fff', border: `1px solid ${SL.line2}`,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: SL.inkLo, flexShrink: 0 }}>
              <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search by school, coach, or location"
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: 14, color: SL.ink, letterSpacing: -0.1,
              }}
            />
            {searchQ && (
              <button
                onClick={() => setSearchQ('')}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: SL.inkMute, fontSize: 16, lineHeight: 1, padding: '0 2px',
                }}
                aria-label="Clear search"
              >×</button>
            )}
          </div>
        </div>

        {/* Filter row */}
        {filterBar}

        {/* Column headers + list */}
        <div style={{ margin: '14px 40px 0', borderTop: `1px solid ${SL.line}` }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '28px 1fr 100px 170px 180px 16px',
            gap: 18, alignItems: 'center',
            padding: '10px 20px', height: 36,
            fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase',
            fontWeight: 700, color: SL.inkLo,
            borderBottom: `1px solid ${SL.line}`,
            background: SL.paperDeep,
          }}>
            <div>Tier</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              School
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>Stage</div>
            <div>Progress</div>
            <div>Signal</div>
            <div/>
          </div>

          {filtered.length === 0
            ? <EmptyState onReset={resetFilters} />
            : filtered.map((rich, i) => (
                <DesktopRow
                  key={rich.school.id}
                  rich={rich}
                  even={i % 2 === 0}
                  onClick={() => openSchool(rich.school)}
                />
              ))
          }
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 60px 32px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 12, color: SL.inkLo, fontWeight: 500,
        }}>
          <div>Sort: <span style={{ color: SL.ink, fontWeight: 650 }}>Tier</span> · then last contact</div>
          <div>{filtered.length} school{filtered.length !== 1 ? 's' : ''} shown</div>
        </div>
      </div>

      {/* ── Mobile ─────────────────────────────────────────────────────────── */}
      <div className="block md:hidden" style={{ background: SL.paper, paddingBottom: 80 }}>

        {/* Mobile header */}
        <div style={{ padding: '8px 16px 14px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
          }}>
            <div style={{
              fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 700, color: SL.inkLo,
            }}>Pipeline</div>
            <button style={{
              padding: '6px 12px', background: SL.ink, color: '#fff',
              border: 'none', borderRadius: 999, fontSize: 12, fontWeight: 650,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
              </svg>
              Add
            </button>
          </div>
          <h1 style={{
            margin: 0, fontSize: 34, fontWeight: 700, color: SL.ink,
            letterSpacing: -1.4, lineHeight: 1, fontStyle: 'italic',
            display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
          }}>
            Schools.
            <span style={{
              fontSize: 13, fontWeight: 650, color: SL.inkLo, letterSpacing: 0,
              fontStyle: 'normal', fontVariantNumeric: 'tabular-nums',
            }}>{filtered.length} of {total}</span>
          </h1>
        </div>

        {/* Mobile search */}
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 10,
            background: '#fff', border: `1px solid ${SL.line2}`,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ color: SL.inkLo, flexShrink: 0 }}>
              <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search schools, coaches"
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: 14, color: SL.ink,
              }}
            />
            {searchQ && (
              <button
                onClick={() => setSearchQ('')}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: SL.inkMute, fontSize: 16, lineHeight: 1, padding: '0 2px',
                }}
                aria-label="Clear search"
              >×</button>
            )}
          </div>
        </div>

        {/* Mobile filter chips — horizontal scroll */}
        <div style={{ padding: '0 16px 10px', display: 'flex', gap: 6, overflowX: 'auto' }}>
          {/* Stage chip as native select on mobile for simplicity */}
          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 999, border: `1px solid ${SL.line2}`,
              background: stageFilter !== 'All' ? SL.ink : SL.paperDeep,
              color: stageFilter !== 'All' ? '#fff' : SL.ink,
              fontSize: 13, fontWeight: 550, cursor: 'pointer', appearance: 'none',
              WebkitAppearance: 'none', flexShrink: 0, paddingRight: 24,
            }}
          >
            {STAGE_OPTIONS.map(o => <option key={o} value={o}>{o === 'All' ? 'Stage' : o}</option>)}
          </select>
          <select
            value={tierFilter}
            onChange={e => setTierFilter(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 999, border: `1px solid ${SL.line2}`,
              background: tierFilter !== 'All' ? SL.ink : SL.paperDeep,
              color: tierFilter !== 'All' ? '#fff' : SL.ink,
              fontSize: 13, fontWeight: 550, cursor: 'pointer', appearance: 'none',
              WebkitAppearance: 'none', flexShrink: 0, paddingRight: 24,
            }}
          >
            {TIER_OPTIONS.map(o => <option key={o} value={o}>{o === 'All' ? 'Tier' : `Tier ${o}`}</option>)}
          </select>
          <select
            value={divFilter}
            onChange={e => setDivFilter(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 999, border: `1px solid ${SL.line2}`,
              background: divFilter !== 'All' ? SL.ink : SL.paperDeep,
              color: divFilter !== 'All' ? '#fff' : SL.ink,
              fontSize: 13, fontWeight: 550, cursor: 'pointer', appearance: 'none',
              WebkitAppearance: 'none', flexShrink: 0, paddingRight: 24,
            }}
          >
            {DIV_OPTIONS.map(o => <option key={o} value={o}>{o === 'All' ? 'Division' : o}</option>)}
          </select>

          <Chip
            label="Awaiting"
            count={awaitingCount}
            active={quickFilter === 'awaiting'}
            onClick={() => toggleQuick('awaiting')}
            color={{ bg: SL.tealSoft, fg: SL.tealDeep, bgOn: SL.tealDeep, fgOn: '#fff' }}
          />
          <Chip
            label="Cold"
            count={coldCount}
            active={quickFilter === 'cold'}
            onClick={() => toggleQuick('cold')}
            color={{ bg: SL.goldSoft, fg: SL.goldInk, bgOn: SL.goldInk, fgOn: '#fff' }}
          />
          <Chip
            label="Active"
            count={activeCount}
            active={quickFilter === 'active'}
            onClick={() => toggleQuick('active')}
            color={{ bg: SL.tealSoft, fg: SL.tealDeep, bgOn: SL.tealDeep, fgOn: '#fff' }}
          />
        </div>

        {/* Mobile column label */}
        <div style={{
          padding: '8px 16px 4px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase',
          fontWeight: 700, color: SL.inkLo,
          borderBottom: `1px solid ${SL.line}`,
        }}>
          <span>By tier</span>
          <span>Sort: Tier ↓</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: SL.ink, fontStyle: 'italic', marginBottom: 6 }}>
              No matches.
            </div>
            <div style={{ fontSize: 13, color: SL.inkMid, marginBottom: 16 }}>
              Try clearing filters or search.
            </div>
            <button
              onClick={resetFilters}
              style={{
                padding: '9px 18px', background: SL.ink, color: '#fff',
                border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 650, cursor: 'pointer',
              }}
            >
              Reset filters
            </button>
          </div>
        ) : (
          filtered.map(rich => (
            <MobileRow key={rich.school.id} rich={rich} onClick={() => openSchool(rich.school)} />
          ))
        )}
      </div>
    </>
  )
}

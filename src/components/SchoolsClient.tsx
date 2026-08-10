'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { User } from '@supabase/supabase-js'
import { useSchools, useContactLog } from '@/hooks/useRealtimeData'
import SchoolModal from './SchoolModal'

const SchoolsMap = dynamic(() => import('./schools/SchoolsMap'), {
  ssr: false,
  loading: () => <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7A7570' }}>Loading map...</div>,
})
import { stageLabel } from '@/lib/stages'
import {
  classifySchoolRecency,
  SCHOOL_RECENCY_STYLE,
  RECENCY_STATE_ORDER,
} from '@/lib/school-recency-state'
import type { SchoolRecencyState, SchoolRecencyResult } from '@/lib/school-recency-state'
import type { School, ContactLogEntry, Division, Category, SchoolConversationSummary, RecommendedActionCategory } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

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
  ink0:      '#0E0E0E',
}

// ─── Category pill colors (matches Home cards) ──────────────────────────────

const CATEGORY_BADGE_COLORS: Record<RecommendedActionCategory, { bg: string; text: string }> = {
  reply:     { bg: '#D7F0ED', text: '#006A65' },
  follow_up: { bg: '#DBEAFE', text: '#1E40AF' },
  check_in:  { bg: '#FEF3C7', text: '#92400E' },
  new_topic: { bg: '#E0E7FF', text: '#3730A3' },
  introduce: { bg: '#DCFCE7', text: '#166534' },
  wait:      { bg: '#F3F4F6', text: '#374151' },
}

// ─── Enriched school record (computed once, passed to rows) ───────────────────

interface RichSchool {
  school: School
  stage:  number
  recency: SchoolRecencyResult
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


function RecencyPill({ recency, compact }: { recency: SchoolRecencyResult; compact?: boolean }) {
  if (!recency.state) return <span style={{ fontSize: 12, color: SL.inkMute }}>—</span>

  const style = SCHOOL_RECENCY_STYLE[recency.state]
  const isDeclined = recency.state === 'declined'
  const isProspecting = recency.state === 'prospecting'

  // Build label text
  let labelText = style.label
  if (recency.state === 'hot' && recency.daysSinceUnrepliedInbound != null) {
    labelText = `${style.label} · ${recency.daysSinceUnrepliedInbound}d`
  }

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: compact ? '2px 8px' : '3px 10px',
      borderRadius: 999, background: style.bgColor, color: style.textColor,
      fontSize: compact ? 11 : 12, fontWeight: 650, letterSpacing: -0.1,
      whiteSpace: 'nowrap',
      textDecoration: isDeclined ? 'line-through' : 'none',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
        background: isProspecting ? 'transparent' : style.dotColor,
        border: isProspecting ? `1.5px solid ${style.dotColor}` : 'none',
      }} />
      {labelText}
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

function DesktopRow({ rich, even, summary }: {
  rich: RichSchool; even: boolean;
  summary: SchoolConversationSummary | null;
}) {
  const { school, recency } = rich
  const cat = summary?.recommended_action.category
  const badgeColors = cat ? CATEGORY_BADGE_COLORS[cat] : null
  const bgBase = even ? 'transparent' : 'rgba(239,232,216,0.3)'

  // The whole row is a real anchor: cmd/ctrl-click opens a new tab,
  // middle-click works, and the link is keyboard-focusable natively.
  return (
    <Link
      href={`/schools/${school.id}`}
      style={{
        textDecoration: 'none', color: 'inherit',
        display: 'grid',
        gridTemplateColumns: '28px 1fr minmax(180px, 2fr) 150px',
        gap: 14, alignItems: 'center',
        padding: '0 20px', height: 40,
        background: bgBase, borderBottom: `1px solid ${SL.line}`,
        cursor: 'pointer', transition: 'background 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = SL.paperDeep }}
      onMouseLeave={e => { e.currentTarget.style.background = bgBase }}
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
      {/* Next step */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {summary ? (
          <>
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
              padding: '2px 5px', borderRadius: 4, flexShrink: 0,
              backgroundColor: badgeColors?.bg ?? '#F3F4F6',
              color: badgeColors?.text ?? '#374151',
              whiteSpace: 'nowrap',
            }}>
              {cat!.replace('_', ' ')}
            </span>
            <span style={{
              fontSize: 12, color: SL.inkMid, fontWeight: 450,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {summary.recommended_action.description}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 12, color: SL.inkMute }}>—</span>
        )}
      </div>
      <div><RecencyPill recency={recency} /></div>
    </Link>
  )
}

// ─── Mobile row ───────────────────────────────────────────────────────────────

function MobileRow({ rich, summary }: { rich: RichSchool; summary: SchoolConversationSummary | null }) {
  const { school, recency } = rich
  const cat = summary?.recommended_action.category
  const badgeColors = cat ? CATEGORY_BADGE_COLORS[cat] : null
  return (
    <Link
      href={`/schools/${school.id}`}
      style={{
        textDecoration: 'none', color: 'inherit',
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
          {recency.state && <RecencyPill recency={recency} compact />}
          {cat && (
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
              padding: '1px 5px', borderRadius: 4,
              backgroundColor: badgeColors?.bg ?? '#F3F4F6',
              color: badgeColors?.text ?? '#374151',
              whiteSpace: 'nowrap',
            }}>
              {cat.replace('_', ' ')}
            </span>
          )}
        </div>
      </div>
      <div style={{ color: SL.inkMute, fontSize: 14 }}>›</div>
    </Link>
  )
}

// ─── The bench (Nope-tier / Inactive schools — set aside, not gone) ───────────

function benchHint(school: School): string {
  return school.status === 'Inactive' ? 'Inactive' : 'Set aside'
}

function BenchRow({ school }: { school: School }) {
  // Muted / ghost treatment, echoing how set-aside cards render on the board.
  return (
    <Link
      href={`/schools/${school.id}`}
      style={{
        textDecoration: 'none', color: 'inherit', opacity: 0.6,
        display: 'flex', alignItems: 'baseline', gap: 12,
        padding: '9px 20px', borderBottom: `1px solid ${SL.line}`,
        transition: 'opacity 0.1s, background 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.background = SL.paperDeep }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{
        flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: SL.inkMid, letterSpacing: -0.2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{school.short_name || school.name}</span>
      <span style={{ fontSize: 11, color: SL.inkLo, fontWeight: 500, flexShrink: 0 }}>{school.division}</span>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: SL.inkMute, flexShrink: 0, width: 66, textAlign: 'right' }}>
        {benchHint(school)}
      </span>
    </Link>
  )
}

function BenchSection({ schools, count, open, onToggle, padX }: {
  schools: School[]; count: number; open: boolean; onToggle: () => void; padX: number;
}) {
  return (
    <section style={{ margin: `28px ${padX}px 0` }}>
      <button
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'baseline', gap: 8, background: 'none', border: 'none',
          cursor: 'pointer', fontFamily: 'inherit', padding: 0, textAlign: 'left',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'clamp(16px, 2.2vw, 20px)', fontWeight: 700, letterSpacing: -0.4, color: SL.ink, fontStyle: 'italic' }}>
          The bench.
        </h2>
        <span style={{ fontSize: 13, fontWeight: 600, color: SL.inkLo }}>{count}</span>
        <span style={{ fontSize: 12, color: SL.inkMute, transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>▾</span>
      </button>
      <p style={{ margin: '4px 0 0', fontSize: 13, color: SL.inkLo, fontWeight: 450, letterSpacing: -0.1 }}>
        Schools you&apos;ve set aside — they sometimes come back.
      </p>
      {open && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${SL.line}` }}>
          {schools.length === 0
            ? <div style={{ padding: '16px 20px', fontSize: 13, color: SL.inkMute, fontStyle: 'italic' }}>No benched schools match your search.</div>
            : schools.map(s => <BenchRow key={s.id} school={s} />)
          }
        </div>
      )}
    </section>
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
        Try clearing your search or the signal filters.
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

const TIER_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 }

// ─── Signal filter chip config ──────────────────────────────────────────────

const SIGNAL_CHIP_CONFIG: Record<SchoolRecencyState, { label: string; bg: string; fg: string; bgOn: string; fgOn: string }> = {
  hot:         { label: 'Awaiting Finn', bg: '#FBEAE8', fg: '#7A1E16', bgOn: '#D03A2E', fgOn: '#fff' },
  active:      { label: 'Active',        bg: '#D7F0ED', fg: '#006A65', bgOn: '#006A65', fgOn: '#fff' },
  cooling:     { label: 'Cooling',       bg: '#FCF0DB', fg: '#7A4F0E', bgOn: '#E8A33C', fgOn: '#fff' },
  cold:        { label: 'Cold',          bg: '#EFF1F3', fg: '#5A6168', bgOn: '#5A6168', fgOn: '#fff' },
  prospecting: { label: 'Prospecting',   bg: '#F7F6F2', fg: '#7A7570', bgOn: '#7A7570', fgOn: '#fff' },
  declined:    { label: 'Declined',      bg: '#EFF1F3', fg: '#9CA3A8', bgOn: '#9CA3A8', fgOn: '#fff' },
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SchoolsClient({ user }: { user: User }) {
  const router = useRouter()
  const { schools, loading: schoolsLoading, insertSchool } = useSchools()
  const [showAddModal, setShowAddModal] = useState(false)
  const { entries: contactLog, loading: logLoading } = useContactLog()

  // ── Conversation summaries ────────────────────────────────────────────────
  const supabase = useState(() => createClient())[0]
  const [summaries, setSummaries] = useState<SchoolConversationSummary[]>([])
  const [summariesLoaded, setSummariesLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('school_conversation_summary')
        .select('*')
      if (!cancelled && data) {
        setSummaries(data as SchoolConversationSummary[])
        setSummariesLoaded(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [supabase])

  const summaryMap = new Map(summaries.map(s => [s.school_id, s]))

  // ── The bench (collapsed by default; auto-opens on a matching search) ──────
  const [benchOpen, setBenchOpen] = useState(false)

  // ── Refresh summaries ─────────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState<{ done: number; total: number } | null>(null)

  const handleRefreshSummaries = useCallback(async () => {
    const activeSchools = schools.filter(s => s.category !== 'Nope' && s.status !== 'Inactive' && ['A', 'B', 'C'].includes(s.category))
    const count = activeSchools.length
    if (!confirm(`Regenerate summaries for all ${count} active schools? Takes about a minute and costs a few dollars in API usage. Summaries auto-update when emails arrive — this is only needed after time-sensitive changes.`)) return

    setRefreshing(true)
    setRefreshProgress({ done: 0, total: count })
    let done = 0

    for (const school of activeSchools) {
      try {
        const res = await fetch(`/api/schools/${school.id}/conversation-summary`, { method: 'POST' })
        if (res.ok) {
          const updated = await res.json() as SchoolConversationSummary
          setSummaries(prev => {
            const filtered = prev.filter(s => s.school_id !== school.id)
            return [...filtered, updated]
          })
        }
      } catch { /* swallow — best-effort */ }
      done++
      setRefreshProgress({ done, total: count })
      // Rate limit: ~1 req/sec
      if (done < count) await new Promise(r => setTimeout(r, 1000))
    }

    setRefreshing(false)
    setRefreshProgress(null)
  }, [schools])

  const pathname = usePathname()
  const searchParams = useSearchParams()

  // ── URL-backed state helpers ──────────────────────────────────────────────
  const pushParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k); else params.set(k, v)
    }
    const q = params.toString()
    router.push(q ? `${pathname}?${q}` : pathname)
  }, [router, pathname, searchParams])

  const viewMode = (searchParams.get('view') === 'map' ? 'map' : 'list') as 'list' | 'map'
  const stageFilter = searchParams.get('stage') ?? 'All'
  const tierFilter = searchParams.get('tier') ?? 'All'
  const divFilter = searchParams.get('division') ?? 'All'

  // Signal filter: comma-separated states in URL, e.g. ?signal=hot,active.
  // The chips stand on their own — they make the recency axis filterable — and
  // this URL reading also serves any direct/bookmarked ?signal= visit. Note: no
  // live surface links into /schools?signal= today; the old StatsStrip
  // ?signal=hot linker was retired with the Home page, and StatsStrip/HomeClient
  // are now orphaned files (not rendered by any route).
  const signalParam = searchParams.get('signal')
  const signalFilter: Set<SchoolRecencyState> = new Set(
    signalParam ? signalParam.split(',').filter(s => RECENCY_STATE_ORDER.includes(s as SchoolRecencyState)) as SchoolRecencyState[] : []
  )
  const signalFilterActive = signalFilter.size > 0

  function toggleSignalFilter(state: SchoolRecencyState) {
    const next = new Set(signalFilter)
    if (next.has(state)) next.delete(state); else next.add(state)
    pushParams({ signal: next.size > 0 ? Array.from(next).join(',') : null })
  }

  function switchView(mode: 'list' | 'map') {
    pushParams({ view: mode === 'list' ? null : mode })
  }
  // Stage / Tier / Division filters are read from the URL (for old bookmarks &
  // deep-links) but no longer have dedicated dropdown UI — at 10 active schools,
  // the signal chips + search carry the filtering weight (Calendar precedent:
  // structure beats filters at small volumes).

  // Search: local state for responsive typing, debounced push to URL
  const [searchQ, setSearchQ] = useState(searchParams.get('search') ?? '')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setSearchQWithUrl = useCallback((v: string) => {
    setSearchQ(v)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      pushParams({ search: v || null })
    }, 400)
  }, [pushParams])

  const anyFilterActive = !!(searchQ || stageFilter !== 'All' || tierFilter !== 'All' || divFilter !== 'All' || signalFilterActive)

  const resetFilters = useCallback(() => {
    setSearchQ('')
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('stage'); params.delete('tier'); params.delete('division')
    params.delete('signal'); params.delete('search')
    const q = params.toString()
    router.push(q ? `${pathname}?${q}` : pathname)
  }, [router, pathname, searchParams])

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
  const allRich: RichSchool[] = schools
    .filter(s => s.category !== 'Nope' && s.status !== 'Inactive')
    .map(school => ({
      school,
      stage:   school.recruiting_stage ?? 1,
      recency: classifySchoolRecency(school, contactLog),
    }))
    .sort((a, b) => {
      const ta = TIER_ORDER[a.school.category] ?? 9
      const tb = TIER_ORDER[b.school.category] ?? 9
      if (ta !== tb) return ta - tb
      const la = a.school.last_contact ?? ''
      const lb = b.school.last_contact ?? ''
      return lb.localeCompare(la)
    })

  const total = allRich.length

  // ── Signal chip counts (computed over full list, not filtered) ─────────────
  const signalCounts: Record<SchoolRecencyState, number> = {
    hot: 0, active: 0, cooling: 0, cold: 0, prospecting: 0, declined: 0,
  }
  for (const r of allRich) {
    if (r.recency.state) signalCounts[r.recency.state]++
  }

  // ── Apply filters ───────────────────────────────────────────────────────────
  const q = searchQ.toLowerCase().trim()

  const filtered = allRich.filter(({ school, stage, recency }) => {
    if (q) {
      const haystack = [school.name, school.head_coach ?? '', school.location ?? ''].join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    if (stageFilter !== 'All' && stageLabel(stage) !== stageFilter) return false
    if (tierFilter !== 'All' && school.category !== (tierFilter as Category)) return false
    if (divFilter !== 'All' && school.division !== (divFilter as Division)) return false

    // Signal filter: multi-select
    if (signalFilterActive) {
      if (!recency.state || !signalFilter.has(recency.state)) return false
    }

    return true
  })

  // ── The bench: Nope-tier or Inactive schools, set aside from the board ──────
  // Only the search query filters the bench (it exists to make set-aside schools
  // findable by name); the board's signal/tier filters don't apply here.
  const benchAll = schools
    .filter(s => s.category === 'Nope' || s.status === 'Inactive')
    .sort((a, b) => (a.short_name || a.name).localeCompare(b.short_name || b.name))
  const benchFiltered = q
    ? benchAll.filter(s => [s.name, s.short_name ?? '', s.head_coach ?? '', s.location ?? ''].join(' ').toLowerCase().includes(q))
    : benchAll
  const benchCount = q ? benchFiltered.length : benchAll.length
  const benchEffectiveOpen = benchOpen || (!!q && benchFiltered.length > 0)

  // ─────────────────────────────────────────────────────────────────────────────
  // Signal filter chips (shared between desktop and mobile)
  // ─────────────────────────────────────────────────────────────────────────────

  const signalChips = RECENCY_STATE_ORDER.map(state => {
    const cfg = SIGNAL_CHIP_CONFIG[state]
    return (
      <Chip
        key={state}
        label={cfg.label}
        count={signalCounts[state]}
        active={signalFilter.has(state)}
        onClick={() => toggleSignalFilter(state)}
        color={cfg}
      />
    )
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  const filterBar = (
    <div style={{
      padding: '0 40px 10px',
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    }}>
      {signalChips}

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
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, flexWrap: 'wrap' }}>
              <h1 style={{
                margin: 0, fontSize: 44, fontWeight: 700,
                letterSpacing: -1.8, color: SL.ink, lineHeight: 1, fontStyle: 'italic',
              }}>Schools.</h1>
              <div style={{ fontSize: 14, color: SL.inkLo, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {filtered.length} of {total}
              </div>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 15, color: SL.inkLo, fontWeight: 450, letterSpacing: -0.1, maxWidth: 520, lineHeight: 1.5 }}>
              Your whole pipeline — every program you&apos;re chasing, and the ones you&apos;ve set aside.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* View mode toggle */}
            <div style={{ display: 'flex', borderRadius: 999, overflow: 'hidden', border: `1px solid ${SL.line2}` }}>
              <button
                onClick={() => switchView('list')}
                style={{
                  padding: '6px 12px', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  background: viewMode === 'list' ? SL.ink : 'transparent',
                  color: viewMode === 'list' ? '#fff' : SL.inkLo,
                }}
              >List</button>
              <button
                onClick={() => switchView('map')}
                style={{
                  padding: '6px 12px', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  background: viewMode === 'map' ? SL.ink : 'transparent',
                  color: viewMode === 'map' ? '#fff' : SL.inkLo,
                }}
              >Map</button>
            </div>
            {/* Refresh summaries */}
            <button
              onClick={handleRefreshSummaries}
              disabled={refreshing}
              style={{
                padding: '6px 12px', borderRadius: 999,
                border: `1px solid ${SL.line2}`, background: 'transparent',
                color: refreshing ? SL.inkMute : SL.inkLo,
                fontSize: 12, fontWeight: 600, cursor: refreshing ? 'default' : 'pointer',
                fontFamily: 'inherit', opacity: refreshing ? 0.7 : 1,
              }}
            >
              {refreshing && refreshProgress
                ? `Refreshing ${refreshProgress.done}/${refreshProgress.total}…`
                : 'Refresh summaries'}
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
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
              onChange={e => setSearchQWithUrl(e.target.value)}
              placeholder="Search by school, coach, or location"
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: 14, color: SL.ink, letterSpacing: -0.1,
              }}
            />
            {searchQ && (
              <button
                onClick={() => setSearchQWithUrl('')}
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

        {/* Content: list or map */}
        {viewMode === 'list' ? (
          <div style={{ margin: '14px 40px 0', borderTop: `1px solid ${SL.line}` }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '28px 1fr minmax(180px, 2fr) 150px',
              gap: 14, alignItems: 'center',
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
              <div>Next Step</div>
              <div>Signal</div>
            </div>

            {filtered.length === 0
              ? <EmptyState onReset={resetFilters} />
              : filtered.map((rich, i) => (
                  <DesktopRow
                    key={rich.school.id}
                    rich={rich}
                    even={i % 2 === 0}
                    summary={summaryMap.get(rich.school.id) ?? null}
                  />
                ))
            }
          </div>
        ) : (
          <div style={{ margin: '14px 40px 0' }}>
            <SchoolsMap
              schools={filtered.map(r => ({ school: r.school, state: r.recency.state }))}
              onSchoolClick={(id) => router.push(`/schools/${id}`)}
            />
          </div>
        )}

        {/* The bench (list view only) */}
        {viewMode === 'list' && (
          <BenchSection
            schools={benchFiltered}
            count={benchCount}
            open={benchEffectiveOpen}
            onToggle={() => setBenchOpen(o => !o)}
            padX={40}
          />
        )}

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
        <div style={{ padding: '14px 16px' }}>
          <div style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          }}>
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
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                flexShrink: 0, padding: '6px 12px', background: SL.ink, color: '#fff',
                border: 'none', borderRadius: 999, fontSize: 12, fontWeight: 650,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
              }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
              </svg>
              Add
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: SL.inkLo, fontWeight: 450, letterSpacing: -0.1, lineHeight: 1.5 }}>
            Your whole pipeline — chasing, and set aside.
          </p>
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
              onChange={e => setSearchQWithUrl(e.target.value)}
              placeholder="Search schools, coaches"
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: 14, color: SL.ink,
              }}
            />
            {searchQ && (
              <button
                onClick={() => setSearchQWithUrl('')}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: SL.inkMute, fontSize: 16, lineHeight: 1, padding: '0 2px',
                }}
                aria-label="Clear search"
              >×</button>
            )}
          </div>
        </div>

        {/* Mobile signal chips — horizontal scroll */}
        <div style={{ padding: '0 16px 12px', display: 'flex', gap: 6, overflowX: 'auto' }}>
          {signalChips}
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
          <div style={{ borderTop: `1px solid ${SL.line}` }}>
            {filtered.map(rich => (
              <MobileRow key={rich.school.id} rich={rich} summary={summaryMap.get(rich.school.id) ?? null} />
            ))}
          </div>
        )}

        {/* The bench (mobile) */}
        <BenchSection
          schools={benchFiltered}
          count={benchCount}
          open={benchEffectiveOpen}
          onToggle={() => setBenchOpen(o => !o)}
          padX={16}
        />
      </div>

      {showAddModal && (
        <SchoolModal
          school={null}
          userId={user.id}
          onInsert={async (school) => {
            const error = await insertSchool(school)
            if (error) {
              alert(`Failed to create school: ${error.message}`)
              throw new Error(error.message)
            }
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { School, ContactLogEntry, RecruitingStage } from '@/lib/types'
import { STAGE_META } from '@/lib/types'
import { classifySchoolRecency, SCHOOL_RECENCY_STYLE } from '@/lib/school-recency-state'
import type { SchoolRecencyState } from '@/lib/school-recency-state'

// ─── Design tokens ──────────────────────────────────────────────────────────

const SD = {
  paper:     '#F6F1E8',
  paperDeep: '#EFE8D8',
  ink:       '#0E0E0E',
  inkMid:    '#4A4A4A',
  inkLo:     '#7A7570',
  inkMute:   '#A8A39B',
  line:      '#E2DBC9',
  line2:     '#D3CAB3',
}

const TIER_DOT: Record<string, string> = {
  A: '#166534', B: '#1E40AF', C: '#92400E',
}

// ─── Grid config ────────────────────────────────────────────────────────────

const STAGES: RecruitingStage[] = [1, 2, 3, 4, 5, 6]

// Rows in display order (top = hottest)
type GridRow = 'hot' | 'active' | 'cooling' | 'cold' | 'prospecting'
const ROWS: GridRow[] = ['hot', 'active', 'cooling', 'cold', 'prospecting']
const ROW_LABEL: Record<GridRow, string> = {
  hot: 'Awaiting Finn',
  active: 'Active',
  cooling: 'Cooling',
  cold: 'Cold',
  prospecting: 'Prospecting',
}

// Quadrant zone tints (subtle parchment-compatible)
const ZONE_TINT = {
  deepHot:     'rgba(0, 178, 169, 0.06)',   // Close — teal tint
  shallowHot:  'rgba(30, 64, 175, 0.05)',   // Convert — blue tint
  deepCold:    'rgba(232, 163, 60, 0.06)',   // Re-warm — amber tint
  shallowCold: 'rgba(156, 163, 168, 0.05)', // Nudge — gray tint
}

const ZONE_LABEL = {
  deepHot:     'Close',
  shallowHot:  'Convert',
  deepCold:    'Re-warm',
  shallowCold: 'Nudge',
}

const COLLAPSE_KEY = 'funnel-grid-collapsed'
const MAX_CHIPS = 3

// ─── Types ──────────────────────────────────────────────────────────────────

interface CellSchool {
  id: string
  name: string
  short_name: string | null
  category: string
  isDeclined: boolean
}

interface Props {
  schools: School[]
  contactLog: ContactLogEntry[]
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function FunnelGrid({ schools, contactLog }: Props) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  // Load collapse state from localStorage
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1') } catch {}
  }, [])

  function toggleCollapse() {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch {}
  }

  // Build contact log map for recency classification
  const clMap = new Map<string, ContactLogEntry[]>()
  for (const e of contactLog) {
    if (!e.school_id) continue
    const arr = clMap.get(e.school_id) ?? []
    arr.push(e)
    clMap.set(e.school_id, arr)
  }

  // Filter and classify schools
  const active = schools.filter(s =>
    ['A', 'B', 'C'].includes(s.category) && s.status !== 'Inactive'
  )

  // Build grid: cells[row][stage] = CellSchool[]
  const cells = new Map<string, CellSchool[]>()
  for (const row of ROWS) {
    for (const stage of STAGES) {
      cells.set(`${row}-${stage}`, [])
    }
  }

  for (const school of active) {
    const cl = clMap.get(school.id) ?? []
    const recency = classifySchoolRecency(school, cl)
    const state = recency.state
    const stage = (school.recruiting_stage ?? 1) as RecruitingStage

    // Map recency state to grid row
    let row: GridRow
    if (state === 'declined') {
      // Declined schools render in Cold row with a marker
      row = 'cold'
    } else if (state === 'hot') row = 'hot'
    else if (state === 'active') row = 'active'
    else if (state === 'cooling') row = 'cooling'
    else if (state === 'cold') row = 'cold'
    else if (state === 'prospecting') row = 'prospecting'
    else row = 'prospecting' // null state = no contact

    const key = `${row}-${stage}`
    cells.get(key)!.push({
      id: school.id,
      name: school.name,
      short_name: school.short_name,
      category: school.category,
      isDeclined: state === 'declined',
    })
  }

  // ── Mobile: stacked quadrant buckets ──────────────────────────────────────

  const mobileBuckets = {
    deepHot:     [] as CellSchool[],
    shallowHot:  [] as CellSchool[],
    deepCold:    [] as CellSchool[],
    shallowCold: [] as CellSchool[],
  }
  for (const row of ROWS) {
    for (const stage of STAGES) {
      const arr = cells.get(`${row}-${stage}`) ?? []
      const isDeep = stage >= 4
      const isHot = row === 'hot' || row === 'active'
      const bucket = isDeep
        ? (isHot ? 'deepHot' : 'deepCold')
        : (isHot ? 'shallowHot' : 'shallowCold')
      mobileBuckets[bucket].push(...arr)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section style={{ marginBottom: 32 }}>
      {/* Header with collapse toggle */}
      <button
        onClick={toggleCollapse}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', padding: 0, marginBottom: collapsed ? 0 : 16,
        }}
      >
        <h2 style={{
          margin: 0, fontSize: 'clamp(18px, 2.5vw, 22px)', fontWeight: 700,
          letterSpacing: '-0.03em', color: SD.ink, fontStyle: 'italic',
        }}>
          Pipeline.
        </h2>
        <span style={{
          fontSize: 12, color: SD.inkMute,
          transition: 'transform 0.15s',
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
        }}>▾</span>
      </button>

      {!collapsed && (
        <>
          {/* Desktop grid */}
          <div className="funnel-grid-desktop" style={{
            display: 'grid',
            gridTemplateColumns: '90px repeat(6, 1fr)',
            gridTemplateRows: 'auto repeat(5, 1fr)',
            border: `1px solid ${SD.line}`,
            borderRadius: 10,
            overflow: 'hidden',
            background: '#fff',
            fontSize: 11,
          }}>
            {/* Column headers */}
            <div style={headerCell()} />
            {STAGES.map(s => (
              <div key={s} style={{
                ...headerCell(),
                borderLeft: `1px solid ${SD.line}`,
                fontWeight: 700,
                color: SD.inkMid,
              }}>
                {STAGE_META[s].label}
              </div>
            ))}

            {/* Data rows */}
            {ROWS.map((row) => (
              <div key={row} style={{ display: 'contents' }}>
                {/* Row label */}
                <div style={{
                  padding: '6px 10px',
                  borderTop: `1px solid ${SD.line}`,
                  fontSize: 10, fontWeight: 700, color: SCHOOL_RECENCY_STYLE[row as SchoolRecencyState]?.textColor ?? SD.inkLo,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  display: 'flex', alignItems: 'center',
                  background: SD.paper,
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%', marginRight: 6, flexShrink: 0,
                    background: SCHOOL_RECENCY_STYLE[row as SchoolRecencyState]?.dotColor ?? SD.inkMute,
                  }} />
                  {ROW_LABEL[row]}
                </div>

                {/* Data cells */}
                {STAGES.map(stage => {
                  const key = `${row}-${stage}`
                  const arr = cells.get(key) ?? []
                  const isDeep = stage >= 4
                  // Split: hot/active = hot zone, cooling/cold/prospecting = cold zone
                  const isHot = row === 'hot' || row === 'active'
                  const zone = isDeep
                    ? (isHot ? 'deepHot' : 'deepCold')
                    : (isHot ? 'shallowHot' : 'shallowCold')
                  const tint = ZONE_TINT[zone]

                  // Zone labels at corners
                  const showZoneLabel =
                    (zone === 'shallowHot' && stage === 1 && row === 'hot') ||
                    (zone === 'deepHot' && stage === 4 && row === 'hot') ||
                    (zone === 'shallowCold' && stage === 1 && row === 'cooling') ||
                    (zone === 'deepCold' && stage === 4 && row === 'cooling')

                  return (
                    <div key={`${row}-${stage}`} style={{
                      padding: '5px 4px',
                      borderTop: `1px solid ${SD.line}`,
                      borderLeft: `1px solid ${SD.line}`,
                      background: tint,
                      minHeight: 36,
                      position: 'relative',
                    }}>
                      {showZoneLabel && (
                        <span style={{
                          position: 'absolute', top: 2, right: 4,
                          fontSize: 8, fontWeight: 800, textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          color: SD.inkMute, opacity: 0.6,
                        }}>
                          {ZONE_LABEL[zone]}
                        </span>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {arr.slice(0, MAX_CHIPS).map(s => (
                          <Chip key={s.id} school={s} onClick={() => router.push(`/schools/${s.id}`)} />
                        ))}
                        {arr.length > MAX_CHIPS && (
                          <span
                            title={arr.slice(MAX_CHIPS).map(s => s.short_name ?? s.name).join(', ')}
                            style={{
                              fontSize: 9, fontWeight: 700, color: SD.inkLo,
                              padding: '1px 5px', borderRadius: 999,
                              background: SD.paperDeep, cursor: 'default',
                            }}
                          >
                            +{arr.length - MAX_CHIPS}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Mobile fallback: stacked quadrant buckets */}
          <div className="funnel-grid-mobile" style={{ display: 'none' }}>
            {([
              { key: 'deepHot' as const, label: 'Close', desc: 'Deep + Hot' },
              { key: 'shallowHot' as const, label: 'Convert', desc: 'Shallow + Hot' },
              { key: 'deepCold' as const, label: 'Re-warm', desc: 'Deep + Cold' },
              { key: 'shallowCold' as const, label: 'Nudge', desc: 'Shallow + Cold' },
            ]).map(({ key, label, desc }) => {
              const arr = mobileBuckets[key]
              if (arr.length === 0) return null
              return (
                <div key={key} style={{
                  background: ZONE_TINT[key],
                  border: `1px solid ${SD.line}`,
                  borderRadius: 8, padding: '8px 12px', marginBottom: 8,
                }}>
                  <div style={{
                    fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                    letterSpacing: '0.06em', color: SD.inkLo, marginBottom: 6,
                  }}>
                    {label} <span style={{ fontWeight: 500, textTransform: 'none' }}>· {desc}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {arr.map(s => (
                      <Chip key={s.id} school={s} onClick={() => router.push(`/schools/${s.id}`)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <style>{`
            @media (max-width: 700px) {
              .funnel-grid-desktop { display: none !important; }
              .funnel-grid-mobile { display: block !important; }
            }
          `}</style>
        </>
      )}
    </section>
  )
}

// ─── Chip ───────────────────────────────────────────────────────────────────

function Chip({ school, onClick }: { school: CellSchool; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={school.name + (school.isDeclined ? ' (declined — needs triage)' : '')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        padding: '2px 7px', borderRadius: 999,
        border: 'none', background: SD.paperDeep,
        cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 10, fontWeight: 600, color: SD.ink,
        whiteSpace: 'nowrap', lineHeight: 1.4,
        textDecoration: school.isDeclined ? 'line-through' : 'none',
        opacity: school.isDeclined ? 0.65 : 1,
      }}
    >
      <span style={{
        width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
        background: TIER_DOT[school.category] ?? SD.inkMute,
      }} />
      {school.short_name ?? school.name.slice(0, 12)}
      {school.isDeclined && (
        <span style={{
          width: 4, height: 4, borderRadius: '50%',
          background: '#D03A2E', flexShrink: 0,
        }} title="Declined — needs triage" />
      )}
    </button>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function headerCell(): React.CSSProperties {
  return {
    padding: '6px 8px',
    background: SD.paper,
    fontSize: 10, fontWeight: 600, color: SD.inkLo,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }
}

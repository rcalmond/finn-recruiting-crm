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
  cardWhite: '#FFFDF9',
  ink:       '#1A1A1A',
  inkMid:    '#4A4A4A',
  inkLo:     '#6B655A',
  inkMute:   '#8A8478',
  line:      '#E2DBC9',
  line2:     '#D3CAB3',
  lineWarm:  '#DDD5C3',
  // DATA: persimmon marks the "Close" temperature zone (tint, zone label, tile
  // border, legend dot). Kept — it encodes temperature, not brand chrome.
  persimmon: '#C13E24',
  // CHROME: the awaiting ring ("your move" UI signal) is the brand accent.
  pitch:     '#1F6B48',
}

const TIER_DOT: Record<string, string> = {
  A: '#166534', B: '#1E40AF', C: '#92400E',
}

// ─── Grid config ────────────────────────────────────────────────────────────

const STAGES: RecruitingStage[] = [1, 2, 3, 4, 5, 6]

// Awaiting-your-reply is a whose-turn signal, not a temperature — those schools
// fold into Active and carry the awaiting ring. Rows are a clean temperature
// gradient.
type GridRow = 'active' | 'cooling' | 'cold' | 'prospecting'
const ROWS: GridRow[] = ['active', 'cooling', 'cold', 'prospecting']
const ROW_LABEL: Record<GridRow, string> = {
  active: 'Active', cooling: 'Cooling', cold: 'Cold', prospecting: 'Prospecting',
}
const ROW_DOT: Record<GridRow, string> = {
  active: '#00B2A9', cooling: '#E8A33C', cold: '#9CA3A8', prospecting: '#9CA3A8',
}

// Zone tints + labels pulled through from the marketing board.
const ZONE_TINT = {
  deepHot:     'rgba(193, 62, 36, 0.10)',   // Close — persimmon tint
  shallowHot:  'rgba(30, 64, 175, 0.07)',   // Convert — blue tint
  deepCold:    'rgba(232, 163, 60, 0.12)',  // Re-warm — amber tint
  shallowCold: 'rgba(156, 163, 168, 0.10)', // Nudge — gray tint
}
const ZONE_LABEL = {
  deepHot: 'Close', shallowHot: 'Convert', deepCold: 'Re-warm', shallowCold: 'Nudge',
}

const COLLAPSE_KEY = 'funnel-grid-collapsed'

// ─── Types ──────────────────────────────────────────────────────────────────

interface CellSchool {
  id: string
  name: string
  short_name: string | null
  category: string
  isDeclined: boolean
  awaiting: boolean   // your move — recency-hot AND recommendation != 'wait'
}

interface Props {
  schools: School[]
  contactLog: ContactLogEntry[]
  // Ids of active schools whose summary recommendation is 'wait' (deliberate
  // hold). They stay in the Active row but do NOT wear the "your move" ring.
  // Optional only so the orphaned HomeClient (unrendered, pending delete) still
  // compiles; the live caller (GetRecruitedClient) always passes it.
  waitSchoolIds?: Set<string>
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function FunnelGrid({ schools, contactLog, waitSchoolIds = new Set<string>() }: Props) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1') } catch {}
  }, [])

  function toggleCollapse() {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch {}
  }

  // Build contact log map
  const clMap = new Map<string, ContactLogEntry[]>()
  for (const e of contactLog) {
    if (!e.school_id) continue
    const arr = clMap.get(e.school_id) ?? []
    arr.push(e)
    clMap.set(e.school_id, arr)
  }

  // Filter and classify
  const active = schools.filter(s =>
    ['A', 'B', 'C'].includes(s.category) && s.status !== 'Inactive'
  )

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

    // Awaiting (former "hot") maps into Active. The ring ("your move") requires
    // BOTH recency-hot AND a non-wait recommendation — a school on a deliberate
    // hold sits in Active with no ring. No-summary schools aren't in the wait
    // set, so they keep the recency-only ring.
    let row: GridRow
    let awaiting = false
    if (state === 'hot') { row = 'active'; awaiting = !waitSchoolIds.has(school.id) }
    else if (state === 'declined') row = 'cold'
    else if (state === 'active') row = 'active'
    else if (state === 'cooling') row = 'cooling'
    else if (state === 'cold') row = 'cold'
    else if (state === 'prospecting') row = 'prospecting'
    else row = 'prospecting'

    cells.get(`${row}-${stage}`)!.push({
      id: school.id,
      name: school.name,
      short_name: school.short_name,
      category: school.category,
      isDeclined: state === 'declined',
      awaiting,
    })
  }

  // Mobile buckets (warm = Active row; cool = Cooling and below)
  const mobileBuckets = {
    deepHot: [] as CellSchool[], shallowHot: [] as CellSchool[],
    deepCold: [] as CellSchool[], shallowCold: [] as CellSchool[],
  }
  for (const row of ROWS) {
    for (const stage of STAGES) {
      const arr = cells.get(`${row}-${stage}`) ?? []
      const isDeep = stage >= 4
      const isHot = row === 'active'
      const bucket = isDeep ? (isHot ? 'deepHot' : 'deepCold') : (isHot ? 'shallowHot' : 'shallowCold')
      mobileBuckets[bucket].push(...arr)
    }
  }

  return (
    <section style={{ marginBottom: 32 }}>
      {/* Heading with collapse */}
      <div style={{ marginBottom: collapsed ? 0 : 16 }}>
        <button
          onClick={toggleCollapse}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', padding: 0,
          }}
        >
          <h2 style={{
            margin: 0, fontSize: 'clamp(18px, 2.5vw, 22px)', fontWeight: 700,
            letterSpacing: '-0.03em', color: SD.ink, fontStyle: 'italic',
          }}>
            The board<span style={{ color: SD.pitch }}>.</span>
          </h2>
          <span style={{
            fontSize: 12, color: SD.inkMute,
            transition: 'transform 0.15s',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          }}>▾</span>
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Desktop grid */}
          <div className="funnel-grid-desktop" style={{
            display: 'grid',
            gridTemplateColumns: '100px repeat(6, 1fr)',
            gridTemplateRows: 'auto repeat(4, 1fr)',
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
                {/* Row label with temperature dot */}
                <div style={{
                  padding: '6px 10px',
                  borderTop: `1px solid ${SD.line}`,
                  fontSize: 10, fontWeight: 700,
                  color: SCHOOL_RECENCY_STYLE[row as SchoolRecencyState]?.textColor ?? SD.inkLo,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  display: 'flex', alignItems: 'center',
                  background: SD.paper,
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', marginRight: 6, flexShrink: 0,
                    background: ROW_DOT[row],
                  }} />
                  {ROW_LABEL[row]}
                </div>

                {/* Data cells */}
                {STAGES.map(stage => {
                  const key = `${row}-${stage}`
                  const arr = cells.get(key) ?? []
                  const isDeep = stage >= 4
                  const isHot = row === 'active'
                  const zone = isDeep
                    ? (isHot ? 'deepHot' : 'deepCold')
                    : (isHot ? 'shallowHot' : 'shallowCold')
                  const tint = ZONE_TINT[zone]

                  // Anchor each zone label to a corner cell: Active row carries
                  // Convert (stage 1) + Close (stage 4); Cooling carries Nudge +
                  // Re-warm — same geometry as before, minus the Awaiting row.
                  const showZoneLabel =
                    (zone === 'shallowHot' && stage === 1 && row === 'active') ||
                    (zone === 'deepHot' && stage === 4 && row === 'active') ||
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
                          position: 'absolute', top: 3, right: 5,
                          fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          color: zone === 'deepHot' ? SD.persimmon : SD.inkMute,
                          opacity: zone === 'deepHot' ? 0.8 : 0.65,
                        }}>
                          {ZONE_LABEL[zone]}
                        </span>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {arr.map(s => (
                          <Chip
                            key={s.id}
                            school={s}
                            isCloseZone={zone === 'deepHot'}
                            onClick={() => router.push(`/schools/${s.id}`)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Mobile fallback */}
          <div className="funnel-grid-mobile" style={{ display: 'none' }}>
            {([
              { key: 'deepHot' as const, label: 'Close', desc: 'Deep + Active' },
              { key: 'shallowHot' as const, label: 'Convert', desc: 'Shallow + Active' },
              { key: 'deepCold' as const, label: 'Re-warm', desc: 'Deep + Cooling' },
              { key: 'shallowCold' as const, label: 'Nudge', desc: 'Shallow + Cooling' },
            ]).map(({ key, label, desc }) => {
              const arr = mobileBuckets[key]
              if (arr.length === 0) return null
              return (
                <div key={key} style={{
                  background: ZONE_TINT[key], border: `1px solid ${SD.line}`,
                  borderRadius: 8, padding: '8px 12px', marginBottom: 8,
                }}>
                  <div style={{
                    fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: key === 'deepHot' ? SD.persimmon : SD.inkLo,
                    marginBottom: 6,
                  }}>
                    {label} <span style={{ fontWeight: 500, textTransform: 'none' }}>· {desc}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {arr.map(s => (
                      <Chip key={s.id} school={s} isCloseZone={key === 'deepHot'} onClick={() => router.push(`/schools/${s.id}`)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div style={{ marginTop: 12, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 11, color: SD.inkLo }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 16, height: 13, borderRadius: 999, border: `2px solid ${SD.pitch}`, background: SD.cardWhite, display: 'inline-block', flexShrink: 0 }} />
              ring = your move
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: SD.persimmon, display: 'inline-block', flexShrink: 0 }} />
              Close zone = deep + active
            </span>
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
// Styling matched to the marketing board chips (white fill, hairline border,
// size/radius/type). The ring (2px pitch) means "your move" (recency-hot
// AND a non-wait recommendation) and wins over the close-zone border.

function Chip({ school, isCloseZone, onClick }: { school: CellSchool; isCloseZone: boolean; onClick: () => void }) {
  const border = school.awaiting
    ? `2px solid ${SD.pitch}`
    : isCloseZone
    ? '1px solid rgba(193, 62, 36, 0.35)'
    : `1px solid ${SD.lineWarm}`
  return (
    <button
      onClick={onClick}
      title={school.name + (school.awaiting ? ' (your move)' : '') + (school.isDeclined ? ' (declined — needs triage)' : '')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 9px', borderRadius: 999,
        border,
        background: SD.cardWhite,
        cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 11, fontWeight: 600, color: SD.ink,
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

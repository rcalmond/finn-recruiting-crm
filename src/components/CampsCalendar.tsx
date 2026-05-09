'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { CampWithRelations, CampFinnStatusValue } from '@/lib/types'
import { getCampDisplayName } from '@/lib/camp-display'

// ─── Design tokens ───────────────────────────────────────────────────────────

const LV = {
  paper:    '#F6F1E8',
  paperDeep:'#EFE8D8',
  ink:      '#0E0E0E',
  inkMid:   '#4A4A4A',
  inkLo:    '#7A7570',
  inkMute:  '#A8A39B',
  line:     '#E2DBC9',
}

const BAR_COLORS: Record<CampFinnStatusValue, { bg: string; accent: string; text: string }> = {
  interested: { bg: '#DBEAFE', accent: '#3B82F6', text: '#1E40AF' },
  targeted:   { bg: '#FEF3C7', accent: '#F59E0B', text: '#92400E' },
  registered: { bg: '#D7F0ED', accent: '#14B8A6', text: '#006A65' },
  attended:   { bg: '#F3F4F6', accent: '#6B7280', text: '#374151' },
  declined:   { bg: '#FEE2E2', accent: '#EF4444', text: '#991B1B' },
}

const STATUS_PRIORITY: Record<CampFinnStatusValue, number> = {
  targeted: 0,
  registered: 1,
  interested: 2,
  declined: 3,
  attended: 4,
}

function campStatusPriority(c: CampWithRelations): number {
  return STATUS_PRIORITY[c.finnStatus?.status ?? 'interested']
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_VISIBLE_SLOTS = 4
const SLOT_TOP_OFFSET = 28  // px from cell top (below day number)
const SLOT_HEIGHT = 22
const SLOT_GAP = 2

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildMonthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1)
  const startDay = first.getDay()
  const gridStart = new Date(year, month, 1 - startDay)

  const weeks: Date[][] = []
  for (let w = 0; w < 6; w++) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(gridStart)
      date.setDate(gridStart.getDate() + w * 7 + d)
      week.push(date)
    }
    weeks.push(week)
  }
  return weeks
}

function campsOnDate(camps: CampWithRelations[], dateStr: string): CampWithRelations[] {
  return camps.filter(c => c.camp.start_date <= dateStr && c.camp.end_date >= dateStr)
}

/**
 * Assign locked slot indices for multi-day camps within a week.
 * Uses greedy packing: each camp gets the lowest slot that doesn't
 * conflict with already-placed camps on any shared day.
 */
function computeMultiDaySlots(week: Date[], camps: CampWithRelations[]): Map<string, number> {
  const weekStart = toDateStr(week[0])
  const weekEnd = toDateStr(week[6])

  // Collect multi-day camps active this week
  const multiDay: CampWithRelations[] = []
  const seen = new Set<string>()
  for (const day of week) {
    const ds = toDateStr(day)
    for (const c of campsOnDate(camps, ds)) {
      if (c.camp.start_date !== c.camp.end_date && !seen.has(c.camp.id)) {
        seen.add(c.camp.id)
        multiDay.push(c)
      }
    }
  }

  // Sort by start_date, then status priority, then name for deterministic ordering
  multiDay.sort((a, b) => {
    if (a.camp.start_date !== b.camp.start_date) return a.camp.start_date.localeCompare(b.camp.start_date)
    const pa = campStatusPriority(a), pb = campStatusPriority(b)
    if (pa !== pb) return pa - pb
    return a.camp.name.localeCompare(b.camp.name)
  })

  // Greedy slot packing: for each camp, find lowest slot not conflicting
  // with any already-placed camp on any shared day
  const slotMap = new Map<string, number>()
  const placed: Array<{ camp: CampWithRelations; slot: number }> = []

  for (const camp of multiDay) {
    // Effective date range within this week
    const cStart = camp.camp.start_date < weekStart ? weekStart : camp.camp.start_date
    const cEnd = camp.camp.end_date > weekEnd ? weekEnd : camp.camp.end_date

    let slot = 0
    slotSearch:
    while (true) {
      // Check if this slot conflicts with any already-placed camp
      for (const p of placed) {
        if (p.slot !== slot) continue
        const pStart = p.camp.camp.start_date < weekStart ? weekStart : p.camp.camp.start_date
        const pEnd = p.camp.camp.end_date > weekEnd ? weekEnd : p.camp.camp.end_date
        // Date ranges overlap?
        if (cStart <= pEnd && cEnd >= pStart) {
          slot++
          continue slotSearch
        }
      }
      break // no conflict at this slot
    }

    slotMap.set(camp.camp.id, slot)
    placed.push({ camp, slot })
  }

  return slotMap
}

/**
 * For a single cell, compute which camps go in which slots.
 * Multi-day camps use their locked slot from computeMultiDaySlots.
 * Single-day camps pack into remaining slots.
 * Returns { visible: [{camp, slot}], overflow: [camp] }.
 */
function assignCellSlots(
  dayCamps: CampWithRelations[],
  multiDaySlots: Map<string, number>,
): { visible: Array<{ camp: CampWithRelations; slot: number }>; overflow: CampWithRelations[] } {
  const visible: Array<{ camp: CampWithRelations; slot: number }> = []
  const overflow: CampWithRelations[] = []
  const occupiedSlots = new Set<number>()

  // Phase 1: place multi-day camps at their locked slots
  for (const c of dayCamps) {
    const lockedSlot = multiDaySlots.get(c.camp.id)
    if (lockedSlot !== undefined) {
      if (lockedSlot < MAX_VISIBLE_SLOTS) {
        visible.push({ camp: c, slot: lockedSlot })
        occupiedSlots.add(lockedSlot)
      } else {
        overflow.push(c)
      }
    }
  }

  // Phase 2: pack single-day camps into remaining slots (sorted by status priority)
  const singleDay = dayCamps
    .filter(c => !multiDaySlots.has(c.camp.id))
    .sort((a, b) => {
      const pa = campStatusPriority(a), pb = campStatusPriority(b)
      if (pa !== pb) return pa - pb
      return a.camp.name.localeCompare(b.camp.name)
    })
  for (const c of singleDay) {
    let placed = false
    for (let s = 0; s < MAX_VISIBLE_SLOTS; s++) {
      if (!occupiedSlots.has(s)) {
        visible.push({ camp: c, slot: s })
        occupiedSlots.add(s)
        placed = true
        break
      }
    }
    if (!placed) overflow.push(c)
  }

  return { visible, overflow }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  camps: CampWithRelations[]
}

export default function CampsCalendar({ camps }: Props) {
  const router = useRouter()
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [popoverDate, setPopoverDate] = useState<string | null>(null)

  const todayStr = toDateStr(today)
  const weeks = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth])

  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
    setPopoverDate(null)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
    setPopoverDate(null)
  }

  function goToday() {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    setPopoverDate(null)
  }

  // Pre-compute multi-day slot assignments per week
  const weekMultiDaySlots = useMemo(() =>
    weeks.map(week => computeMultiDaySlots(week, camps)),
    [weeks, camps]
  )

  // Pre-compute camps per date
  const campsByDate = useMemo(() => {
    const map = new Map<string, CampWithRelations[]>()
    for (const week of weeks) {
      for (const day of week) {
        const ds = toDateStr(day)
        if (!map.has(ds)) map.set(ds, campsOnDate(camps, ds))
      }
    }
    return map
  }, [weeks, camps])

  return (
    <div>
      {/* Month header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={prevMonth} style={arrowBtn}>←</button>
          <span style={{
            fontSize: 18, fontWeight: 700, fontStyle: 'italic',
            color: LV.ink, letterSpacing: '-0.02em',
            minWidth: 180, textAlign: 'center',
          }}>{monthLabel}</span>
          <button onClick={nextMonth} style={arrowBtn}>→</button>
        </div>
        <button
          onClick={goToday}
          style={{
            padding: '4px 12px', borderRadius: 999,
            border: `1px solid ${LV.line}`, background: '#fff',
            fontSize: 11, fontWeight: 700, color: LV.inkMid,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >Today</button>
      </div>

      {/* Calendar container */}
      <div style={{
        border: `1px solid ${LV.line}`,
        borderRadius: 14,
        overflow: 'hidden',
        background: '#fff',
      }}>
        {/* Day-of-week headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
          background: LV.paperDeep,
          borderBottom: `1px solid ${LV.line}`,
        }}>
          {DAY_NAMES.map((d, i) => (
            <div key={d} style={{
              padding: '5px 8px',
              fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: LV.inkMute,
              textAlign: 'center',
              borderRight: i < 6 ? `1px solid ${LV.line}` : 'none',
            }}>{d}</div>
          ))}
        </div>

        {/* Week rows */}
        {weeks.map((week, wi) => {
          const multiDaySlots = weekMultiDaySlots[wi]

          return (
            <div key={wi} style={{
              display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
              borderBottom: wi < 5 ? `1px solid ${LV.line}` : 'none',
              minHeight: SLOT_TOP_OFFSET + MAX_VISIBLE_SLOTS * (SLOT_HEIGHT + SLOT_GAP) + 20,
            }}>
              {week.map((day, di) => {
                const ds = toDateStr(day)
                const isCurrentMonth = day.getMonth() === viewMonth
                const isToday = ds === todayStr
                const dayCamps = campsByDate.get(ds) ?? []

                const { visible, overflow } = assignCellSlots(dayCamps, multiDaySlots)

                return (
                  <div key={di} style={{
                    borderRight: di < 6 ? `1px solid ${LV.line}` : 'none',
                    background: isCurrentMonth ? '#fff' : LV.paperDeep,
                    position: 'relative',
                  }}>
                    {/* Day number — top right */}
                    <div style={{
                      textAlign: 'right',
                      padding: '4px 6px 0 0',
                      height: SLOT_TOP_OFFSET,
                    }}>
                      {isToday ? (
                        <span style={{
                          background: LV.ink, color: '#fff', borderRadius: '50%',
                          width: 22, height: 22, display: 'inline-flex',
                          alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 600,
                        }}>{day.getDate()}</span>
                      ) : (
                        <span style={{
                          fontSize: 12, fontWeight: 400,
                          color: LV.inkMid,
                          opacity: isCurrentMonth ? 1 : 0.35,
                        }}>{day.getDate()}</span>
                      )}
                    </div>

                    {/* Camp bars at fixed slot positions */}
                    <div style={{ opacity: isCurrentMonth ? 1 : 0.5 }}>
                      {visible.map(({ camp: c, slot }) => {
                        const isStart = ds === c.camp.start_date
                        const isEnd = ds === c.camp.end_date
                        const isMultiDay = c.camp.start_date !== c.camp.end_date
                        return (
                          <div
                            key={c.camp.id}
                            style={{
                              position: 'absolute',
                              top: SLOT_TOP_OFFSET + slot * (SLOT_HEIGHT + SLOT_GAP),
                              left: isMultiDay && !isStart ? 0 : 4,
                              right: isMultiDay && !isEnd ? 0 : 4,
                            }}
                          >
                            <CampBar
                              camp={c}
                              dateStr={ds}
                              viewMonth={viewMonth}
                              viewYear={viewYear}
                              onClick={() => router.push(`/camps/${c.camp.id}`)}
                            />
                          </div>
                        )
                      })}
                    </div>

                    {/* +N more pill — anchored at bottom */}
                    {overflow.length > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 4, left: 4, right: 4,
                          textAlign: 'center',
                        }}
                      >
                        <MorePill
                          count={overflow.length}
                          allCamps={dayCamps}
                          dateStr={ds}
                          columnIndex={di}
                          isOpen={popoverDate === ds}
                          onToggle={() => setPopoverDate(prev => prev === ds ? null : ds)}
                          onNavigate={(id) => { setPopoverDate(null); router.push(`/camps/${id}`) }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── +N more pill with popover ───────────────────────────────────────────────

function MorePill({ count, allCamps, dateStr, columnIndex, isOpen, onToggle, onNavigate }: {
  count: number
  allCamps: CampWithRelations[]
  dateStr: string
  columnIndex: number
  isOpen: boolean
  onToggle: () => void
  onNavigate: (campId: string) => void
}) {
  const anchorRight = columnIndex >= 4
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle()
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onToggle()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onToggle])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={onToggle}
        style={{
          fontSize: 9, fontWeight: 700, color: LV.inkMute,
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', padding: '1px 4px',
        }}
      >+{count} more</button>

      {isOpen && (
        <div style={{
          position: 'absolute', bottom: '100%',
          ...(anchorRight ? { right: 0 } : { left: 0 }),
          width: 280, maxHeight: 300, overflowY: 'auto',
          background: '#fff', border: `1px solid ${LV.line}`,
          borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          zIndex: 50, padding: '8px 0',
          marginBottom: 4,
        }}>
          <div style={{
            padding: '4px 12px 8px', fontSize: 10, fontWeight: 700,
            color: LV.inkMute, textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            {new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
          {allCamps.map(c => {
            const status = c.finnStatus?.status ?? 'interested'
            const colors = BAR_COLORS[status]
            const school = c.hostSchool.short_name || c.hostSchool.name
            const campName = getCampDisplayName(c.camp)
            const dateRange = c.camp.start_date === c.camp.end_date
              ? ''
              : ` · ${fmtDateRange(c.camp.start_date, c.camp.end_date)}`

            return (
              <button
                key={c.camp.id}
                onClick={() => onNavigate(c.camp.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '6px 12px',
                  background: 'none', border: 'none', textAlign: 'left',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: 99,
                  background: colors.accent, flexShrink: 0,
                }} />
                <span style={{ fontSize: 12, color: LV.ink, flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{school}</span>
                  <span style={{ color: LV.inkMid }}> · {campName}{dateRange}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Camp bar segment ────────────────────────────────────────────────────────

function CampBar({ camp, dateStr, viewMonth, viewYear, onClick }: {
  camp: CampWithRelations
  dateStr: string
  viewMonth: number
  viewYear: number
  onClick: () => void
}) {
  const status = camp.finnStatus?.status ?? 'interested'
  const colors = BAR_COLORS[status]

  const isStart = dateStr === camp.camp.start_date
  const isEnd = dateStr === camp.camp.end_date

  const startDate = new Date(camp.camp.start_date + 'T12:00:00')
  const endDate = new Date(camp.camp.end_date + 'T12:00:00')
  const startInView = startDate.getMonth() === viewMonth && startDate.getFullYear() === viewYear
  const endInView = endDate.getMonth() === viewMonth && endDate.getFullYear() === viewYear

  const roundLeft = isStart && startInView
  const roundRight = isEnd && endInView

  const dayDate = new Date(dateStr + 'T12:00:00')
  const isFirstDayOfWeek = dayDate.getDay() === 0
  const showLabel = isStart || (isFirstDayOfWeek && camp.camp.start_date < dateStr)

  const showAccent = isStart && startInView

  // Label with school prefix
  const schoolPrefix = camp.hostSchool.short_name || camp.hostSchool.name.slice(0, 8)
  const campShort = getCampDisplayName(camp.camp)
  const fullLabel = `${schoolPrefix}: ${campShort}`
  const segmentDays = isStart
    ? Math.min(7 - dayDate.getDay(), Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1)
    : isFirstDayOfWeek
      ? Math.min(7, Math.round((endDate.getTime() - dayDate.getTime()) / 86400000) + 1)
      : 0
  const approxChars = segmentDays * 12
  const barLabel = approxChars >= fullLabel.length ? fullLabel : schoolPrefix

  // Multi-line tooltip
  const tooltipLines = [
    camp.camp.name,
    camp.hostSchool.short_name || camp.hostSchool.name,
    camp.camp.start_date === camp.camp.end_date
      ? camp.camp.start_date
      : `${camp.camp.start_date} – ${camp.camp.end_date}`,
    camp.camp.location,
    `Status: ${camp.finnStatus?.status ?? 'Not set'}`,
  ].filter(Boolean).join('\n')

  return (
    <div
      onClick={onClick}
      title={tooltipLines}
      style={{
        background: colors.bg,
        color: colors.text,
        fontSize: 11, fontWeight: 500,
        height: SLOT_HEIGHT,
        display: 'flex', alignItems: 'center',
        cursor: 'pointer',
        borderRadius: `${roundLeft ? 4 : 0}px ${roundRight ? 4 : 0}px ${roundRight ? 4 : 0}px ${roundLeft ? 4 : 0}px`,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        position: 'relative',
      }}
    >
      {showAccent && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: 3, background: colors.accent,
          borderRadius: '4px 0 0 4px',
        }} />
      )}
      {showLabel && (
        <span style={{ paddingLeft: showAccent ? 9 : 6, paddingRight: 6 }}>
          {barLabel}
        </span>
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDateRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const sMonth = s.toLocaleDateString('en-US', { month: 'short' })
  const sDay = s.getDate()
  const eMonth = e.toLocaleDateString('en-US', { month: 'short' })
  const eDay = e.getDate()
  if (sMonth === eMonth) return `${sMonth} ${sDay}–${eDay}`
  return `${sMonth} ${sDay} – ${eMonth} ${eDay}`
}

const arrowBtn: React.CSSProperties = {
  background: 'none', border: `1px solid ${LV.line}`,
  borderRadius: 6, width: 28, height: 28,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', fontSize: 14, color: LV.inkMid,
  fontFamily: 'inherit',
}

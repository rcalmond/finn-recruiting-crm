'use client'

import { useState, useMemo } from 'react'
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
  registered: { bg: '#D7F0ED', accent: '#14B8A6', text: '#006A65' },
  attended:   { bg: '#F3F4F6', accent: '#6B7280', text: '#374151' },
  declined:   { bg: '#FEE2E2', accent: '#EF4444', text: '#991B1B' },
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  camps: CampWithRelations[]
}

export default function CampsCalendar({ camps }: Props) {
  const router = useRouter()
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const todayStr = toDateStr(today)
  const weeks = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth])

  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  function goToday() {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
  }

  const campsByDate = useMemo(() => {
    const map = new Map<string, CampWithRelations[]>()
    for (const week of weeks) {
      for (const day of week) {
        const ds = toDateStr(day)
        map.set(ds, campsOnDate(camps, ds))
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
        {weeks.map((week, wi) => (
          <div key={wi} style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            borderBottom: wi < 5 ? `1px solid ${LV.line}` : 'none',
            minHeight: 100,
          }}>
            {week.map((day, di) => {
              const ds = toDateStr(day)
              const isCurrentMonth = day.getMonth() === viewMonth
              const isToday = ds === todayStr
              const dayCamps = campsByDate.get(ds) ?? []

              return (
                <div key={di} style={{
                  padding: '4px 4px 8px',
                  borderRight: di < 6 ? `1px solid ${LV.line}` : 'none',
                  background: isCurrentMonth ? '#fff' : LV.paperDeep,
                }}>
                  {/* Day number — top right */}
                  <div style={{
                    textAlign: 'right',
                    padding: '2px 6px 0 0',
                    marginBottom: 4,
                    height: 22,
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

                  {/* Camp bars — start at consistent vertical rail */}
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 2,
                    opacity: isCurrentMonth ? 1 : 0.5,
                  }}>
                    {dayCamps.map(c => (
                      <CampBar
                        key={c.camp.id}
                        camp={c}
                        dateStr={ds}
                        viewMonth={viewMonth}
                        viewYear={viewYear}
                        onClick={() => router.push(`/camps/${c.camp.id}`)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
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

  // Show label on the leftmost day of each week-segment
  const dayDate = new Date(dateStr + 'T12:00:00')
  const isFirstDayOfWeek = dayDate.getDay() === 0
  const showLabel = isStart || (isFirstDayOfWeek && camp.camp.start_date < dateStr)

  // Accent stripe only on the camp's very first day (not continuation segments)
  const showAccent = isStart && startInView

  const displayName = getCampDisplayName(camp.camp)

  return (
    <div
      onClick={onClick}
      title={camp.camp.name}
      style={{
        background: colors.bg,
        color: colors.text,
        fontSize: 11, fontWeight: 500,
        height: 22,
        display: 'flex', alignItems: 'center',
        cursor: 'pointer',
        borderRadius: `${roundLeft ? 4 : 0}px ${roundRight ? 4 : 0}px ${roundRight ? 4 : 0}px ${roundLeft ? 4 : 0}px`,
        marginLeft: roundLeft ? 0 : -4,
        marginRight: roundRight ? 0 : -4,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        position: 'relative',
      }}
    >
      {/* Left accent stripe on camp's first day only */}
      {showAccent && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: 3, background: colors.accent,
          borderRadius: '4px 0 0 4px',
        }} />
      )}
      {showLabel && (
        <span style={{ paddingLeft: showAccent ? 9 : 6, paddingRight: 6 }}>
          {displayName}
        </span>
      )}
    </div>
  )
}

// ─── Shared styles ───────────────────────────────────────────────────────────

const arrowBtn: React.CSSProperties = {
  background: 'none', border: `1px solid ${LV.line}`,
  borderRadius: 6, width: 28, height: 28,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', fontSize: 14, color: LV.inkMid,
  fontFamily: 'inherit',
}

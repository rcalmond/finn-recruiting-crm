'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { CampWithRelations, CampFinnStatusValue, Category, CalendarEvent, CalendarEventKind } from '@/lib/types'
import { CALENDAR_EVENT_KIND_META, CALENDAR_EVENT_STATUS_META } from '@/lib/types'
import { useCamps, useSchools, useCalendarEvents } from '@/hooks/useRealtimeData'
import { sortCampsChronological, classifyCampTimeframe } from '@/lib/camps'
import { todayStr } from '@/lib/utils'
import AddCampModal from './AddCampModal'
import EventModal from './EventModal'
import CampsCalendar from './CampsCalendar'

// ─── Design tokens ───────────────────────────────────────────────────────────

const LV = {
  paper:    '#F6F1E8',
  paperDeep:'#EFE8D8',
  ink:      '#0E0E0E',
  inkMid:   '#4A4A4A',
  inkLo:    '#7A7570',
  inkMute:  '#A8A39B',
  line:     '#E2DBC9',
  line2:    '#D3CAB3',
  red:      '#C8102E',
  tealDeep: '#006A65',
  tealSoft: '#D7F0ED',
}

const TIER_STYLE: Record<Category, { bg: string; color: string }> = {
  A: { bg: '#FEE2E2', color: '#991B1B' },
  B: { bg: '#DBEAFE', color: '#1E40AF' },
  C: { bg: '#F3F4F6', color: '#374151' },
  Nope: { bg: '#E5E7EB', color: '#6B7280' },
}

const STATUS_STYLE: Record<CampFinnStatusValue, { bg: string; color: string }> = {
  interested: { bg: '#DBEAFE', color: '#1E40AF' },
  targeted:   { bg: '#FEF3C7', color: '#92400E' },
  registered: { bg: '#D7F0ED', color: '#006A65' },
  attended:   { bg: '#F3F4F6', color: '#374151' },
  declined:   { bg: '#FEE2E2', color: '#991B1B' },
}

type TimeframeFilter = 'upcoming' | 'past' | 'all'
type StatusFilter = CampFinnStatusValue | 'all'
type TierFilter = 'A' | 'B' | 'C' | 'all'

// ─── Component ───────────────────────────────────────────────────────────────

export default function CampsClient({ user }: { user: User }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { schools } = useSchools()
  const { camps, loading } = useCamps(schools)
  const { events, insertEvent, updateEvent, deleteEvent } = useCalendarEvents()
  const today = todayStr()

  // Events management modal ('add' = new, an event = edit)
  const [eventModal, setEventModal] = useState<CalendarEvent | 'add' | null>(null)

  // ── URL-backed state ────────────────────────────────────────────────────────
  const pushParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k); else params.set(k, v)
    }
    const q = params.toString()
    router.push(q ? `${pathname}?${q}` : pathname)
  }, [router, pathname, searchParams])

  const viewMode = (searchParams.get('view') === 'calendar' ? 'calendar' : 'list') as 'list' | 'calendar'
  const timeframe = (searchParams.get('timeframe') ?? 'upcoming') as TimeframeFilter
  const statusFilter = (searchParams.get('status') ?? 'all') as StatusFilter
  const tierFilter = (searchParams.get('tier') ?? 'all') as TierFilter

  const setViewMode = useCallback((v: 'list' | 'calendar') => { pushParams({ view: v === 'list' ? null : v }) }, [pushParams])
  const setTimeframe = useCallback((v: TimeframeFilter) => { pushParams({ timeframe: v === 'upcoming' ? null : v }) }, [pushParams])
  const setStatusFilter = useCallback((v: StatusFilter) => { pushParams({ status: v === 'all' ? null : v }) }, [pushParams])
  const setTierFilter = useCallback((v: TierFilter) => { pushParams({ tier: v === 'all' ? null : v }) }, [pushParams])

  // Calendar month: URL-backed as ?month=YYYY-MM (omit when current month)
  const nowDate = new Date()
  const defaultMonth = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}`
  const monthParam = searchParams.get('month') ?? defaultMonth
  const calYear = parseInt(monthParam.split('-')[0]) || nowDate.getFullYear()
  const calMonth = (parseInt(monthParam.split('-')[1]) || nowDate.getMonth() + 1) - 1 // 0-indexed
  const setCalMonth = useCallback((year: number, month: number) => {
    const key = `${year}-${String(month + 1).padStart(2, '0')}`
    pushParams({ month: key === defaultMonth ? null : key })
  }, [pushParams, defaultMonth])

  const [showAddModal, setShowAddModal] = useState(false)

  // Exclude Nope schools from all views (defense in depth)
  const activeCamps = useMemo(() =>
    camps.filter(c => c.hostSchool.category !== 'Nope'),
  [camps])

  // Filtered camps for list view (timeframe + status + tier)
  const filtered = useMemo(() => {
    let list = sortCampsChronological(activeCamps)

    if (timeframe !== 'all') {
      list = list.filter(c => {
        const tf = classifyCampTimeframe(c.camp, today)
        if (timeframe === 'upcoming') return tf === 'upcoming' || tf === 'ongoing'
        return tf === 'past'
      })
    }

    if (statusFilter !== 'all') {
      list = list.filter(c => c.finnStatus?.status === statusFilter)
    }

    if (tierFilter !== 'all') {
      list = list.filter(c => c.hostSchool.category === tierFilter)
    }

    return list
  }, [activeCamps, today, timeframe, statusFilter, tierFilter])

  // Filtered camps for calendar view (status + tier only, no timeframe)
  const calendarCamps = useMemo(() => {
    let list = activeCamps

    if (statusFilter !== 'all') {
      list = list.filter(c => c.finnStatus?.status === statusFilter)
    }

    if (tierFilter !== 'all') {
      list = list.filter(c => c.hostSchool.category === tierFilter)
    }

    return list
  }, [activeCamps, statusFilter, tierFilter])

  if (loading) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: LV.inkLo, fontSize: 14,
      }}>Loading...</div>
    )
  }

  return (
    <div style={{
      maxWidth: 960, margin: '0 auto',
      padding: '32px clamp(20px, 4vw, 40px)',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <h1 style={{
            margin: 0, fontSize: 28, fontWeight: 700,
            letterSpacing: '-0.03em', color: LV.ink, fontStyle: 'italic',
          }}>Camps.</h1>

          {/* View toggle — desktop only */}
          <div className="hidden md:inline-flex" style={{ gap: 2, alignItems: 'center' }}>
            {(['list', 'calendar'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '5px 12px', borderRadius: 999,
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 12, fontWeight: viewMode === mode ? 700 : 500,
                  background: viewMode === mode ? LV.ink : 'transparent',
                  color: viewMode === mode ? '#fff' : LV.inkMid,
                  textTransform: 'capitalize',
                }}
              >{mode}</button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          style={{
            padding: '8px 18px', background: LV.red, color: '#fff',
            border: 'none', borderRadius: 999,
            fontSize: 12, fontWeight: 800, cursor: 'pointer',
            fontFamily: 'inherit', letterSpacing: -0.1,
          }}
        >Add camp</button>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28,
      }}>
        {/* Timeframe filter — list view only */}
        {viewMode === 'list' && (
          <FilterGroup
            label="Time"
            value={timeframe}
            options={[
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'past', label: 'Past' },
              { value: 'all', label: 'All' },
            ]}
            onChange={v => setTimeframe(v as TimeframeFilter)}
          />
        )}
        <FilterGroup
          label="Status"
          value={statusFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'interested', label: 'Interested' },
            { value: 'targeted', label: 'Targeted' },
            { value: 'registered', label: 'Registered' },
            { value: 'attended', label: 'Attended' },
            { value: 'declined', label: 'Declined' },
          ]}
          onChange={v => setStatusFilter(v as StatusFilter)}
        />
        <FilterGroup
          label="Tier"
          value={tierFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'A', label: 'A' },
            { value: 'B', label: 'B' },
            { value: 'C', label: 'C' },
          ]}
          onChange={v => setTierFilter(v as TierFilter)}
        />
      </div>

      {/* Calendar view — desktop only */}
      <div className="hidden md:block">
        {viewMode === 'calendar' && (
          <CampsCalendar camps={calendarCamps} viewYear={calYear} viewMonth={calMonth} onMonthChange={setCalMonth} />
        )}
      </div>

      {/* List view (always on mobile, conditional on desktop) */}
      {(viewMode === 'list' || true) && (
        <div className={viewMode === 'calendar' ? 'block md:hidden' : ''}>
          {/* Empty state */}
          {filtered.length === 0 && (
            <div style={{
              padding: '48px 24px', textAlign: 'center',
              background: '#fff', border: `1px solid ${LV.line}`, borderRadius: 14,
              color: LV.inkLo, fontSize: 14,
            }}>
              {camps.length === 0
                ? 'Camps and showcases will appear here once you add them.'
                : 'No camps match these filters. Try adjusting or clearing them.'}
            </div>
          )}

          {/* Table (desktop) */}
          {filtered.length > 0 && (
            <>
              <div className={viewMode === 'calendar' ? 'hidden' : 'hidden md:block'}>
                <div style={{
                  background: '#fff', border: `1px solid ${LV.line}`,
                  borderRadius: 14, overflow: 'hidden',
                }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 140px 120px 80px 100px',
                    padding: '10px 20px',
                    borderBottom: `1px solid ${LV.line}`,
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: LV.inkMute,
                  }}>
                    <span>Camp</span>
                    <span>Host</span>
                    <span>Dates</span>
                    <span>Schools</span>
                    <span>Status</span>
                  </div>
                  {filtered.map(c => (
                    <CampRow key={c.camp.id} camp={c} onClick={() => router.push(`/camps/${c.camp.id}`)} />
                  ))}
                </div>
              </div>

              {/* Mobile cards (always visible on mobile) */}
              <div className="block md:hidden">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {filtered.map(c => (
                    <CampCard key={c.camp.id} camp={c} onClick={() => router.push(`/camps/${c.camp.id}`)} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Events section (showcases, tournaments, outreach moments) ──────── */}
      <section style={{ marginTop: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: LV.inkMute, marginBottom: 4 }}>Also on the calendar</div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: LV.ink, fontStyle: 'italic' }}>Events.</h2>
          </div>
          <button onClick={() => setEventModal('add')} style={{
            padding: '8px 18px', background: '#2D6A4F', color: '#fff', border: 'none', borderRadius: 999,
            fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: -0.1,
          }}>Add event</button>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: LV.inkLo, lineHeight: 1.5, maxWidth: 560 }}>
          Showcases and tournaments Finn attends, plus outreach send-moments (reel drops, season updates). These merge with camps on the Get Seen timeline.
        </p>

        {events.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center', background: '#fff', border: `1px dashed ${LV.line}`, borderRadius: 14, color: LV.inkLo, fontSize: 14 }}>
            No events yet. Add a showcase, tournament, or outreach moment.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...events].sort((a, b) => a.start_date.localeCompare(b.start_date)).map(ev => (
              <EventRow key={ev.id} event={ev} today={today} onClick={() => setEventModal(ev)} />
            ))}
          </div>
        )}
      </section>

      {/* Add camp modal */}
      {showAddModal && (
        <AddCampModal
          schools={schools}
          onClose={() => setShowAddModal(false)}
          onCreated={(id) => { setShowAddModal(false); router.push(`/camps/${id}`) }}
        />
      )}

      {/* Event add/edit modal */}
      {eventModal !== null && (
        <EventModal
          event={eventModal === 'add' ? null : eventModal}
          schools={schools}
          onSave={async (input, schoolIds) => {
            if (eventModal === 'add') return insertEvent(input, schoolIds)
            return updateEvent((eventModal as CalendarEvent).id, input, schoolIds)
          }}
          onDelete={eventModal !== 'add' ? async () => deleteEvent((eventModal as CalendarEvent).id) : undefined}
          onClose={() => setEventModal(null)}
        />
      )}
    </div>
  )
}

// ─── Event row ───────────────────────────────────────────────────────────────

function EventRow({ event, today, onClick }: { event: CalendarEvent; today: string; onClick: () => void }) {
  const kindMeta = CALENDAR_EVENT_KIND_META[event.kind]
  const statusMeta = CALENDAR_EVENT_STATUS_META[event.status]
  const isOutreach = event.kind === 'outreach_moment'
  const KIND_BADGE: Record<CalendarEventKind, { bg: string; color: string }> = {
    showcase:        { bg: '#DBEAFE', color: '#1E40AF' },
    tournament:      { bg: '#E0E7FF', color: '#3730A3' },
    outreach_moment: { bg: '#FAF0EA', color: '#B5502F' },
    other:           { bg: '#F3F4F6', color: '#374151' },
  }
  const kb = KIND_BADGE[event.kind]
  const daysOut = Math.round((new Date(event.start_date + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86400000)

  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
      background: '#fff', border: `1px solid ${LV.line}`, borderRadius: 12, cursor: 'pointer',
    }}>
      <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 4, background: kb.bg, color: kb.color, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0, whiteSpace: 'nowrap' }}>
        {isOutreach ? '↗ ' : ''}{kindMeta.label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 650, color: LV.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.name}</div>
        <div style={{ fontSize: 12, color: LV.inkLo, marginTop: 1 }}>
          {formatDateRange(event.start_date, event.end_date ?? event.start_date)}
          {!isOutreach && event.location ? ` · ${event.location}` : ''}
          {daysOut >= 0 ? ` · ${daysOut === 0 ? 'today' : daysOut === 1 ? 'tomorrow' : `${daysOut}d out`}` : ''}
        </div>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: statusMeta.bg, color: statusMeta.color, flexShrink: 0 }}>{statusMeta.label}</span>
    </div>
  )
}

// ─── Filter group ────────────────────────────────────────────────────────────

function FilterGroup({ label, value, options, onChange }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: LV.inkMute, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 2 }}>
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '4px 10px', borderRadius: 999,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 11, fontWeight: value === opt.value ? 700 : 500,
              background: value === opt.value ? LV.ink : 'transparent',
              color: value === opt.value ? '#fff' : LV.inkMid,
            }}
          >{opt.label}</button>
        ))}
      </div>
    </div>
  )
}

// ─── Desktop row ─────────────────────────────────────────────────────────────

function CampRow({ camp, onClick }: { camp: CampWithRelations; onClick: () => void }) {
  const hostName = camp.hostSchool.short_name || camp.hostSchool.name
  const tier = TIER_STYLE[camp.hostSchool.category] ?? TIER_STYLE.C
  const status = camp.finnStatus?.status ?? 'interested'
  const statusStyle = STATUS_STYLE[status]

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 140px 120px 80px 100px',
        padding: '12px 20px',
        borderBottom: `1px solid ${LV.line}`,
        cursor: 'pointer',
        fontSize: 13,
        alignItems: 'center',
      }}
    >
      {/* Camp name */}
      <span style={{ fontWeight: 600, color: LV.ink, letterSpacing: '-0.01em' }}>
        {camp.camp.name}
      </span>

      {/* Host school + tier */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
          background: tier.bg, color: tier.color,
        }}>{camp.hostSchool.category}</span>
        <span style={{ fontSize: 12, color: LV.inkMid, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {hostName}
        </span>
      </div>

      {/* Date range */}
      <span style={{ fontSize: 12, color: LV.inkMid }}>
        {formatDateRange(camp.camp.start_date, camp.camp.end_date)}
      </span>

      {/* Attendee count */}
      <span style={{ fontSize: 12, color: LV.inkLo, textAlign: 'center' }}>
        {camp.schoolAttendees.length || '—'}
      </span>

      {/* Finn's status */}
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
        background: statusStyle.bg, color: statusStyle.color,
        textTransform: 'capitalize', display: 'inline-block', width: 'fit-content',
      }}>{status}</span>
    </div>
  )
}

// ─── Mobile card ─────────────────────────────────────────────────────────────

function CampCard({ camp, onClick }: { camp: CampWithRelations; onClick: () => void }) {
  const hostName = camp.hostSchool.short_name || camp.hostSchool.name
  const tier = TIER_STYLE[camp.hostSchool.category] ?? TIER_STYLE.C
  const status = camp.finnStatus?.status ?? 'interested'
  const statusStyle = STATUS_STYLE[status]

  return (
    <div
      onClick={onClick}
      style={{
        padding: '14px 18px', borderRadius: 12,
        background: '#fff', border: `1px solid ${LV.line}`,
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 650, color: LV.ink }}>{camp.camp.name}</span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
          background: statusStyle.bg, color: statusStyle.color,
          textTransform: 'capitalize', flexShrink: 0,
        }}>{status}</span>
      </div>
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: LV.inkMid }}>
        <span style={{
          fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
          background: tier.bg, color: tier.color,
        }}>{camp.hostSchool.category}</span>
        <span>{hostName}</span>
        <span style={{ color: LV.inkMute }}>·</span>
        <span>{formatDateRange(camp.camp.start_date, camp.camp.end_date)}</span>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const sMonth = s.toLocaleDateString('en-US', { month: 'short' })
  const sDay = s.getDate()
  const eMonth = e.toLocaleDateString('en-US', { month: 'short' })
  const eDay = e.getDate()

  if (start === end) return `${sMonth} ${sDay}`
  if (sMonth === eMonth) return `${sMonth} ${sDay}–${eDay}`
  return `${sMonth} ${sDay} – ${eMonth} ${eDay}`
}

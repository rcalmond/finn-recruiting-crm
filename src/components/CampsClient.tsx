'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { CampWithRelations, CampFinnStatusValue, Category, CalendarEvent, CalendarEventKind } from '@/lib/types'
import { CALENDAR_EVENT_KIND_META, CALENDAR_EVENT_STATUS_META } from '@/lib/types'
import { useCamps, useSchools, useCalendarEvents } from '@/hooks/useRealtimeData'
import { sortCampsChronological, classifyCampTimeframe } from '@/lib/camps'
import { todayStr } from '@/lib/utils'
import AddCampModal from './AddCampModal'
import EventModal from './EventModal'
import MergedTimeline, { type UpcomingCampItem, type TimelineEventItem } from './get-seen/MergedTimeline'

const LV = {
  paper:   '#F6F1E8',
  white:   '#fff',
  ink:     '#0E0E0E',
  inkMid:  '#4A4A4A',
  inkLo:   '#7A7570',
  inkMute: '#A8A39B',
  line:    '#E2DBC9',
  petrol:  '#0E5F6B',   // Get Seen jewel accent — this page is Get Seen's child
  green:   '#2D6A4F',
  rust:    '#B5502F',
}

const TIER_STYLE: Record<Category, { bg: string; color: string }> = {
  A: { bg: '#DCFCE7', color: '#166534' },
  B: { bg: '#DBEAFE', color: '#1E40AF' },
  C: { bg: '#FEF3C7', color: '#92400E' },
  Nope: { bg: '#E5E7EB', color: '#6B7280' },
}
const STATUS_STYLE: Record<CampFinnStatusValue, { bg: string; color: string }> = {
  interested: { bg: '#DBEAFE', color: '#1E40AF' },
  targeted:   { bg: '#FEF3C7', color: '#92400E' },
  registered: { bg: '#D7F0ED', color: '#006A65' },
  attended:   { bg: '#F3F4F6', color: '#374151' },
  declined:   { bg: '#FEE2E2', color: '#991B1B' },
}
const KIND_BADGE: Record<CalendarEventKind, { bg: string; color: string }> = {
  showcase:        { bg: '#DBEAFE', color: '#1E40AF' },
  tournament:      { bg: '#E0E7FF', color: '#3730A3' },
  outreach_moment: { bg: '#FAF0EA', color: '#B5502F' },
  other:           { bg: '#F3F4F6', color: '#374151' },
}
const CAMP_BADGE = { bg: '#D7EFE0', color: '#1B4332' }

// A unified list row is either a camp or an event; `date` drives interleaving.
type ListItem =
  | { kind: 'camp'; date: string; camp: CampWithRelations }
  | { kind: 'event'; date: string; event: CalendarEvent }

const WINDOW_DAYS = 70

export default function CampsClient({ user }: { user: User }) {
  const router = useRouter()
  const { schools } = useSchools()
  const { camps, loading } = useCamps(schools)
  const { events, insertEvent, updateEvent, deleteEvent } = useCalendarEvents()
  const today = todayStr()
  const tenWeeks = new Date(new Date(today + 'T00:00:00').getTime() + WINDOW_DAYS * 86400000).toISOString().split('T')[0]

  const [showAddCamp, setShowAddCamp] = useState(false)
  const [eventModal, setEventModal] = useState<CalendarEvent | 'add' | null>(null)
  const [pastOpen, setPastOpen] = useState(false)

  const activeCamps = useMemo(() => camps.filter(c => c.hostSchool.category !== 'Nope'), [camps])

  // ── Timeline input (10-week window, same rule as Get Seen) ──────────────────
  const timelineCamps: UpcomingCampItem[] = useMemo(() =>
    activeCamps
      .filter(c => c.camp.start_date >= today && c.camp.start_date <= tenWeeks && ['interested', 'targeted', 'registered'].includes(c.finnStatus?.status ?? ''))
      .map(c => ({
        id: c.camp.id, name: c.camp.name, start_date: c.camp.start_date, end_date: c.camp.end_date,
        host_school_short_name: c.hostSchool.short_name, host_school_name: c.hostSchool.name,
        finn_status: c.finnStatus?.status ?? null,
      })),
  [activeCamps, today, tenWeeks])

  const timelineEvents: TimelineEventItem[] = useMemo(() =>
    events
      .filter(e => (e.end_date ?? e.start_date) >= today && e.start_date <= tenWeeks && e.status !== 'skipped')
      .map(e => ({ id: e.id, kind: e.kind, name: e.name, start_date: e.start_date, end_date: e.end_date, location: e.location, status: e.status })),
  [events, today, tenWeeks])

  // ── Up next vs Past & done ──────────────────────────────────────────────────
  const { upNext, past } = useMemo(() => {
    const up: ListItem[] = []
    const done: ListItem[] = []

    for (const c of sortCampsChronological(activeCamps)) {
      const tf = classifyCampTimeframe(c.camp, today)
      const status = c.finnStatus?.status
      const isUpcoming = (tf === 'upcoming' || tf === 'ongoing') && status !== 'declined' && status !== 'attended'
      ;(isUpcoming ? up : done).push({ kind: 'camp', date: c.camp.start_date, camp: c })
    }
    for (const e of events) {
      const upcoming = (e.end_date ?? e.start_date) >= today && e.status !== 'done' && e.status !== 'skipped'
      ;(upcoming ? up : done).push({ kind: 'event', date: e.start_date, event: e })
    }
    up.sort((a, b) => a.date.localeCompare(b.date))
    done.sort((a, b) => b.date.localeCompare(a.date)) // most-recent past first
    return { upNext: up, past: done }
  }, [activeCamps, events, today])

  const onItemClick = () => router.push('/camps')

  if (loading) {
    return <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: LV.inkLo, fontSize: 14 }}>Loading...</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: LV.paper, fontFamily: "'Inter', -apple-system, sans-serif", color: LV.ink, paddingBottom: 80 }}>
      {/* Masthead */}
      <div style={{ padding: '24px clamp(28px, 4vw, 56px) 4px', maxWidth: 900, margin: '0 auto' }}>
        <Link href="/get-seen" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
          color: LV.inkLo, textDecoration: 'none', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5m5-6-6 6 6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Get Seen
        </Link>
        <h1 style={{ margin: 0, fontSize: 'clamp(44px, 6vw, 68px)', fontWeight: 700, letterSpacing: '-0.04em', color: LV.ink, lineHeight: 0.95, fontStyle: 'italic' }}>
          Calendar.
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: 15, color: LV.inkLo, fontWeight: 450, letterSpacing: '-0.01em', maxWidth: 600, lineHeight: 1.5 }}>
          Every camp, showcase, and outreach moment — what&apos;s coming, and where you stand.
        </p>
      </div>

      <div style={{ padding: '20px clamp(28px, 4vw, 56px)', maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* ── Timeline (hero, shared with Get Seen) ─────────────── */}
        <div style={{ background: LV.white, border: `1px solid ${LV.line}`, borderRadius: 14, padding: 'clamp(18px, 2.5vw, 24px)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: LV.petrol, marginBottom: 4 }}>Next 10 weeks</div>
          <MergedTimeline camps={timelineCamps} events={timelineEvents} onItemClick={onItemClick}
            emptyText="Nothing in the next 10 weeks. Add a camp, showcase, or outreach moment below." />
        </div>

        {/* ── Up next ────────────────────────────────────────────── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 'clamp(16px, 2.2vw, 20px)', fontWeight: 700, letterSpacing: '-0.02em', color: LV.ink, fontStyle: 'italic' }}>
              Up next.<span style={{ fontSize: 13, fontWeight: 600, color: LV.inkLo, fontStyle: 'normal', marginLeft: 8 }}>{upNext.length}</span>
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={addPill} onClick={() => setShowAddCamp(true)}>+ Camp</button>
              <button style={addPill} onClick={() => setEventModal('add')}>+ Event</button>
            </div>
          </div>
          {upNext.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: LV.inkMute, fontSize: 13, background: LV.white, borderRadius: 12, border: `1px dashed ${LV.line}` }}>
              Nothing coming up. Add a camp, showcase, or outreach moment.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {upNext.map(item => (
                <UnifiedRow key={item.kind === 'camp' ? `c-${item.camp.camp.id}` : `e-${item.event.id}`} item={item} today={today}
                  onClick={() => item.kind === 'camp' ? router.push(`/camps/${item.camp.camp.id}`) : setEventModal(item.event)} />
              ))}
            </div>
          )}
        </section>

        {/* ── Past & done (collapsed) ────────────────────────────── */}
        {past.length > 0 && (
          <section>
            <button onClick={() => setPastOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
              <h2 style={{ margin: 0, fontSize: 'clamp(16px, 2.2vw, 20px)', fontWeight: 700, letterSpacing: '-0.02em', color: LV.ink, fontStyle: 'italic' }}>Past &amp; done.</h2>
              <span style={{ fontSize: 13, fontWeight: 600, color: LV.inkLo }}>{past.length}</span>
              <span style={{ fontSize: 12, color: LV.inkMute, transform: pastOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>▾</span>
            </button>
            {pastOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {past.map(item => (
                  <UnifiedRow key={item.kind === 'camp' ? `c-${item.camp.camp.id}` : `e-${item.event.id}`} item={item} today={today} dim
                    onClick={() => item.kind === 'camp' ? router.push(`/camps/${item.camp.camp.id}`) : setEventModal(item.event)} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Add camp modal */}
      {showAddCamp && (
        <AddCampModal schools={schools} onClose={() => setShowAddCamp(false)} onCreated={(id) => { setShowAddCamp(false); router.push(`/camps/${id}`) }} />
      )}

      {/* Event add/edit/delete modal */}
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

// ─── Unified row (camp or event) ───────────────────────────────────────────────

function daysOut(start: string, today: string): number {
  return Math.round((new Date(start + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86400000)
}
function daysOutText(d: number): string {
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  return `${d}d out`
}

function UnifiedRow({ item, today, onClick, dim }: { item: ListItem; today: string; onClick: () => void; dim?: boolean }) {
  const badge = item.kind === 'camp' ? { label: 'Camp', ...CAMP_BADGE } : { label: CALENDAR_EVENT_KIND_META[item.event.kind].label, ...KIND_BADGE[item.event.kind] }
  const isOutreach = item.kind === 'event' && item.event.kind === 'outreach_moment'
  const name = item.kind === 'camp' ? item.camp.camp.name : item.event.name
  const start = item.kind === 'camp' ? item.camp.camp.start_date : item.event.start_date
  const end = item.kind === 'camp' ? item.camp.camp.end_date : (item.event.end_date ?? item.event.start_date)
  const dOut = daysOut(start, today)

  // metadata line
  let meta: React.ReactNode
  if (item.kind === 'camp') {
    const c = item.camp
    const tier = TIER_STYLE[c.hostSchool.category] ?? TIER_STYLE.C
    meta = (
      <>
        <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 3, background: tier.bg, color: tier.color, flexShrink: 0 }}>{c.hostSchool.category}</span>
        <span>{c.hostSchool.short_name || c.hostSchool.name}</span>
        <span style={{ color: LV.inkMute }}>·</span>
        <span>{formatDateRange(start, end)}</span>
      </>
    )
  } else {
    meta = (
      <>
        <span>{formatDateRange(start, end)}</span>
        {!isOutreach && item.event.location ? (<><span style={{ color: LV.inkMute }}>·</span><span>{item.event.location}</span></>) : null}
      </>
    )
  }

  // status pill
  let pill: React.ReactNode = null
  if (item.kind === 'camp') {
    const status = item.camp.finnStatus?.status ?? 'interested'
    const st = STATUS_STYLE[status]
    pill = <span style={{ ...pillStyle, background: st.bg, color: st.color, textTransform: 'capitalize' }}>{status}</span>
  } else {
    const sm = CALENDAR_EVENT_STATUS_META[item.event.status]
    pill = <span style={{ ...pillStyle, background: sm.bg, color: sm.color }}>{sm.label}</span>
  }

  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: LV.white, border: `1px solid ${LV.line}`, borderRadius: 10, cursor: 'pointer', opacity: dim ? 0.72 : 1 }}>
      <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 4, background: badge.bg, color: badge.color, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0, whiteSpace: 'nowrap' }}>
        {isOutreach ? '↗ ' : ''}{badge.label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 650, color: LV.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 11.5, color: LV.inkLo, flexWrap: 'wrap' }}>{meta}</div>
      </div>
      {dOut >= 0 && <span style={{ fontSize: 11, color: dOut <= 3 ? LV.petrol : LV.inkMute, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>{daysOutText(dOut)}</span>}
      {pill}
    </div>
  )
}

const pillStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap' }
const addPill: React.CSSProperties = { padding: '7px 15px', background: LV.petrol, color: '#fff', border: 'none', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' }

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

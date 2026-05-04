'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { CampWithRelations, CampFinnStatusValue } from '@/lib/types'
import { useCamps, useSchools } from '@/hooks/useRealtimeData'
import { sortCampsChronological, classifyCampTimeframe } from '@/lib/camps'
import { todayStr } from '@/lib/utils'
import AddCampModal from './AddCampModal'

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

const TIER_STYLE: Record<string, { bg: string; color: string }> = {
  A: { bg: '#FEE2E2', color: '#991B1B' },
  B: { bg: '#DBEAFE', color: '#1E40AF' },
  C: { bg: '#F3F4F6', color: '#374151' },
}

const STATUS_STYLE: Record<CampFinnStatusValue, { bg: string; color: string }> = {
  interested: { bg: '#DBEAFE', color: '#1E40AF' },
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
  const { camps, loading } = useCamps()
  const { schools } = useSchools()
  const today = todayStr()

  const [timeframe, setTimeframe] = useState<TimeframeFilter>('upcoming')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [tierFilter, setTierFilter] = useState<TierFilter>('all')
  const [showAddModal, setShowAddModal] = useState(false)

  const filtered = useMemo(() => {
    let list = sortCampsChronological(camps)

    // Timeframe
    if (timeframe !== 'all') {
      list = list.filter(c => {
        const tf = classifyCampTimeframe(c.camp, today)
        if (timeframe === 'upcoming') return tf === 'upcoming' || tf === 'ongoing'
        return tf === 'past'
      })
    }

    // Finn's status
    if (statusFilter !== 'all') {
      list = list.filter(c => c.finnStatus?.status === statusFilter)
    }

    // Host tier
    if (tierFilter !== 'all') {
      list = list.filter(c => c.hostSchool.category === tierFilter)
    }

    return list
  }, [camps, today, timeframe, statusFilter, tierFilter])

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
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <h1 style={{
          margin: 0, fontSize: 28, fontWeight: 700,
          letterSpacing: '-0.03em', color: LV.ink, fontStyle: 'italic',
        }}>Camps.</h1>
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
        display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20,
      }}>
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
        <FilterGroup
          label="Status"
          value={statusFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'interested', label: 'Interested' },
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

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{
          padding: '48px 24px', textAlign: 'center',
          background: '#fff', border: `1px solid ${LV.line}`, borderRadius: 14,
          color: LV.inkLo, fontSize: 14,
        }}>
          {camps.length === 0
            ? 'No camps yet. Add your first camp.'
            : 'No camps match the current filters.'}
        </div>
      )}

      {/* Table (desktop) */}
      {filtered.length > 0 && (
        <>
          <div className="hidden md:block">
            <div style={{
              background: '#fff', border: `1px solid ${LV.line}`,
              borderRadius: 14, overflow: 'hidden',
            }}>
              {/* Header row */}
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

              {/* Rows */}
              {filtered.map(c => (
                <CampRow key={c.camp.id} camp={c} onClick={() => router.push(`/camps/${c.camp.id}`)} />
              ))}
            </div>
          </div>

          {/* Mobile cards */}
          <div className="block md:hidden">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(c => (
                <CampCard key={c.camp.id} camp={c} onClick={() => router.push(`/camps/${c.camp.id}`)} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Add camp modal */}
      {showAddModal && (
        <AddCampModal
          schools={schools}
          onClose={() => setShowAddModal(false)}
          onCreated={(id) => { setShowAddModal(false); router.push(`/camps/${id}`) }}
        />
      )}
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

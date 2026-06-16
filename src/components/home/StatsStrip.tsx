'use client'

import { useMemo } from 'react'
import type { School, ContactLogEntry, CampWithRelations } from '@/lib/types'
import { isAwaitingReply, isTargetTier } from '@/lib/awaiting-reply'

const SD = {
  paper: '#F6F1E8', paperDeep: '#EFE8D8',
  ink: '#0E0E0E', inkMid: '#4A4A4A', inkLo: '#7A7570', inkMute: '#A8A39B',
  line: '#E2DBC9', teal: '#00B2A9', tealDeep: '#006A65', tealSoft: '#D7F0ED',
  red: '#C8102E', redSoft: '#FCE4E8',
}

const PIPELINE_COLORS: Record<string, string> = {
  'Not Contacted': '#E5E7EB',
  'Intro Sent': '#DBEAFE',
  'Ongoing Conversation': '#D7F0ED',
  'Visit Scheduled': '#FEF3C7',
  'Offer': '#DCFCE7',
}

const PIPELINE_TEXT_COLORS: Record<string, string> = {
  'Not Contacted': '#374151',
  'Intro Sent': '#1E3A5F',
  'Ongoing Conversation': '#065F5B',
  'Visit Scheduled': '#78350F',
  'Offer': '#166534',
}

const LABEL = {
  fontSize: 10,
  fontWeight: 700 as const,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  color: SD.inkMute,
  margin: 0,
  lineHeight: 1.3,
}

const VALUE = {
  fontSize: 14,
  fontWeight: 700 as const,
  color: SD.ink,
  margin: 0,
  lineHeight: 1.3,
}

interface Props {
  schools: School[]
  contactLog: ContactLogEntry[]
  camps: CampWithRelations[]
}

export default function StatsStrip({ schools, contactLog, camps }: Props) {
  // 1. Active schools by tier
  const activeByTier = useMemo(() => {
    const active = schools.filter(s => isTargetTier(s) && s.status !== 'Inactive')
    const a = active.filter(s => s.category === 'A').length
    const b = active.filter(s => s.category === 'B').length
    const c = active.filter(s => s.category === 'C').length
    return { total: active.length, a, b, c }
  }, [schools])

  // 2. Pipeline phase distribution
  const pipelineSegments = useMemo(() => {
    const active = schools.filter(s => isTargetTier(s) && s.status !== 'Inactive')
    const total = active.length
    if (total === 0) return []
    const statuses = ['Not Contacted', 'Intro Sent', 'Ongoing Conversation', 'Visit Scheduled', 'Offer'] as const
    return statuses
      .map(status => {
        const count = active.filter(s => s.status === status).length
        return { status, count, pct: (count / total) * 100 }
      })
      .filter(s => s.count > 0)
  }, [schools])

  // 3. Camps
  const campStats = useMemo(() => {
    const now = new Date()
    const sixtyDaysLater = new Date(now)
    sixtyDaysLater.setDate(sixtyDaysLater.getDate() + 60)
    const todayStr = now.toISOString().slice(0, 10)
    const futureStr = sixtyDaysLater.toISOString().slice(0, 10)

    const registered = camps.filter(c =>
      c.finnStatus?.status === 'registered' &&
      isTargetTier(c.hostSchool)
    ).length

    const upcoming = camps.filter(c =>
      c.camp.start_date >= todayStr &&
      c.camp.start_date <= futureStr &&
      isTargetTier(c.hostSchool) &&
      (c.finnStatus?.status === 'targeted' || c.finnStatus?.status === 'registered')
    ).length

    return { registered, upcoming }
  }, [camps])

  // 4. Emails this month
  const emailStats = useMemo(() => {
    const mtFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' })
    const nowYM = mtFmt.format(new Date()).slice(0, 7) // YYYY-MM
    const thisMonth = contactLog.filter(e => {
      const ps = e.parse_status
      if (ps !== 'full' && ps !== 'partial') return false
      const entryYM = mtFmt.format(new Date(e.sent_at)).slice(0, 7)
      return entryYM === nowYM
    })
    const inbound = thisMonth.filter(e => e.direction === 'Inbound').length
    const outbound = thisMonth.filter(e => e.direction === 'Outbound').length
    return { total: thisMonth.length, inbound, outbound }
  }, [contactLog])

  // 5. Response rate
  const responseRate = useMemo(() => {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const sixMonthsAgoStr = sixMonthsAgo.toISOString()

    const activeSchoolIds = new Set(
      schools
        .filter(s => isTargetTier(s) && s.status !== 'Inactive')
        .map(s => s.id)
    )

    const outboundRows = contactLog.filter(e =>
      e.direction === 'Outbound' &&
      (e.parse_status === 'full' || e.parse_status === 'partial') &&
      activeSchoolIds.has(e.school_id) &&
      e.sent_at >= sixMonthsAgoStr
    )

    if (outboundRows.length === 0) return null

    let responded = 0
    for (const out of outboundRows) {
      const thirtyDaysLater = new Date(new Date(out.sent_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const hasReply = contactLog.some(e =>
        e.direction === 'Inbound' &&
        e.school_id === out.school_id &&
        e.sent_at > out.sent_at &&
        e.sent_at <= thirtyDaysLater
      )
      if (hasReply) responded++
    }

    return Math.round((responded / outboundRows.length) * 100)
  }, [contactLog, schools])

  // 6. Awaiting Finn
  const awaitingCount = useMemo(() => {
    const activeSchoolIds = new Set(
      schools
        .filter(s => isTargetTier(s) && s.status !== 'Inactive')
        .map(s => s.id)
    )

    const nowIso = new Date().toISOString()

    return contactLog.filter(entry => {
      if (entry.direction !== 'Inbound') return false
      if (!activeSchoolIds.has(entry.school_id)) return false
      if (entry.authored_by !== 'coach_personal' && entry.authored_by !== 'coach_via_platform') return false
      if (entry.intent !== 'requires_reply' && entry.intent !== 'requires_action') return false
      if (entry.handled_at) return false
      if (entry.dismissed_at) return false
      if (entry.snoozed_until && entry.snoozed_until > nowIso) return false

      const schoolEntries = contactLog.filter(e => e.school_id === entry.school_id)
      return isAwaitingReply(entry, schoolEntries)
    }).length
  }, [contactLog, schools])

  return (
    <div>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        alignItems: 'flex-start',
      }}>
        {/* 1. Active Schools */}
        <div style={{ minWidth: 120 }}>
          <p style={LABEL}>Active Schools by Tier</p>
          <p style={VALUE}>
            {activeByTier.total} active
            <span style={{ fontSize: 12, fontWeight: 400, color: SD.inkLo, marginLeft: 6 }}>
              (A: {activeByTier.a} · B: {activeByTier.b} · C: {activeByTier.c})
            </span>
          </p>
        </div>

        {/* 3. Camps */}
        <div style={{ minWidth: 120 }}>
          <p style={LABEL}>Camps</p>
          <p style={VALUE}>
            {campStats.registered} registered · {campStats.upcoming} upcoming
          </p>
        </div>

        {/* 4. Emails This Month */}
        <div style={{ minWidth: 120 }}>
          <p style={LABEL}>Emails This Month</p>
          <p style={VALUE}>
            {emailStats.total} emails
            <span style={{ fontSize: 12, fontWeight: 400, color: SD.inkLo, marginLeft: 6 }}>
              ({emailStats.inbound} in · {emailStats.outbound} out)
            </span>
          </p>
        </div>

        {/* 5. Response Rate */}
        <div style={{ minWidth: 100 }}>
          <p style={LABEL}>Response Rate</p>
          <p style={VALUE}>
            {responseRate !== null ? `${responseRate}%` : '—'}
          </p>
        </div>

        {/* 6. Awaiting Finn */}
        <div style={{ minWidth: 100 }}>
          <p style={LABEL}>Awaiting Finn</p>
          <p style={{ ...VALUE, color: awaitingCount > 0 ? SD.red : SD.ink }}>
            {awaitingCount} coaches awaiting reply
          </p>
        </div>
      </div>

      {/* 2. Pipeline Phase Distribution Bar */}
      <div style={{
        marginTop: 12,
        width: '100%',
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
        display: 'flex',
        backgroundColor: SD.line,
      }}>
        {pipelineSegments.map(seg => (
          <div
            key={seg.status}
            title={`${seg.status}: ${seg.count} (${Math.round(seg.pct)}%)`}
            style={{
              width: `${seg.pct}%`,
              height: '100%',
              backgroundColor: PIPELINE_COLORS[seg.status],
            }}
          />
        ))}
      </div>
      {pipelineSegments.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          marginTop: 4,
        }}>
          {pipelineSegments.map(seg => (
            <span key={seg.status} style={{
              fontSize: 10,
              fontWeight: 600,
              color: PIPELINE_TEXT_COLORS[seg.status] || SD.inkMid,
            }}>
              {seg.status}: {seg.count}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import type { School, ContactLogEntry } from '@/lib/types'
import { useSchools, useContactLog, useActionItems } from '@/hooks/useRealtimeData'
import { createClient } from '@/lib/supabase/client'
import { todayStr, daysBetween } from '@/lib/utils'
import { getTactical3, rebuildSelectedItems, type TacticalItem } from '@/lib/today-scoring'
import { mountainTimeToday, mountainDayStartUTC } from '@/lib/today-selection'
import { isAwaitingReply } from '@/lib/awaiting-reply'
import { getStrategicPrompts, getCurrentWeekStart, type StrategicPrompt } from '@/lib/strategic-prompts'
import { getPipelineSchools } from '@/lib/pipeline-rail'
import DraftModal from './DraftModal'
import TacticalSection from './today/TacticalSection'
import StrategicSection from './today/StrategicSection'
import BatchReelModal from './today/BatchReelModal'
import HandledSection from './today/HandledSection'
import PipelineRail from './today/PipelineRail'
import SyncHealthBanner from './today/SyncHealthBanner'
import type { SourceHealth } from '@/lib/ingestion-health'

interface DraftTarget {
  kind: 'fresh' | 'reply'
  school: School
  coachId?: string
  coachName?: string
  replyToContactLogId?: string
  inboundChannel?: string
  onSent?: () => void
}

const LV = {
  paper:    '#F6F1E8',
  ink:      '#0E0E0E',
  inkLo:    '#7A7570',
  inkMute:  '#A8A39B',
  red:      '#C8102E',
  tealDeep: '#006A65',
  goldText: '#8A6F0E',
}

export default function TodayClient({
  user,
  ingestionHealth,
}: {
  user: User
  ingestionHealth?: SourceHealth[]
}) {
  const today = todayStr()
  const mtToday = mountainTimeToday()
  const dayStart = useMemo(() => mountainDayStartUTC(mtToday), [mtToday])

  const { schools, loading: schoolsLoading } = useSchools()
  const { entries: contactLog, loading: logLoading, markHandled, markUnhandled, snoozeEntry } = useContactLog()
  const { items: actionItems, loading: actionsLoading, completeItem } = useActionItems()
  const supabase = useMemo(() => createClient(), [])

  const loading = schoolsLoading || logLoading || actionsLoading
  const schoolMap = useMemo(() => new Map(schools.map(s => [s.id, s])), [schools])

  const [draftTarget, setDraftTarget] = useState<DraftTarget | null>(null)
  const [batchReelSchoolIds, setBatchReelSchoolIds] = useState<string[] | null>(null)

  // ── Strategic prompts ──────────────────────────────────────────────────────
  const [skippedKeys, setSkippedKeys] = useState<Set<string>>(new Set())
  const [skipsLoaded, setSkipsLoaded] = useState(false)
  const [currentReelUrl, setCurrentReelUrl] = useState<string | null>(null)
  const [currentReelTitle, setCurrentReelTitle] = useState<string | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [batchSentSchoolIds, setBatchSentIds] = useState<Set<string>>(new Set())

  // Load skips and player profile on mount
  useEffect(() => {
    const weekStart = getCurrentWeekStart()
    supabase.from('strategic_skips')
      .select('prompt_key')
      .eq('week_start', weekStart)
      .then(({ data }) => {
        setSkippedKeys(new Set((data ?? []).map((r: { prompt_key: string }) => r.prompt_key)))
        setSkipsLoaded(true)
      })
    supabase.from('player_profile')
      .select('current_reel_url, current_reel_title')
      .limit(1)
      .single()
      .then(({ data }) => {
        const d = data as { current_reel_url: string | null; current_reel_title: string | null } | null
        const url = d?.current_reel_url ?? null
        setCurrentReelUrl(url)
        setCurrentReelTitle(d?.current_reel_title ?? null)
        setProfileLoaded(true)
        // Load batch reel sends for coverage calculation
        if (url) {
          supabase.from('batch_reel_sends')
            .select('school_id')
            .eq('reel_url', url)
            .in('sent_via', ['Email', 'Sports Recruits'])
            .then(({ data: sends }) => {
              setBatchSentIds(new Set((sends ?? []).map((r: { school_id: string }) => r.school_id)))
            })
        }
      })
  }, [supabase])

  async function handleSkipPrompt(key: string) {
    const weekStart = getCurrentWeekStart()
    await supabase.from('strategic_skips').insert({ prompt_key: key, week_start: weekStart })
    setSkippedKeys(prev => new Set(prev).add(key))
  }

  // ── Track which IDs are selected for today (persisted to DB) ───────────────
  // This is a Set of entry/action IDs, NOT TacticalItem objects.
  // The actual entry/action data comes from the live contactLog/actionItems hooks.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectionInitialized, setSelectionInitialized] = useState(false)

  const persistSelection = useCallback(async (ids: string[], entries: ContactLogEntry[]) => {
    const now = new Date().toISOString()
    const entryIds = ids.filter(id => entries.some(e => e.id === id))
    const actionIds = ids.filter(id => !entries.some(e => e.id === id))
    if (entryIds.length > 0) {
      await supabase.from('contact_log').update({ selected_for_today_at: now }).in('id', entryIds)
    }
    if (actionIds.length > 0) {
      await supabase.from('action_items').update({ selected_for_today_at: now }).in('id', actionIds)
    }
  }, [supabase])

  // On load: check for existing selection or compute fresh
  useEffect(() => {
    if (loading || selectionInitialized) return

    // Find IDs already selected today
    const selectedEntryIds = contactLog
      .filter(e => e.selected_for_today_at && e.selected_for_today_at >= dayStart)
      .map(e => e.id)
    const selectedActionIds = actionItems
      .filter(i => i.selected_for_today_at && i.selected_for_today_at >= dayStart)
      .map(i => i.id)

    const existingIds = [...selectedEntryIds, ...selectedActionIds]

    if (existingIds.length > 0) {
      // Restore from DB
      setSelectedIds(new Set(existingIds))
      setSelectionInitialized(true)
    } else {
      // First visit today — compute top 3 and persist
      const top3 = getTactical3(contactLog, schools, actionItems, today)
      const newIds = top3.map(item => item.entry?.id ?? item.actionItem?.id).filter(Boolean) as string[]
      if (newIds.length > 0) {
        persistSelection(newIds, contactLog).then(() => {
          setSelectedIds(new Set(newIds))
          setSelectionInitialized(true)
        })
      } else {
        setSelectedIds(new Set())
        setSelectionInitialized(true)
      }
    }
  }, [loading, selectionInitialized, contactLog, actionItems, schools, today, dayStart, persistSelection])

  // ── Derive active items from live data + selected IDs ──────────────────────
  // Uses rebuildSelectedItems (no isAwaitingReply filter) so handled items
  // retain their metadata. Then filters to only active (not handled/snoozed/completed).
  const activeItems = useMemo((): TacticalItem[] => {
    if (!selectionInitialized || selectedIds.size === 0) return []

    const allSelected = rebuildSelectedItems(selectedIds, contactLog, schools, actionItems, today)

    return allSelected.filter(item => {
      if (item.entry?.handled_at) return false
      if (item.entry?.snoozed_until && item.entry.snoozed_until > new Date().toISOString()) return false
      if (item.actionItem?.completed_at) return false
      return true
    })
  }, [selectionInitialized, selectedIds, contactLog, schools, actionItems, today])

  // ── Masthead metrics ────────────────────────────────────────────────────────
  // All scoped to Tier A/B, active schools only.
  const mastheadMetrics = useMemo(() => {
    const abSchools = schools.filter(s =>
      (s.category === 'A' || s.category === 'B') && s.status !== 'Inactive'
    )
    const abIds = new Set(abSchools.map(s => s.id))

    // Build per-school entry map for isAwaitingReply
    const bySchool = new Map<string, ContactLogEntry[]>()
    for (const e of contactLog) {
      if (!e.school_id || !abIds.has(e.school_id)) continue
      if (!bySchool.has(e.school_id)) bySchool.set(e.school_id, [])
      bySchool.get(e.school_id)!.push(e)
    }

    // active: unique A/B schools with inbound awaiting reply
    const activeSchools = new Set<string>()
    bySchool.forEach((entries: ContactLogEntry[], schoolId: string) => {
      const hasAwaiting = entries.some((e: ContactLogEntry) =>
        e.direction === 'Inbound' && isAwaitingReply(e, entries)
      )
      if (hasAwaiting) activeSchools.add(schoolId)
    })

    // overdue: count of A/B action items (not schools) that are past due
    const overdueCount = actionItems.filter(i =>
      !i.completed_at && i.due_date && i.due_date < today && abIds.has(i.school_id)
    ).length

    // this week: unique A/B schools that are going_cold OR have action due in 7d
    const weekSchools = new Set<string>()

    // going_cold: A/B schools with most recent inbound awaiting 5+ days
    bySchool.forEach((entries: ContactLogEntry[], schoolId: string) => {
      const awaiting = entries.filter((e: ContactLogEntry) =>
        e.direction === 'Inbound' && isAwaitingReply(e, entries)
      )
      if (awaiting.length > 0) {
        const mostRecent = awaiting.sort((a: ContactLogEntry, b: ContactLogEntry) => b.sent_at.localeCompare(a.sent_at))[0]
        const sentDate = new Date(mostRecent.sent_at).toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
        const days = daysBetween(sentDate)
        if (days >= 5) weekSchools.add(schoolId)
      }
    })

    // action items due within next 7 days (A/B only)
    const todayDate = new Date(today)
    const weekEnd = new Date(todayDate)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const weekEndStr = weekEnd.toISOString().split('T')[0]
    for (const item of actionItems) {
      if (item.completed_at) continue
      if (!item.due_date) continue
      if (!abIds.has(item.school_id)) continue
      if (item.due_date >= today && item.due_date <= weekEndStr) {
        weekSchools.add(item.school_id)
      }
    }

    return { active: activeSchools.size, overdue: overdueCount, week: weekSchools.size }
  }, [schools, contactLog, actionItems, today])

  // ── Strategic prompts (computed after activeItems to exclude tactical schools) ──
  const tacticalSchoolIds = useMemo(() => {
    const ids = new Set<string>()
    for (const e of contactLog) {
      if (selectedIds.has(e.id)) ids.add(e.school_id)
    }
    for (const a of actionItems) {
      if (selectedIds.has(a.id)) ids.add(a.school_id)
    }
    return ids
  }, [selectedIds, contactLog, actionItems])

  const strategicPrompts = useMemo(() => {
    if (!skipsLoaded || !profileLoaded) return []
    return getStrategicPrompts(schools, contactLog, currentReelUrl, skippedKeys, tacticalSchoolIds, batchSentSchoolIds)
  }, [schools, contactLog, currentReelUrl, skippedKeys, skipsLoaded, profileLoaded, tacticalSchoolIds, batchSentSchoolIds])

  // ── Handled today — from live contactLog ───────────────────────────────────
  const handledToday = useMemo(() =>
    contactLog
      .filter(e => e.handled_at && e.handled_at >= dayStart)
      .sort((a, b) => (b.handled_at ?? '').localeCompare(a.handled_at ?? ''))
      .slice(0, 3)
      .map(entry => ({
        entry,
        school: schoolMap.get(entry.school_id) ?? { id: entry.school_id, name: 'Unknown' } as School,
      })),
    [contactLog, dayStart, schoolMap]
  )

  // ── Pipeline rail data ──────────────────────────────────────────────────────
  const pipelineItems = useMemo(() =>
    getPipelineSchools(schools, contactLog),
    [schools, contactLog]
  )

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleDone(entryId: string) {
    // markHandled does optimistic update on contactLog entries state
    await markHandled(entryId)
    // No need to update selectedIds or lockedItems — activeItems and handledToday
    // both derive from the live contactLog which markHandled already updated
  }

  async function handleUndo(entryId: string) {
    await markUnhandled(entryId)
  }

  if (loading || !selectionInitialized) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: LV.inkLo, fontSize: 14, fontFamily: 'inherit',
      }}>
        Loading...
      </div>
    )
  }

  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })
  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

  return (
    <div style={{
      minHeight: '100vh',
      background: LV.paper,
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* Ingestion health banner */}
      {ingestionHealth && <SyncHealthBanner sources={ingestionHealth} />}

      {/* Masthead — full width, above the 2-column split */}
      <div style={{
        padding: '24px clamp(28px, 4vw, 56px) 8px',
      }}>
        <h1 style={{
          margin: 0,
          fontSize: 'clamp(56px, 7vw, 88px)',
          fontWeight: 700, letterSpacing: '-0.04em',
          color: LV.ink, lineHeight: 0.95,
          fontStyle: 'italic',
        }}>Today.</h1>

        {/* Metric line */}
        <div style={{
          marginTop: 10,
          display: 'flex', alignItems: 'baseline',
          gap: 14, flexWrap: 'wrap',
          fontSize: 14, fontWeight: 600,
          letterSpacing: -0.1,
        }}>
          {mastheadMetrics.overdue > 0 && (
            <>
              <span style={{ whiteSpace: 'nowrap' }}>
                <span style={{ color: LV.red, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {mastheadMetrics.overdue}
                </span>{' '}
                <span style={{ color: LV.inkLo, fontWeight: 500 }}>overdue</span>
              </span>
              <span style={{ color: LV.inkMute }}>·</span>
            </>
          )}
          <span style={{ whiteSpace: 'nowrap' }}>
            <span style={{ color: LV.tealDeep, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
              {mastheadMetrics.active}
            </span>{' '}
            <span style={{ color: LV.inkLo, fontWeight: 500 }}>active</span>
          </span>
          <span style={{ color: LV.inkMute }}>·</span>
          <span style={{ whiteSpace: 'nowrap' }}>
            <span style={{ color: LV.goldText, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
              {mastheadMetrics.week}
            </span>{' '}
            <span style={{ color: LV.inkLo, fontWeight: 500 }}>this week</span>
          </span>
        </div>

        {/* Date kicker */}
        <div style={{
          marginTop: 10, fontSize: 11, letterSpacing: '0.18em',
          textTransform: 'uppercase', fontWeight: 800, color: LV.inkLo,
        }}>
          {dayName}, {dateLabel}
        </div>
      </div>

      {/* 2-column: main content + pipeline rail */}
      <div className="md:flex">
        <main style={{ flex: 1, minWidth: 0, paddingBottom: 'clamp(60px, 10vw, 100px)' }}>
          {/* Tactical top 3 (locked for the day) */}
          <TacticalSection
            items={activeItems}
            onDraftReply={(schoolId, coachName, entryId, channel) => {
              const school = schools.find(s => s.id === schoolId)
              if (!school) return
              setDraftTarget({
                kind: 'reply',
                school,
                coachName: coachName ?? undefined,
                replyToContactLogId: entryId,
                inboundChannel: channel,
              })
            }}
            onDraftFresh={(schoolId) => {
              const school = schools.find(s => s.id === schoolId)
              if (!school) return
              setDraftTarget({ kind: 'fresh', school })
            }}
            onComplete={async (id) => { await completeItem(id) }}
            onSnooze={async (id) => { await snoozeEntry(id) }}
            onDone={handleDone}
          />

          {/* Strategic zone — Think · This week */}
          <StrategicSection
            prompts={strategicPrompts}
            schools={schools}
            onSkip={handleSkipPrompt}
            onBatchReel={(ids) => setBatchReelSchoolIds(ids)}
          />

          {/* Recently handled */}
          <HandledSection
            items={handledToday}
            onUndo={handleUndo}
          />
        </main>

        {/* Desktop pipeline rail */}
        <div className="hidden md:block">
          <PipelineRail items={pipelineItems} />
        </div>
      </div>

      {/* Mobile pipeline rail — full width at bottom, padded for bottom nav */}
      <div className="block md:hidden" style={{ paddingBottom: 80 }}>
        <PipelineRail items={pipelineItems} mobile />
      </div>

      {/* Batch reel send modal */}
      {batchReelSchoolIds && (
        <BatchReelModal
          schoolIds={batchReelSchoolIds}
          schools={schools}
          userId={user.id}
          reelUrl={currentReelUrl}
          reelTitle={currentReelTitle}
          onClose={() => setBatchReelSchoolIds(null)}
        />
      )}

      {/* Draft modal */}
      {draftTarget && (
        <DraftModal
          mode={draftTarget.kind === 'reply' && draftTarget.replyToContactLogId
            ? {
                kind: 'reply',
                schoolId: draftTarget.school.id,
                coachId: draftTarget.coachId ?? draftTarget.school.id,
                schoolName: draftTarget.school.name,
                coachName: draftTarget.coachName,
                replyToContactLogId: draftTarget.replyToContactLogId,
                inboundChannel: draftTarget.inboundChannel,
              }
            : {
                kind: 'fresh',
                schoolId: draftTarget.school.id,
                coachId: draftTarget.coachId ?? draftTarget.school.id,
                schoolName: draftTarget.school.name,
                coachName: draftTarget.coachName,
              }
          }
          userId={user.id}
          onClose={() => setDraftTarget(null)}
          onSent={draftTarget.onSent}
        />
      )}
    </div>
  )
}

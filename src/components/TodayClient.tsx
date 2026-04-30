'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import type { School, ContactLogEntry } from '@/lib/types'
import { useSchools, useContactLog, useActionItems } from '@/hooks/useRealtimeData'
import { createClient } from '@/lib/supabase/client'
import { todayStr } from '@/lib/utils'
import { getTactical3, rebuildSelectedItems, type TacticalItem } from '@/lib/today-scoring'
import { mountainTimeToday, mountainDayStartUTC } from '@/lib/today-selection'
import { getStrategicPrompts, getCurrentWeekStart, type StrategicPrompt } from '@/lib/strategic-prompts'
import DraftModal from './DraftModal'
import TacticalSection from './today/TacticalSection'
import StrategicSection from './today/StrategicSection'
import BatchReelModal from './today/BatchReelModal'
import HandledSection from './today/HandledSection'

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
  paper: '#F6F1E8',
  ink: '#0E0E0E',
  inkLo: '#7A7570',
}

export default function TodayClient({
  user,
  pendingCoachChanges = 0,
  pendingGmailPartials = 0,
}: {
  user: User
  pendingCoachChanges?: number
  pendingGmailPartials?: number
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
        setCurrentReelUrl(d?.current_reel_url ?? null)
        setCurrentReelTitle(d?.current_reel_title ?? null)
        setProfileLoaded(true)
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
    return getStrategicPrompts(schools, contactLog, currentReelUrl, skippedKeys, tacticalSchoolIds)
  }, [schools, contactLog, currentReelUrl, skippedKeys, skipsLoaded, profileLoaded, tacticalSchoolIds])

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
  const overdueCount = actionItems.filter(i => i.due_date && i.due_date < today).length

  return (
    <div style={{
      minHeight: '100vh',
      background: LV.paper,
      paddingBottom: 'clamp(60px, 10vw, 100px)',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* Masthead */}
      <div style={{
        padding: 'clamp(20px, 3vw, 14px) clamp(22px, 5vw, 56px) clamp(8px, 1vw, 8px)',
      }}>
        <h1 style={{
          margin: 0,
          fontSize: 'clamp(40px, 7vw, 64px)',
          fontWeight: 700, letterSpacing: 'clamp(-2px, -0.03em, -3px)',
          color: LV.ink, lineHeight: 1,
          display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap',
          fontStyle: 'italic',
        }}>
          Today.
          {overdueCount > 0 && (
            <span style={{
              fontSize: 'clamp(12px, 1.5vw, 14px)', fontWeight: 700,
              color: '#C8102E', letterSpacing: 0, fontStyle: 'normal',
            }}>
              {overdueCount} overdue
            </span>
          )}
        </h1>
        <div style={{
          marginTop: 6, fontSize: 11, letterSpacing: '0.15em',
          textTransform: 'uppercase', fontWeight: 700, color: LV.inkLo,
        }}>
          {dayName} — {dateLabel}
        </div>
      </div>

      {/* Coach changes callout */}
      {pendingCoachChanges > 0 && (
        <div style={{ margin: 'clamp(0px, 1vw, 4px) clamp(22px, 5vw, 56px) 20px' }}>
          <a href="/settings/coach-changes" style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 16px', borderRadius: 8,
              background: '#FEF3C7', border: '1px solid #FCD34D', cursor: 'pointer',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#92400E' }}>
                {pendingCoachChanges} coaching staff change{pendingCoachChanges !== 1 ? 's' : ''} to review
              </span>
              <span style={{ fontSize: 12, color: '#B45309', fontWeight: 600 }}>Review →</span>
            </div>
          </a>
        </div>
      )}

      {/* Gmail partials callout */}
      {pendingGmailPartials > 0 && (
        <div style={{ margin: 'clamp(0px, 1vw, 4px) clamp(22px, 5vw, 56px) 12px' }}>
          <a href="/settings/gmail-partials" style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 16px', borderRadius: 8,
              background: '#EFF6FF', border: '1px solid #BFDBFE', cursor: 'pointer',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1E40AF' }}>
                {pendingGmailPartials} Gmail email{pendingGmailPartials !== 1 ? 's' : ''} need coach review
              </span>
              <span style={{ fontSize: 12, color: '#1D4ED8', fontWeight: 600 }}>Review →</span>
            </div>
          </a>
        </div>
      )}

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

      {/* Recently handled */}
      <HandledSection
        items={handledToday}
        onUndo={handleUndo}
      />

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

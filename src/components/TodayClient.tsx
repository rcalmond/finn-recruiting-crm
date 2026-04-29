'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import type { School, ContactLogEntry } from '@/lib/types'
import { useSchools, useContactLog, useActionItems } from '@/hooks/useRealtimeData'
import { createClient } from '@/lib/supabase/client'
import { todayStr } from '@/lib/utils'
import { getTactical3, type TacticalItem } from '@/lib/today-scoring'
import { mountainTimeToday, mountainDayStartUTC } from '@/lib/today-selection'
import DraftModal from './DraftModal'
import TacticalSection from './today/TacticalSection'
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
  const { entries: contactLog, loading: logLoading, markHandled, snoozeEntry } = useContactLog()
  const { items: actionItems, loading: actionsLoading, completeItem } = useActionItems()
  const supabase = useMemo(() => createClient(), [])

  const loading = schoolsLoading || logLoading || actionsLoading

  const [draftTarget, setDraftTarget] = useState<DraftTarget | null>(null)
  const [selectionLocked, setSelectionLocked] = useState(false)
  const [lockedItems, setLockedItems] = useState<TacticalItem[]>([])

  // ── Daily selection logic ──────────────────────────────────────────────────

  const lockSelection = useCallback(async (items: TacticalItem[]) => {
    const now = new Date().toISOString()
    // Mark contact_log entries
    const entryIds = items.filter(i => i.entry).map(i => i.entry!.id)
    if (entryIds.length > 0) {
      await supabase.from('contact_log')
        .update({ selected_for_today_at: now })
        .in('id', entryIds)
    }
    // Mark action items
    const actionIds = items.filter(i => i.actionItem).map(i => i.actionItem!.id)
    if (actionIds.length > 0) {
      await supabase.from('action_items')
        .update({ selected_for_today_at: now })
        .in('id', actionIds)
    }
  }, [supabase])

  // Check if today's selection exists, or compute fresh
  useEffect(() => {
    if (loading || selectionLocked) return

    // Check for already-selected items today
    const selectedEntryIds = contactLog
      .filter(e => e.selected_for_today_at && e.selected_for_today_at >= dayStart)
      .map(e => e.id)

    const selectedActionIds = actionItems
      .filter(i => i.selected_for_today_at && i.selected_for_today_at >= dayStart)
      .map(i => i.id)

    if (selectedEntryIds.length > 0 || selectedActionIds.length > 0) {
      // Reconstruct locked items from previously selected
      const top3 = getTactical3(contactLog, schools, actionItems, today)
      const locked = top3.filter(item =>
        (item.entry && selectedEntryIds.includes(item.entry.id)) ||
        (item.actionItem && selectedActionIds.includes(item.actionItem.id))
      )
      setLockedItems(locked)
      setSelectionLocked(true)
    } else {
      // First visit today — compute and persist
      const top3 = getTactical3(contactLog, schools, actionItems, today)
      if (top3.length > 0) {
        lockSelection(top3).then(() => {
          setLockedItems(top3)
          setSelectionLocked(true)
        })
      } else {
        setLockedItems([])
        setSelectionLocked(true)
      }
    }
  }, [loading, selectionLocked, contactLog, actionItems, schools, today, dayStart, lockSelection])

  // ── Active items (locked minus handled/snoozed) ────────────────────────────

  const activeItems = useMemo(() =>
    lockedItems.filter(item => {
      if (item.entry) {
        if (item.entry.handled_at) return false
        if (item.entry.snoozed_until && item.entry.snoozed_until > new Date().toISOString()) return false
      }
      if (item.actionItem?.completed_at) return false
      return true
    }),
    [lockedItems]
  )

  // ── Handled today ──────────────────────────────────────────────────────────

  const schoolMap = useMemo(() => new Map(schools.map(s => [s.id, s])), [schools])

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
    await markHandled(entryId)
    // Update locked items to reflect handled state
    setLockedItems(prev => prev.map(item =>
      item.entry?.id === entryId
        ? { ...item, entry: { ...item.entry!, handled_at: new Date().toISOString() } }
        : item
    ))
  }

  async function handleUndo(entryId: string) {
    await supabase.from('contact_log')
      .update({ handled_at: null })
      .eq('id', entryId)
    // Restore in locked items
    setLockedItems(prev => prev.map(item =>
      item.entry?.id === entryId
        ? { ...item, entry: { ...item.entry!, handled_at: undefined } }
        : item
    ))
  }

  if (loading || !selectionLocked) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: LV.inkLo, fontSize: 14, fontFamily: 'inherit',
      }}>
        Loading...
      </div>
    )
  }

  // Day of week for the masthead
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

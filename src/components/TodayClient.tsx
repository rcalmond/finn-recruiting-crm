'use client'

import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import type { School } from '@/lib/types'
import type { ContactLogEntry } from '@/lib/types'
import { useSchools, useContactLog, useActionItems, useCoaches } from '@/hooks/useRealtimeData'
import { getRankedFeaturedAction, getUnrepliedInbounds, getFilteredAwaitingReplies, getGoingColdSchools, getThisWeekItems } from '@/lib/todayLogic'
import { todayStr } from '@/lib/utils'
import DraftModal from './DraftModal'
import HeroSection from './today/HeroSection'
import AwaitSection from './today/AwaitSection'
import WeekSection from './today/WeekSection'
import ColdSection from './today/ColdSection'

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
  const { schools, loading: schoolsLoading } = useSchools()
  const { entries: contactLog, loading: logLoading, snoozeEntry, dismissEntry } = useContactLog()
  const { items: actionItems, loading: actionsLoading, updateItem, completeItem } = useActionItems()

  const loading = schoolsLoading || logLoading || actionsLoading

  const [heroCompleted, setHeroCompleted] = useState(false)
  const [heroSchoolId, setHeroSchoolId] = useState<string | null>(null)
  const [heroActionType, setHeroActionType] = useState<string | null>(null)
  const [draftTarget, setDraftTarget] = useState<DraftTarget | null>(null)

  // Derived state — safe to compute even while loading (returns empty/null)
  const featured = heroCompleted ? null : getRankedFeaturedAction(actionItems, contactLog, schools, today)
  const filteredUnreplied = getFilteredAwaitingReplies(contactLog, schools)
  const cold = getGoingColdSchools(contactLog, schools)
  const thisWeek = getThisWeekItems(actionItems, today)


  // When a new featured school appears, record its id and type.
  const featuredId = featured?.school.id ?? null
  const featuredType = featured?.type ?? null
  useEffect(() => {
    if (featuredId) {
      setHeroSchoolId(featuredId)
      setHeroActionType(featuredType)
    }
  }, [featuredId, featuredType])

  // Auto-collapse hero when the featured school's inbound is replied to (realtime).
  // Only applies to inbound_reply / going_cold — action_item heroes collapse only via
  // handleComplete. Also guarded until contact log finishes loading so an empty log
  // on initial fetch doesn't look like "all inbounds resolved."
  useEffect(() => {
    if (!heroSchoolId || heroCompleted || logLoading) return
    if (heroActionType === 'action_item') return
    const stillUnreplied = getUnrepliedInbounds(contactLog, schools).some(e => e.school_id === heroSchoolId)
    if (!stillUnreplied) setHeroCompleted(true)
  }, [contactLog, heroSchoolId, heroCompleted, logLoading, heroActionType])

  if (loading) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: LV.inkLo, fontSize: 14, fontFamily: 'inherit',
      }}>
        Loading…
      </div>
    )
  }

  function openFreshDraft(school: School, onSent?: () => void) {
    // Find primary coach for this school from contact_log context
    // We don't have coaches loaded globally on Today — pass school info and let the modal resolve
    setDraftTarget({ kind: 'fresh', school, onSent })
  }

  function openReplyDraft(school: School, entry: ContactLogEntry) {
    setDraftTarget({
      kind: 'reply',
      school,
      coachId: entry.coach_id ?? undefined,
      coachName: entry.coach_name ?? undefined,
      replyToContactLogId: entry.id,
      inboundChannel: entry.channel,
    })
  }

  async function handleSnooze(actionItemId: string) {
    const d = new Date(today)
    d.setDate(d.getDate() + 1)
    await updateItem(actionItemId, { due_date: d.toISOString().split('T')[0] })
  }

  async function handleComplete(actionItemId?: string) {
    if (actionItemId) await completeItem(actionItemId)
    setHeroCompleted(true)
  }

  // Day of week for the masthead
  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })
  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  const overdueCount = actionItems.filter(i => i.due_date && i.due_date < today).length
  const thisWeekCount = getThisWeekItems(actionItems, today).filter(i => i.due_date && i.due_date >= today).length

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
          <span style={{
            fontSize: 'clamp(12px, 1.5vw, 14px)', fontWeight: 600,
            color: LV.inkLo, letterSpacing: 0, fontStyle: 'normal',
            display: 'inline-flex', alignItems: 'baseline', gap: 6,
          }}>
            {overdueCount > 0 && (
              <span style={{ color: '#C8102E', fontWeight: 700 }}>{overdueCount} overdue</span>
            )}
            {overdueCount > 0 && thisWeekCount > 0 && ' · '}
            {thisWeekCount > 0 && `${thisWeekCount} this week`}
          </span>
        </h1>
        <div style={{
          marginTop: 6, fontSize: 11, letterSpacing: '0.15em',
          textTransform: 'uppercase', fontWeight: 700, color: LV.inkLo,
        }}>
          {dayName} — {dateLabel}
        </div>
      </div>

      {/* Coach changes callout — shown when pending review > 0 */}
      {pendingCoachChanges > 0 && (
        <div style={{
          margin: 'clamp(0px, 1vw, 4px) clamp(22px, 5vw, 56px) 20px',
        }}>
          <a href="/settings/coach-changes" style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 16px', borderRadius: 8,
              background: '#FEF3C7', border: '1px solid #FCD34D',
              cursor: 'pointer',
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
        <div style={{
          margin: 'clamp(0px, 1vw, 4px) clamp(22px, 5vw, 56px) 12px',
        }}>
          <a href="/settings/gmail-partials" style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 16px', borderRadius: 8,
              background: '#EFF6FF', border: '1px solid #BFDBFE',
              cursor: 'pointer',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1E40AF' }}>
                {pendingGmailPartials} Gmail email{pendingGmailPartials !== 1 ? 's' : ''} need coach review
              </span>
              <span style={{ fontSize: 12, color: '#1D4ED8', fontWeight: 600 }}>Review →</span>
            </div>
          </a>
        </div>
      )}

      {/* Section 1 — Hero */}
      <HeroSection
        featured={featured}
        heroCompleted={heroCompleted}
        onComplete={handleComplete}
        onSnooze={handleSnooze}
        onDraft={(school, entry) => {
          if (entry) {
            openReplyDraft(school, entry)
          } else {
            openFreshDraft(school, () => setHeroCompleted(true))
          }
        }}
      />

      {/* Section 2 — Awaiting reply */}
      <AwaitSection
        unreplied={filteredUnreplied}
        schools={schools}
        onDraft={(school, entry) => openReplyDraft(school, entry)}
        onSnooze={async (id) => { await snoozeEntry(id) }}
        onDismiss={async (id) => { await dismissEntry(id) }}
      />

      {/* Section 3 — This week */}
      <WeekSection items={thisWeek} today={today} />

      {/* Section 4 — Don't let these go cold */}
      <ColdSection
        cold={cold}
        onDraft={(school) => openFreshDraft(school)}
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

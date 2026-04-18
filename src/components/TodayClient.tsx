'use client'

import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import type { School } from '@/lib/types'
import type { EmailType } from '@/lib/prompts'
import { useSchools, useContactLog, useActionItems } from '@/hooks/useRealtimeData'
import { getRankedFeaturedAction, getUnrepliedInbounds, getFilteredAwaitingReplies, getGoingColdSchools, getThisWeekItems } from '@/lib/todayLogic'
import { todayStr } from '@/lib/utils'
import DraftEmailModal from './DraftEmailModal'
import HeroSection from './today/HeroSection'
import AwaitSection from './today/AwaitSection'
import WeekSection from './today/WeekSection'
import ColdSection from './today/ColdSection'

interface DraftTarget {
  school: School
  emailType: EmailType
  coachMessage?: string
  onOutreachLogged?: () => void
}

const LV = {
  paper: '#F6F1E8',
  ink: '#0E0E0E',
  inkLo: '#7A7570',
}

export default function TodayClient({ user }: { user: User }) {
  const today = todayStr()
  const { schools, loading: schoolsLoading } = useSchools()
  const { entries: contactLog, loading: logLoading } = useContactLog()
  const { items: actionItems, loading: actionsLoading, updateItem, deleteItem } = useActionItems()

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
    const stillUnreplied = getUnrepliedInbounds(contactLog).some(e => e.school_id === heroSchoolId)
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

  function openDraft(school: School, emailType: EmailType, coachMessage?: string, onOutreachLogged?: () => void) {
    setDraftTarget({ school, emailType, coachMessage, onOutreachLogged })
  }

  async function handleSnooze(actionItemId: string) {
    const d = new Date(today)
    d.setDate(d.getDate() + 1)
    await updateItem(actionItemId, { due_date: d.toISOString().split('T')[0] })
  }

  async function handleComplete(actionItemId?: string) {
    if (actionItemId) await deleteItem(actionItemId)
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

      {/* Section 1 — Hero */}
      <HeroSection
        featured={featured}
        heroCompleted={heroCompleted}
        onComplete={handleComplete}
        onSnooze={handleSnooze}
        onDraft={(school, emailType, coachMessage) =>
          openDraft(school, emailType, coachMessage, () => setHeroCompleted(true))
        }
      />

      {/* Section 2 — Awaiting reply */}
      <AwaitSection
        unreplied={filteredUnreplied}
        schools={schools}
        onDraft={(school, emailType, coachMessage) =>
          openDraft(school, emailType, coachMessage)
        }
      />

      {/* Section 3 — This week */}
      <WeekSection items={thisWeek} today={today} />

      {/* Section 4 — Don't let these go cold */}
      <ColdSection
        cold={cold}
        onDraft={(school, emailType, coachMessage) =>
          openDraft(school, emailType, coachMessage)
        }
      />

      {/* Draft email modal */}
      {draftTarget && (
        <DraftEmailModal
          school={draftTarget.school}
          userId={user.id}
          initialEmailType={draftTarget.emailType}
          initialCoachMessage={draftTarget.coachMessage}
          onOutreachLogged={draftTarget.onOutreachLogged}
          onClose={() => setDraftTarget(null)}
        />
      )}
    </div>
  )
}

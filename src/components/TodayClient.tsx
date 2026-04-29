'use client'

import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { School } from '@/lib/types'
import { useSchools, useContactLog, useActionItems } from '@/hooks/useRealtimeData'
import { todayStr } from '@/lib/utils'
import { getTactical3 } from '@/lib/today-scoring'
import DraftModal from './DraftModal'
import TacticalSection from './today/TacticalSection'

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
  const { items: actionItems, loading: actionsLoading, completeItem } = useActionItems()

  const loading = schoolsLoading || logLoading || actionsLoading

  const [draftTarget, setDraftTarget] = useState<DraftTarget | null>(null)

  // Top 3 tactical items
  const tactical3 = getTactical3(contactLog, schools, actionItems, today)

  if (loading) {
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

      {/* Tactical top 3 */}
      <TacticalSection
        items={tactical3}
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
        onDismiss={async (id) => { await dismissEntry(id) }}
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

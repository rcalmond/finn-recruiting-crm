import type { School, ContactLogEntry } from './types'
import { daysBetween } from './utils'
import { isAwaitingReply, isTargetTier } from './awaiting-reply'

export interface Signal {
  kind: 'awaiting' | 'cold' | 'active'
  text: string
  // Optional metadata for scoring/display (populated for awaiting/cold)
  intent?: ContactLogEntry['intent']
  authored_by?: ContactLogEntry['authored_by']
  daysWaiting?: number
}

/** Convert sent_at ISO timestamp to Mountain time YYYY-MM-DD for daysBetween display. */
function sentAtToMountainDate(sentAt: string): string {
  return new Date(sentAt).toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
}

/**
 * Derives the signal pill for a school based on its contact log entries.
 *
 * Priority order (first match wins):
 *
 * 1. "Going cold · Xd" (gold)
 *    — unreplied inbound ≥ 5 days old, category A or B only.
 *
 * 2. "Awaiting reply · Xd" (teal)
 *    — any other unreplied inbound (any age, category A/B/C).
 *
 * 3. "Active" (teal)
 *    — only if there are ZERO unreplied inbounds AND:
 *      · the chronologically last email-channel contact is an outbound
 *      · that outbound is within 14 days
 *      · at least one inbound exists (back-and-forth confirmed)
 *      · category A or B only.
 *
 * Returns null if none of the above conditions are met, or if school is Nope tier.
 */
export function deriveSignal(
  school: Pick<School, 'id' | 'category'>,
  contactLog: ContactLogEntry[]
): Signal | null {
  if (!isTargetTier(school)) return null

  const schoolLog = contactLog.filter(e => e.school_id === school.id)
  if (schoolLog.length === 0) return null

  // Find unreplied inbounds using the shared helper
  const unreplied = schoolLog
    .filter(e => e.direction === 'Inbound' && isAwaitingReply(e, schoolLog))

  if (unreplied.length > 0) {
    const mostRecent = unreplied
      .slice()
      .sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0]
    const days = daysBetween(sentAtToMountainDate(mostRecent.sent_at))

    // Priority 1: Going cold — 5+ days, A or B only
    if (days >= 5 && (school.category === 'A' || school.category === 'B')) {
      return {
        kind: 'cold', text: `Going cold · ${days}d`,
        intent: mostRecent.intent, authored_by: mostRecent.authored_by, daysWaiting: days,
      }
    }

    // Priority 2: Awaiting reply — any other unreplied inbound (A/B/C)
    return {
      kind: 'awaiting', text: `Awaiting reply · ${days}d`,
      intent: mostRecent.intent, authored_by: mostRecent.authored_by, daysWaiting: days,
    }
  }

  // ── Active check ─────────────────────────────────────────────────────────────
  if (school.category === 'A' || school.category === 'B') {
    const emailLog = schoolLog.filter(e => e.channel === 'Email' || e.channel === 'Sports Recruits')
    const emailInbounds = emailLog.filter(e => e.direction === 'Inbound')
    const emailOutbounds = emailLog.filter(e => e.direction === 'Outbound')

    if (emailInbounds.length > 0 && emailOutbounds.length > 0) {
      const last = emailLog
        .slice()
        .sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0]

      if (last.direction === 'Outbound' && daysBetween(sentAtToMountainDate(last.sent_at)) <= 14) {
        return { kind: 'active', text: 'Active' }
      }
    }
  }

  return null
}

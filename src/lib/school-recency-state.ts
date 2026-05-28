/**
 * school-recency-state.ts
 *
 * Canonical "school recency state" classifier. Single source of truth
 * used by /schools list, /schools map, and the Today pipeline widget.
 *
 * Replaces the old deriveSignal() (signals.ts) and classifySchool()
 * (pipeline-rail.ts) with one function using consistent thresholds
 * and vocabulary.
 *
 * Six states, each visually distinct:
 *   hot         → "Awaiting Finn"  — unreplied coach inbound within 60d
 *   active      → "Active"         — two-way activity, last contact <14d
 *   cooling     → "Cooling"        — last contact 14-30d
 *   cold        → "Cold"           — last contact >30d
 *   prospecting → "Prospecting"    — outbound only, no inbound yet
 *   declined    → "Declined"       — most recent inbound was a decline
 *   null        → no signal        — no contact or filtered out
 */

import type { School, ContactLogEntry } from './types'
import { isAwaitingReply } from './awaiting-reply'

// ─── Types ──────────────────────────────────────────────────────────────────

export type SchoolRecencyState =
  | 'hot'
  | 'active'
  | 'cooling'
  | 'cold'
  | 'prospecting'
  | 'declined'

export interface SchoolRecencyResult {
  state: SchoolRecencyState | null
  /** Days since most recent contact_log entry (any direction). */
  daysSinceLastContact: number | null
  /** Days since the oldest unreplied coach inbound (for HOT label). */
  daysSinceUnrepliedInbound: number | null
}

// ─── Classifier ─────────────────────────────────────────────────────────────

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000

/**
 * Classify a school's recency state from its contact_log entries.
 *
 * Tier scope: A/B/C only. Nope and Inactive → null.
 * parse_status filtering: orphan and non_coach rows excluded.
 */
export function classifySchoolRecency(
  school: Pick<School, 'id' | 'category' | 'status'>,
  contactLog: ContactLogEntry[],
  today: Date = new Date(),
): SchoolRecencyResult {
  const NULL_RESULT: SchoolRecencyResult = { state: null, daysSinceLastContact: null, daysSinceUnrepliedInbound: null }

  // 1. Tier + status filter
  if (!['A', 'B', 'C'].includes(school.category)) return NULL_RESULT
  if (school.status === 'Inactive') return NULL_RESULT

  // 2. Filter contact_log to this school, exclude orphan/non_coach
  const schoolLog = contactLog.filter(e =>
    e.school_id === school.id &&
    e.parse_status !== 'orphan' &&
    e.parse_status !== 'non_coach'
  )

  if (schoolLog.length === 0) return NULL_RESULT

  // Sort descending by sent_at for recency checks
  const sorted = schoolLog.slice().sort((a, b) => b.sent_at.localeCompare(a.sent_at))

  // 3. Compute daysSinceLastContact
  const nowMs = today.getTime()
  const mostRecentSentAt = sorted[0].sent_at
  const daysSinceLastContact = Math.floor(
    (nowMs - new Date(mostRecentSentAt).getTime()) / 86400000
  )

  // 4. Check DECLINED: most recent inbound has intent='decline'
  //    AND that inbound is the most recent entry overall (no outbound after it)
  const mostRecentInbound = sorted.find(e => e.direction === 'Inbound')
  if (mostRecentInbound?.intent === 'decline') {
    // Is the decline the most recent entry? (no outbound after it)
    const hasOutboundAfter = sorted.some(e =>
      e.direction === 'Outbound' && e.sent_at > mostRecentInbound.sent_at
    )
    if (!hasOutboundAfter) {
      return { state: 'declined', daysSinceLastContact, daysSinceUnrepliedInbound: null }
    }
  }

  // 5. Check HOT: unreplied coach inbound within 60d
  const sixtyDaysAgo = nowMs - SIXTY_DAYS_MS
  const unrepliedCoach = schoolLog.filter(e =>
    e.direction === 'Inbound' &&
    (e.authored_by === 'coach_personal' || e.authored_by === 'coach_via_platform') &&
    new Date(e.sent_at).getTime() >= sixtyDaysAgo &&
    isAwaitingReply(e, schoolLog)
  )

  if (unrepliedCoach.length > 0) {
    // Use the most recent unreplied for the label
    const mostRecentUnreplied = unrepliedCoach.sort((a, b) =>
      b.sent_at.localeCompare(a.sent_at)
    )[0]
    const daysSinceUnrepliedInbound = Math.floor(
      (nowMs - new Date(mostRecentUnreplied.sent_at).getTime()) / 86400000
    )
    return { state: 'hot', daysSinceLastContact, daysSinceUnrepliedInbound }
  }

  // 6. Has any inbound ever? (determines active/cooling/cold vs prospecting)
  const hasInbound = schoolLog.some(e => e.direction === 'Inbound')

  if (!hasInbound) {
    // 10. Outbound only → PROSPECTING
    return { state: 'prospecting', daysSinceLastContact, daysSinceUnrepliedInbound: null }
  }

  // 7-9. Recency-based with inbound history
  if (daysSinceLastContact < 14) {
    return { state: 'active', daysSinceLastContact, daysSinceUnrepliedInbound: null }
  }
  if (daysSinceLastContact <= 30) {
    return { state: 'cooling', daysSinceLastContact, daysSinceUnrepliedInbound: null }
  }
  return { state: 'cold', daysSinceLastContact, daysSinceUnrepliedInbound: null }
}

// ─── Display config ─────────────────────────────────────────────────────────

export interface RecencyStyleConfig {
  label: string
  dotColor: string
  bgColor: string
  textColor: string
  fillColor: string
  /** True for prospecting's outlined dot (ring, no fill). */
  dotOutline?: boolean
}

export const SCHOOL_RECENCY_STYLE: Record<SchoolRecencyState, RecencyStyleConfig> = {
  hot:         { label: 'Awaiting Finn', dotColor: '#D03A2E', bgColor: '#FBEAE8', textColor: '#7A1E16', fillColor: '#D03A2E' },
  active:      { label: 'Active',        dotColor: '#00B2A9', bgColor: '#D7F0ED', textColor: '#006A65', fillColor: '#00B2A9' },
  cooling:     { label: 'Cooling',       dotColor: '#E8A33C', bgColor: '#FCF0DB', textColor: '#7A4F0E', fillColor: '#E8A33C' },
  cold:        { label: 'Cold',          dotColor: '#9CA3A8', bgColor: '#EFF1F3', textColor: '#5A6168', fillColor: '#9CA3A8' },
  prospecting: { label: 'Prospecting',   dotColor: '#9CA3A8', bgColor: '#F7F6F2', textColor: '#7A7570', fillColor: '#FFFFFF', dotOutline: true },
  declined:    { label: 'Declined',      dotColor: '#9CA3A8', bgColor: '#EFF1F3', textColor: '#9CA3A8', fillColor: '#9CA3A8' },
}

/** All state values in display order (for filter chips). */
export const RECENCY_STATE_ORDER: SchoolRecencyState[] = [
  'hot', 'active', 'cooling', 'cold', 'prospecting', 'declined',
]

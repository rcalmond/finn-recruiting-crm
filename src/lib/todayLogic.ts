import type { School, ContactLogEntry, ActionItem } from './types'
import type { EmailType } from './prompts'
import { daysBetween, todayStr } from './utils'

// ─── Unreplied inbound detection ─────────────────────────────────────────────

/** Returns false for inbounds that are currently snoozed or permanently dismissed. */
function isActiveInbound(entry: ContactLogEntry): boolean {
  if (entry.dismissed_at) return false
  if (entry.snoozed_until && entry.snoozed_until > new Date().toISOString()) return false
  return true
}

/**
 * Returns all inbound contact_log entries that have no subsequent outbound
 * entry for the same school, excluding snoozed and dismissed entries.
 * Sorted oldest first (longest-waiting first).
 */
export function getUnrepliedInbounds(log: ContactLogEntry[]): ContactLogEntry[] {
  // Build per-school lookup
  const bySchool = new Map<string, ContactLogEntry[]>()
  for (const e of log) {
    if (!bySchool.has(e.school_id)) bySchool.set(e.school_id, [])
    bySchool.get(e.school_id)!.push(e)
  }

  const unreplied: ContactLogEntry[] = []
  Array.from(bySchool.values()).forEach(entries => {
    entries.filter(e => e.direction === 'Inbound' && isActiveInbound(e)).forEach(inbound => {
      const hasOutboundAfter = entries.some(
        e => e.direction === 'Outbound' && e.date > inbound.date
      )
      if (!hasOutboundAfter) unreplied.push(inbound)
    })
  })

  return unreplied.sort((a, b) => a.date.localeCompare(b.date))
}

// ─── Going cold detection ────────────────────────────────────────────────────

export interface ColdCandidate {
  school: School
  inbound: ContactLogEntry
  daysWaiting: number
}

/**
 * Returns up to 3 schools (category A or B) with an unreplied inbound
 * that is 5+ days old. Sorted by days waiting descending.
 */
export function getGoingColdSchools(
  log: ContactLogEntry[],
  schools: School[]
): ColdCandidate[] {
  const schoolMap = new Map(schools.map(s => [s.id, s]))
  const unreplied = getUnrepliedInbounds(log)

  return unreplied
    .filter(e => {
      const school = schoolMap.get(e.school_id)
      if (!school) return false
      if (!['A', 'B'].includes(school.category)) return false
      return daysBetween(e.date) >= 5
    })
    .map(e => ({
      school: schoolMap.get(e.school_id)!,
      inbound: e,
      daysWaiting: daysBetween(e.date),
    }))
    .sort((a, b) => b.daysWaiting - a.daysWaiting)
    .slice(0, 3)
}

// ─── This week action items ───────────────────────────────────────────────────

/**
 * Returns ALL action items that are overdue or due within the next 7 days.
 * Sort: overdue first (oldest due_date first), then today, then ascending due_date.
 * Callers are responsible for applying any display cap.
 */
export function getThisWeekItems(actionItems: ActionItem[], today: string): ActionItem[] {
  const weekEnd = new Date(today)
  weekEnd.setDate(weekEnd.getDate() + 7)
  // Build weekEndStr using local date arithmetic to avoid UTC midnight offset
  const [y, m, d] = today.split('-').map(Number)
  const weekEndDate = new Date(y, m - 1, d + 7)
  const weekEndStr = [
    weekEndDate.getFullYear(),
    String(weekEndDate.getMonth() + 1).padStart(2, '0'),
    String(weekEndDate.getDate()).padStart(2, '0'),
  ].join('-')

  const filtered = actionItems.filter(i => i.due_date != null && i.due_date <= weekEndStr)

  return filtered.sort((a, b) => {
    const aOver = a.due_date! < today
    const bOver = b.due_date! < today
    if (aOver && !bOver) return -1
    if (!aOver && bOver) return 1
    return a.due_date!.localeCompare(b.due_date!)
  })
}

// ─── Classification filter (Phase 1) ─────────────────────────────────────────

/**
 * Returns true if a classified inbound warrants a reply from Finn.
 * Conservative: unclassified rows (classified_at == null) are included
 * so nothing disappears before the backfill or live-hook has run.
 *
 * Filtered OUT:
 *   - team_automated or staff_non_coach authors (regardless of intent)
 *   - informational, acknowledgement, or decline intent
 *   - requires_action intent (camp invites, questionnaire requests — not a reply)
 */
function isActionableReply(e: ContactLogEntry): boolean {
  if (!e.classified_at) return true   // unclassified: include conservatively

  const { authored_by, intent } = e

  // Non-coach/non-human senders never need a reply
  if (authored_by === 'team_automated' || authored_by === 'staff_non_coach') return false

  // These intents never require Finn to write back
  if (intent === 'informational' || intent === 'acknowledgement' || intent === 'decline') return false

  // Camp invites, questionnaire requests, etc. are handled via action items
  if (intent === 'requires_action') return false

  return true
}

// ─── Filtered awaiting replies (for Section 2 display) ───────────────────────

/**
 * Returns unreplied inbounds filtered for display in the Awaiting section.
 * Noise-reduction rules:
 *   - Phase 1 classification filter: exclude non-actionable rows (see isActionableReply)
 *   - Always include: inbound within last 30 days (any category)
 *   - Include: A/B school inbounds up to 90 days old
 *   - Exclude: anything older than 90 days
 *   - Exclude: C/Nope school inbounds older than 30 days
 * Sorted oldest first.
 */
export function getFilteredAwaitingReplies(
  log: ContactLogEntry[],
  schools: School[]
): ContactLogEntry[] {
  const schoolMap = new Map(schools.map(s => [s.id, s]))
  const unreplied = getUnrepliedInbounds(log)

  return unreplied.filter(e => {
    // Phase 1: classification axis filter
    if (!isActionableReply(e)) return false

    const daysOld = daysBetween(e.date)
    if (daysOld > 90) return false
    if (daysOld <= 30) return true
    const school = schoolMap.get(e.school_id)
    return !!(school && ['A', 'B'].includes(school.category))
  })
}

// ─── Featured action ranking ──────────────────────────────────────────────────

export type FeaturedActionType = 'inbound_reply' | 'action_item' | 'going_cold'

export interface FeaturedAction {
  type: FeaturedActionType
  /** Big italic headline shown in the hero */
  title: string
  /** One-line context tagline */
  context: string
  /** CTA label */
  ctaLabel: string
  /** Email type to open if this triggers DraftEmailModal */
  emailType: EmailType
  school: School
  actionItem?: ActionItem
  inboundEntry?: ContactLogEntry
}

function tomorrowStr(today: string): string {
  const d = new Date(today)
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

function schoolLabel(s: School) {
  return s.short_name || s.name
}

function coachLabel(e: ContactLogEntry, s: School) {
  return e.coach_name || s.head_coach || 'the coach'
}

/**
 * Returns the highest-priority featured action for the Today hero.
 *
 * Priority order:
 * 1. Schools with overdue action_items AND unreplied inbound
 *    (sorted by most recent inbound date — warmest lead first)
 * 2. Schools with overdue action_items only (no inbound)
 *    (sorted by oldest due_date — most overdue first)
 * 3. Schools with unreplied inbound 5+ days old, category A or B
 *    (sorted by most recent inbound — cooling fastest)
 * 4. Actions due today
 * 5. Actions due tomorrow
 */
export function getRankedFeaturedAction(
  actionItems: ActionItem[],
  contactLog: ContactLogEntry[],
  schools: School[],
  today: string = todayStr()
): FeaturedAction | null {
  const schoolMap = new Map(schools.map(s => [s.id, s]))
  const tomorrow = tomorrowStr(today)

  const unreplied = getUnrepliedInbounds(contactLog)
  const unrepliedBySchool = new Map(unreplied.map(e => [e.school_id, e]))

  const overdueItems = actionItems.filter(i => i.due_date && i.due_date < today)

  // ── Priority 1: overdue action + unreplied inbound ────────────────────────
  // Collect ALL candidates, then sort by most recent inbound date (warmest first)
  type P1Candidate = { item: ActionItem; inbound: ContactLogEntry; school: School }
  const p1: P1Candidate[] = []

  overdueItems.forEach(item => {
    const inbound = unrepliedBySchool.get(item.school_id)
    const school = schoolMap.get(item.school_id)
    if (inbound && school) p1.push({ item, inbound, school })
  })

  if (p1.length > 0) {
    // Most recent inbound date first — warmest lead wins ties
    p1.sort((a, b) => b.inbound.date.localeCompare(a.inbound.date))
    const { item, inbound, school } = p1[0]
    const overdueDays = daysBetween(item.due_date!)
    return {
      type: 'inbound_reply',
      title: `Reply to ${coachLabel(inbound, school)}.`,
      context: `${overdueDays} day${overdueDays !== 1 ? 's' : ''} overdue — warm inbound from ${schoolLabel(school)}`,
      ctaLabel: 'Draft reply',
      emailType: 'reply',
      school,
      actionItem: item,
      inboundEntry: inbound,
    }
  }

  // ── Priority 2: overdue action only (no inbound) ──────────────────────────
  // Oldest due_date first (most overdue)
  const p2 = overdueItems
    .filter(i => !unrepliedBySchool.has(i.school_id))
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))

  for (const item of p2) {
    const school = schoolMap.get(item.school_id)
    if (school) {
      const overdueDays = daysBetween(item.due_date!)
      return {
        type: 'action_item',
        title: item.action,
        context: `${overdueDays} day${overdueDays !== 1 ? 's' : ''} overdue — ${schoolLabel(school)}`,
        ctaLabel: 'Mark complete',
        emailType: 'follow_up',
        school,
        actionItem: item,
      }
    }
  }

  // ── Priority 3: unreplied inbound 5+ days, A/B schools ───────────────────
  // Most recent inbound first (thread cooling fastest)
  const p3 = unreplied
    .filter(e => {
      const school = schoolMap.get(e.school_id)
      return school && ['A', 'B'].includes(school.category) && daysBetween(e.date) >= 5
    })
    .sort((a, b) => b.date.localeCompare(a.date))

  for (const e of p3) {
    const school = schoolMap.get(e.school_id)!
    const days = daysBetween(e.date)
    return {
      type: 'going_cold',
      title: `Follow up with ${schoolLabel(school)}.`,
      context: `No reply in ${days} day${days !== 1 ? 's' : ''} — thread going cold`,
      ctaLabel: 'Draft follow-up',
      emailType: 'follow_up',
      school,
      inboundEntry: e,
    }
  }

  // ── Priority 4: due today ─────────────────────────────────────────────────
  const dueToday = actionItems.filter(i => i.due_date === today)
  for (const item of dueToday) {
    const school = schoolMap.get(item.school_id)
    if (school) {
      const inbound = unrepliedBySchool.get(item.school_id)
      if (inbound) {
        return {
          type: 'inbound_reply',
          title: `Reply to ${coachLabel(inbound, school)}.`,
          context: `Due today — warm inbound from ${schoolLabel(school)}`,
          ctaLabel: 'Draft reply',
          emailType: 'reply',
          school,
          actionItem: item,
          inboundEntry: inbound,
        }
      }
      return {
        type: 'action_item',
        title: item.action,
        context: `Due today — ${schoolLabel(school)}`,
        ctaLabel: 'Mark complete',
        emailType: 'follow_up',
        school,
        actionItem: item,
      }
    }
  }

  // ── Priority 5: due tomorrow ──────────────────────────────────────────────
  const dueTomorrow = actionItems.filter(i => i.due_date === tomorrow)
  for (const item of dueTomorrow) {
    const school = schoolMap.get(item.school_id)
    if (school) {
      return {
        type: 'action_item',
        title: item.action,
        context: `Due tomorrow — ${schoolLabel(school)}`,
        ctaLabel: 'Mark complete',
        emailType: 'follow_up',
        school,
        actionItem: item,
      }
    }
  }

  return null
}

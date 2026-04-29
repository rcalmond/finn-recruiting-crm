/**
 * today-scoring.ts
 *
 * Computes a unified priority score for Today's tactical zone.
 * Merges inbound-awaiting, going-cold, and action-item signals
 * into a single ranked list. Top 3 items surface in TacticalSection.
 */

import type { School, ContactLogEntry, ActionItem } from './types'
import { daysBetween } from './utils'
import { isAwaitingReply, isTargetTier } from './awaiting-reply'

// ─── Types ───────────────────────────────────────────────────────────────────

export type TacticalItemType = 'inbound_awaiting' | 'going_cold' | 'action_item'

export interface TacticalItem {
  type: TacticalItemType
  score: number
  entry?: ContactLogEntry   // for inbound_awaiting and going_cold
  actionItem?: ActionItem   // for action_item
  school: School
  daysWaiting?: number
  coachName?: string | null
}

// ─── Scoring constants ───────────────────────────────────────────────────────

const BASE: Record<string, number> = {
  inbound_awaiting: 10,
  going_cold: 8,
  action_overdue: 12,
  action_due_today: 8,
  action_due_tomorrow: 5,
}

const TIER_MULT: Record<string, number> = {
  A: 2.0,
  B: 1.5,
  C: 1.0,
}

const INTENT_MULT: Record<string, number> = {
  requires_reply: 1.0,
  requires_action: 1.0,
  informational: 0.3,
  acknowledgement: 0.5,
  decline: 0,
}

function decayFactor(days: number): number {
  if (days <= 30) return 1.0
  if (days <= 60) return 0.7
  if (days <= 90) return 0.4
  return 0.2
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

/** Convert sent_at to Mountain date for daysBetween. */
function sentAtToMountainDate(sentAt: string): string {
  return new Date(sentAt).toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
}

function scoreInbound(
  entry: ContactLogEntry,
  school: School,
  type: 'inbound_awaiting' | 'going_cold'
): TacticalItem | null {
  const tierMult = TIER_MULT[school.category]
  if (tierMult === undefined) return null // Nope/null filtered

  const days = daysBetween(sentAtToMountainDate(entry.sent_at))

  // going_cold requires A/B tier + 5+ days
  if (type === 'going_cold') {
    if (school.category !== 'A' && school.category !== 'B') return null
    if (days < 5) return null
  }

  const base = BASE[type]
  const intentMult = INTENT_MULT[entry.intent ?? 'unknown'] ?? 1.0
  // decline intent = 0 multiplier → score 0 → excluded
  if (intentMult === 0) return null

  const decay = decayFactor(days)
  const daysBonus = Math.min(days, 20)
  const score = base * tierMult * intentMult * decay + daysBonus

  return {
    type,
    score,
    entry,
    school,
    daysWaiting: days,
    coachName: entry.coach_name,
  }
}

function scoreActionItem(
  item: ActionItem,
  school: School,
  today: string
): TacticalItem | null {
  const tierMult = TIER_MULT[school.category]
  if (tierMult === undefined) return null

  if (!item.due_date) return null

  let base: number
  if (item.due_date < today) {
    base = BASE.action_overdue
  } else if (item.due_date === today) {
    base = BASE.action_due_today
  } else {
    // Check if due tomorrow
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]
    if (item.due_date === tomorrowStr) {
      base = BASE.action_due_tomorrow
    } else {
      return null // not urgent enough for top 3
    }
  }

  const score = base * tierMult

  return {
    type: 'action_item',
    score,
    actionItem: item,
    school,
  }
}

// ─── Top 3 selector ──────────────────────────────────────────────────────────

/**
 * Returns the top 3 tactical items across all signal types, sorted by score.
 * Tiebreaker: inbound_awaiting > going_cold > action_item,
 * then oldest sent_at/due_date first.
 */
export function getTactical3(
  contactLog: ContactLogEntry[],
  schools: School[],
  actionItems: ActionItem[],
  today: string
): TacticalItem[] {
  const schoolMap = new Map(schools.map(s => [s.id, s]))
  const items: TacticalItem[] = []

  // Build per-school entry map for isAwaitingReply
  const bySchool = new Map<string, ContactLogEntry[]>()
  for (const e of contactLog) {
    if (!e.school_id) continue
    if (!bySchool.has(e.school_id)) bySchool.set(e.school_id, [])
    bySchool.get(e.school_id)!.push(e)
  }

  // Track which schools already have an inbound_awaiting item to avoid double-counting
  const schoolsWithAwaiting = new Set<string>()

  // Score inbound-awaiting entries
  Array.from(bySchool.entries()).forEach(([schoolId, entries]) => {
    const school = schoolMap.get(schoolId)
    if (!school || !isTargetTier(school)) return

    const awaiting = entries.filter((e: ContactLogEntry) =>
      e.direction === 'Inbound' && isAwaitingReply(e, entries)
    )

    if (awaiting.length > 0) {
      // Use the most recent unreplied inbound per school
      const mostRecent = awaiting.sort((a: ContactLogEntry, b: ContactLogEntry) => b.sent_at.localeCompare(a.sent_at))[0]
      const days = daysBetween(sentAtToMountainDate(mostRecent.sent_at))

      // Determine type: going_cold (A/B + 5+ days) or inbound_awaiting
      const type: TacticalItemType =
        days >= 5 && (school.category === 'A' || school.category === 'B')
          ? 'going_cold'
          : 'inbound_awaiting'

      const scored = scoreInbound(mostRecent, school, type)
      if (scored) {
        items.push(scored)
        schoolsWithAwaiting.add(schoolId)
      }
    }
  })

  // Score action items (only for schools NOT already represented by an awaiting inbound)
  for (const item of actionItems) {
    if (schoolsWithAwaiting.has(item.school_id)) continue
    const school = schoolMap.get(item.school_id)
    if (!school) continue
    const scored = scoreActionItem(item, school, today)
    if (scored) items.push(scored)
  }

  // Sort by score descending, with tiebreakers
  const TYPE_PRIORITY: Record<TacticalItemType, number> = {
    inbound_awaiting: 0,
    going_cold: 1,
    action_item: 2,
  }

  items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    // Tiebreaker 1: type priority
    if (TYPE_PRIORITY[a.type] !== TYPE_PRIORITY[b.type]) {
      return TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type]
    }
    // Tiebreaker 2: oldest first (most days waiting / earliest due)
    if (a.entry && b.entry) return a.entry.sent_at.localeCompare(b.entry.sent_at)
    if (a.actionItem && b.actionItem) return (a.actionItem.due_date ?? '').localeCompare(b.actionItem.due_date ?? '')
    return 0
  })

  return items.slice(0, 3)
}

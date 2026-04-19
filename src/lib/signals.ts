import type { School, ContactLogEntry } from './types'
import { daysBetween } from './utils'

export interface Signal {
  kind: 'awaiting' | 'cold' | 'active'
  text: string
}

/** Normalise any date string to YYYY-MM-DD so timestamp variants don't
 *  corrupt string comparisons (e.g. "2025-04-15T14:30:00" > "2025-04-15"
 *  evaluates to true in JS even though they represent the same day). */
function toDateStr(raw: string): string {
  return raw.slice(0, 10)
}

/** Returns false for inbounds that are currently snoozed or permanently dismissed. */
function isActiveInbound(entry: ContactLogEntry): boolean {
  if (entry.dismissed_at) return false
  if (entry.snoozed_until && entry.snoozed_until > new Date().toISOString()) return false
  return true
}

/**
 * Derives the signal pill for a school based on its contact log entries.
 *
 * Priority order (first match wins):
 *
 * 1. "Going cold · Xd" (gold)
 *    — unreplied inbound ≥ 5 days old, category A or B only.
 *    "Unreplied" means no outbound exists with a strictly later date.
 *
 * 2. "Awaiting reply · Xd" (teal)
 *    — any other unreplied inbound (any age, any category).
 *
 * 3. "Active" (teal)
 *    — only if there are ZERO unreplied inbounds AND:
 *      · the chronologically last contact is an outbound (we responded)
 *      · that outbound is within 14 days
 *      · at least one inbound exists (back-and-forth confirmed)
 *      · category A or B only.
 *
 * Returns null if none of the above conditions are met.
 */
export function deriveSignal(
  school: Pick<School, 'id' | 'category'>,
  contactLog: ContactLogEntry[]
): Signal | null {
  const schoolLog = contactLog.filter(e => e.school_id === school.id)
  if (schoolLog.length === 0) return null

  const inbounds  = schoolLog.filter(e => e.direction === 'Inbound' && isActiveInbound(e))
  const outbounds = schoolLog.filter(e => e.direction === 'Outbound')

  // ── Unreplied inbound detection ──────────────────────────────────────────────
  // An inbound is unreplied when no outbound has a strictly later date.
  // Dates are normalised to YYYY-MM-DD before comparison.
  const unreplied = inbounds.filter(inbound => {
    const inboundDate = toDateStr(inbound.date)
    return !outbounds.some(out => toDateStr(out.date) > inboundDate)
  })

  if (unreplied.length > 0) {
    // Use the most recent unreplied inbound — that's what Finn actually needs
    // to respond to. Older unreplied entries (e.g. a coach who wrote months ago)
    // are historical noise and shouldn't drive the day count.
    const mostRecent = unreplied
      .slice()
      .sort((a, b) => toDateStr(b.date).localeCompare(toDateStr(a.date)))[0]
    const days = daysBetween(toDateStr(mostRecent.date))

    // Priority 1: Going cold — 5+ days, A or B only
    if (days >= 5 && (school.category === 'A' || school.category === 'B')) {
      return { kind: 'cold', text: `Going cold · ${days}d` }
    }

    // Priority 2: Awaiting reply — any other unreplied inbound
    return { kind: 'awaiting', text: `Awaiting reply · ${days}d` }
  }

  // ── Active check ─────────────────────────────────────────────────────────────
  // Only reached when there are zero unreplied inbounds.
  // Requires two-way contact: the last logged entry must be an outbound
  // (meaning we responded), within 14 days, with at least one inbound on record.
  if (school.category === 'A' || school.category === 'B') {
    if (inbounds.length > 0 && outbounds.length > 0) {
      // Sort all entries by date desc to find the most recent contact.
      const last = schoolLog
        .slice()
        .sort((a, b) => toDateStr(b.date).localeCompare(toDateStr(a.date)))[0]

      if (last.direction === 'Outbound' && daysBetween(toDateStr(last.date)) <= 14) {
        return { kind: 'active', text: 'Active' }
      }
    }
  }

  return null
}

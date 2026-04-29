/**
 * awaiting-reply.ts
 *
 * Shared helpers for determining which inbound contact_log entries
 * are currently awaiting Finn's reply. Used by both signals.ts
 * (school detail pills) and todayLogic.ts (Today page sections).
 */

import type { School, ContactLogEntry } from './types'

/**
 * Returns true if this inbound entry is currently awaiting Finn's reply.
 *
 * Conditions:
 * - Channel is Email or Sports Recruits (phone/text/in-person don't need replies)
 * - Not permanently dismissed
 * - Not currently snoozed (or snooze has expired)
 * - No outbound exists with a later sent_at for the same school
 */
export function isAwaitingReply(
  inbound: ContactLogEntry,
  allEntriesForSchool: ContactLogEntry[]
): boolean {
  // Channel filter: only email-channel inbounds trigger reply expectations
  if (inbound.channel !== 'Email' && inbound.channel !== 'Sports Recruits') return false

  // Handled (Done from Today), dismissed, or snoozed
  if (inbound.handled_at) return false
  if (inbound.dismissed_at) return false
  if (inbound.snoozed_until && inbound.snoozed_until > new Date().toISOString()) return false

  // Check if any outbound (email-channel only) has a later sent_at
  const hasOutboundAfter = allEntriesForSchool.some(e =>
    e.direction === 'Outbound' &&
    (e.channel === 'Email' || e.channel === 'Sports Recruits') &&
    e.sent_at > inbound.sent_at
  )

  return !hasOutboundAfter
}

/**
 * Returns true if the school is a target tier (A, B, or C).
 * Nope, null, and any other value return false.
 */
export function isTargetTier(school: Pick<School, 'category'>): boolean {
  return school.category === 'A' || school.category === 'B' || school.category === 'C'
}

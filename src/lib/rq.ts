// ─── Recruiting Questionnaire (RQ) lifecycle ─────────────────────────────────
//
// Single source of truth for how an RQ is bucketed and how the RQ fields are
// written. Both the Questionnaires workbench (/questionnaires) and the school
// detail RQ block route through here so the two surfaces can never disagree on
// what "current", "needs an update", or "not started" means — or on what
// "Mark completed" / "Mark updated" / "Set date" actually write.
//
// Built on the EXISTING schema fields — no parallel columns:
//   rq_status      text        — "Completed" is the only value that counts as done
//   rq_updated_at  timestamptz — completion / last-refresh timestamp
//   rq_link        text        — the questionnaire URL
//
// An RQ is "current" if it was completed within RQ_STALE_DAYS.

import type { School } from '@/lib/types'

export const RQ_STALE_DAYS = 180

export type RqBucket = 'not_started' | 'needs_update' | 'current'

type RqFields = Pick<School, 'rq_status' | 'rq_updated_at' | 'rq_link'>

/** Only "Completed" counts as done — "To Do" / "Updated" / null do not. */
export function isRqCompleted(s: RqFields): boolean {
  return s.rq_status === 'Completed'
}

/** Whole days since the RQ was last completed/refreshed, or null if no date. */
export function rqAgeDays(s: RqFields, now: number = Date.now()): number | null {
  if (!s.rq_updated_at) return null
  return Math.floor((now - new Date(s.rq_updated_at).getTime()) / 86400000)
}

/**
 * Lifecycle bucket:
 *   not_started  — not completed
 *   needs_update — completed but stale (> RQ_STALE_DAYS) OR completed with no date
 *   current      — completed within RQ_STALE_DAYS
 */
export function rqBucket(s: RqFields, now: number = Date.now()): RqBucket {
  if (!isRqCompleted(s)) return 'not_started'
  const age = rqAgeDays(s, now)
  if (age === null || age > RQ_STALE_DAYS) return 'needs_update'
  return 'current'
}

export interface RqSummary {
  total: number
  current: number
  needsUpdate: number
  notStarted: number
}

/** Roll a set of schools up into the counts the card metric and the page share. */
export function summarizeRq(schools: RqFields[], now: number = Date.now()): RqSummary {
  const s: RqSummary = { total: schools.length, current: 0, needsUpdate: 0, notStarted: 0 }
  for (const school of schools) {
    const b = rqBucket(school, now)
    if (b === 'current') s.current++
    else if (b === 'needs_update') s.needsUpdate++
    else s.notStarted++
  }
  return s
}

// ─── Write patches ───────────────────────────────────────────────────────────
// Both surfaces feed these into useSchools().updateSchool() — the one write
// path — so the field semantics live in exactly one place.

/** "Mark completed": set status to Completed and stamp the date now. */
export function rqMarkCompletedPatch(now: string = new Date().toISOString()): Partial<School> {
  return { rq_status: 'Completed', rq_updated_at: now }
}

/** "Mark updated": bump the completion date to now (status unchanged). */
export function rqMarkUpdatedPatch(now: string = new Date().toISOString()): Partial<School> {
  return { rq_updated_at: now }
}

/** "Set date": backfill a known completion date onto a dateless completed RQ. */
export function rqSetDatePatch(isoDate: string): Partial<School> {
  return { rq_updated_at: isoDate }
}

/** Save (or clear) the RQ link. Empty/whitespace clears it. */
export function rqSetLinkPatch(url: string): Partial<School> {
  return { rq_link: url.trim() || null }
}

/** Google finder for a school with no link on file. */
export function rqSearchUrl(schoolName: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${schoolName} men's soccer recruiting questionnaire`)}`
}

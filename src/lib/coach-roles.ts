/**
 * coach-roles.ts — THE ONE DEFINITION OF WHAT A COACH ROLE IS.
 *
 * The vocabulary was defined in EIGHT places and they had drifted:
 *   1. the coaches_role_check CHECK constraint
 *   2. types.ts               — a CoachRole union
 *   3. coach-scraper.ts       — a SECOND, independent CoachRole union
 *   4. coach-scraper.ts       — VALID_ROLES
 *   5. coach-scraper.ts       — the extraction prompt, as prose literals
 *   6. coach-scraper.ts       — normalizeRole's mapping
 *   7. SchoolModal.tsx        — COACH_ROLES for the picker
 *   8. api/gmail-partials/[id] — VALID_ROLES, which offered THREE values the
 *                                CHECK rejects and omitted TWO it permits
 * (plus a ninth in scripts/backfill-coaches.ts, with its own normalizeRole —
 *  see the note at the foot of this file.)
 *
 * Two independent unions meant the compiler could not catch a divergence
 * between the scraper and the app, and prose literals in the extraction prompt
 * meant it could not catch one between the app and the model either. That is
 * why gmail-partials could offer 'Goalkeeper Coach' for months while the
 * database rejected it on every insert.
 *
 * THE ORDER OF ANY CHANGE IS FIXED, and it is the reverse of this project's
 * usual code-before-schema rule:
 *
 *   1. WIDEN THE CHECK FIRST. Adding a value here before the constraint
 *      permits it ships the exact bug this file exists to close — a picker
 *      offering something every insert will reject.
 *   2. THEN add it to COACH_ROLES, which is the only edit the code needs.
 *
 * Narrowing runs the other way: remove it here, confirm zero rows carry it,
 * and only then tighten the constraint.
 */

/**
 * The vocabulary. Order is display order in every picker.
 *
 * DELIBERATELY FLAT rather than seniority × interim. Modelling 'interim' as a
 * separate boolean is the better shape and is recorded as a decision NOT taken
 * — see Designed But Not Built in Section 9. The flat list is what ships.
 */
export const COACH_ROLES = [
  'Head Coach',
  'Interim Head Coach',
  'Associate Head Coach',
  'Assistant Coach',
  'Interim Assistant Coach',
  'Other',
] as const

export type CoachRole = typeof COACH_ROLES[number]

/** Runtime guard for anything crossing an API boundary. */
export function isCoachRole(value: unknown): value is CoachRole {
  return typeof value === 'string' && (COACH_ROLES as readonly string[]).includes(value)
}

/**
 * Map arbitrary roster-page text onto the vocabulary.
 *
 * Anything unrecognised becomes 'Other' — which is why eight coaches sit in
 * 'Other' today, most of them goalkeeper coaches. That is a vocabulary gap
 * being papered over, not a classification success; widening the list is what
 * fixes it, not loosening this function.
 */
export function normalizeRole(raw: string): CoachRole {
  if (isCoachRole(raw)) return raw

  const lower = raw.toLowerCase().trim()
  if (lower.includes('interim') && lower.includes('head'))      return 'Interim Head Coach'
  if (lower.includes('interim') && lower.includes('assistant')) return 'Interim Assistant Coach'
  if (lower.includes('associate') || lower.includes('co-head')) return 'Associate Head Coach'
  if (lower.includes('head'))                                    return 'Head Coach'
  if (lower.includes('assistant') || lower.includes('first'))   return 'Assistant Coach'
  return 'Other'
}

/**
 * The role list as the extraction prompt states it. Generated, never typed out
 * a second time — a prompt listing roles as prose is a definition point the
 * compiler cannot see, and it was one of the eight.
 */
export function coachRolesForPrompt(indent = '            '): string {
  return COACH_ROLES.map(r => `${indent}"${r}"`).join('\n')
}

/*
 * NOT CONVERTED, deliberately: scripts/backfill-coaches.ts carries its own
 * union and its own normalizeRole whose signature differs (it returns a
 * needsReview flag alongside the role). It is a one-shot backfill that has
 * already run, scripts/ is excluded from tsconfig so any edit there is
 * unverifiable by the compiler, and changing it buys nothing today. It is the
 * ninth definition point and belongs to the scripts-into-tsconfig chunk.
 */

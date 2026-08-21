/**
 * coach-primary.ts — WHO THE FAMILY TALKS TO AT A SCHOOL.
 *
 * The E2 private layer (chunk F1) moved this fact off the coach row and onto
 * the family's relationship row: schools.primary_coach_id. coaches.is_primary
 * still exists and still carries the same answer — F1 v2 backfilled 65 of 65
 * Almond schools from it, exact match — and it drops at the catalog re-point.
 *
 * READS ACCEPT BOTH AND CONSULT NO FLAG. That is the E1.5 property: a read
 * gated on a migration flag breaks the moment flag and schema disagree, and
 * during a deploy window they will. The column wins wherever it is set; the
 * legacy boolean fills in where it is null — a school added after the backfill,
 * or any family whose rows predate the column (Testerson's 16 today).
 *
 * WRITES SET BOTH, and must, for exactly as long as reads prefer the column.
 * A setPrimary that wrote only is_primary would leave primary_coach_id pointing
 * at the PREVIOUS coach, and the preference would then render the stale answer
 * — a regression created by the read change, not by the schema.
 *
 * THE COMPOSED FIELD IS DELIBERATELY NAMED isPrimary, NOT is_primary. The
 * rename is the mechanism, not cosmetics: it turns every consumer of the old
 * row field into a compile error, so the population that has to change is
 * enumerated by tsc rather than by a grep. (A grep enumerates the hypothesis;
 * the E2 recon named 16 of ~40 sites and missed the entire generator surface.)
 *
 *   A DATABASE ROW keeps is_primary.  A COMPOSED VIEW carries isPrimary.
 *   An object holding both means the two have been mixed.
 */

/** The family's relationship row. Only the pointer is needed here. */
export interface PrimaryBearingSchool {
  primary_coach_id?: string | null
}

/** Any coach row or view with an id and (optionally) the legacy flag. */
export interface PrimaryBearingCoach {
  id: string
  is_primary?: boolean | null
}

/**
 * The single primary coach WITHIN THE GIVEN LIST, or null.
 *
 * Resolution is deliberately scoped to the list the caller passes, because
 * callers filter differently and the answer must match what they will render.
 * Penn and Wentworth both point at a coach who has since departed: over an
 * active-only list this returns null and the caller's head-coach fallback takes
 * over, which is exactly what happens today; over the full roster it returns
 * that coach, which is also what happens today.
 */
export function resolvePrimaryCoachId<C extends PrimaryBearingCoach>(
  school: PrimaryBearingSchool | null | undefined,
  coaches: readonly C[],
): string | null {
  const pointed = school?.primary_coach_id ?? null
  if (pointed && coaches.some(c => c.id === pointed)) return pointed
  // Column unset, or pointing outside this list. The legacy boolean answers the
  // same question against the same list, so behaviour is unchanged either way.
  return coaches.find(c => c.is_primary === true)?.id ?? null
}

/** Attach isPrimary to every coach in the list. At most one is true. */
export function withPrimary<C extends PrimaryBearingCoach>(
  school: PrimaryBearingSchool | null | undefined,
  coaches: readonly C[],
): Array<C & { isPrimary: boolean }> {
  const primaryId = resolvePrimaryCoachId(school, coaches)
  return coaches.map(c => ({ ...c, isPrimary: c.id === primaryId }))
}

/**
 * Stable primary-first ordering, replacing the DB-side
 * .order('is_primary', { ascending: false }) that cannot survive the column's
 * removal. Array#sort is stable in every engine we target, so the caller's
 * existing secondary ordering is preserved.
 */
export function primaryFirst<C extends { isPrimary: boolean }>(coaches: readonly C[]): C[] {
  return [...coaches].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
}

/**
 * Does this school already have a designated primary? Used by the insert paths
 * that promote a new Head Coach only when none exists yet.
 * Checks BOTH domains — a school whose pointer is set but whose coach rows all
 * carry is_primary=false already has one.
 */
export function hasPrimary<C extends PrimaryBearingCoach>(
  school: PrimaryBearingSchool | null | undefined,
  coaches: readonly C[],
): boolean {
  return resolvePrimaryCoachId(school, coaches) !== null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from: (t: string) => any }

/**
 * Server-side "does this school already have a primary?", asking both domains
 * in one place. The three insert paths (roster scraper, coach-changes apply,
 * gmail-partials create-and-link) each used to ask only coaches.is_primary; a
 * school whose pointer was set would have read as having none and the next
 * scraped Head Coach would have been promoted over the family's own choice.
 */
export async function schoolHasPrimary(db: Db, schoolId: string): Promise<boolean> {
  const { data: school } = await db
    .from('schools').select('primary_coach_id').eq('id', schoolId).maybeSingle()
  if ((school as { primary_coach_id: string | null } | null)?.primary_coach_id) return true

  const { data: flagged } = await db
    .from('coaches').select('id').eq('school_id', schoolId).eq('is_primary', true).limit(1)
  return ((flagged as unknown[] | null)?.length ?? 0) > 0
}

/**
 * Batch resolution for the pickers: schoolId → primary coachId, for the ACTIVE
 * roster only. Replaces the `.eq('is_primary', true)` filter that every
 * campaign picker used, which cannot survive the column's removal and, while
 * both domains exist, answers from the wrong one.
 *
 * Ordering is preserved from the original: among several flagged coaches the
 * lowest sort_order wins, so a school with stale duplicate flags picks the same
 * coach it picked before.
 */
export async function primaryCoachIdsBySchool(
  db: Db,
  schoolIds: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (schoolIds.length === 0) return out

  const { data: schoolRows } = await db
    .from('schools').select('id, primary_coach_id').in('id', schoolIds)
  const { data: coachRows } = await db
    .from('coaches').select('id, school_id, is_primary')
    .in('school_id', schoolIds)
    .eq('is_active', true)
    .order('sort_order', { ascending: true, nullsFirst: false })

  const bySchool = new Map<string, Array<{ id: string; school_id: string; is_primary: boolean }>>()
  for (const c of (coachRows ?? []) as Array<{ id: string; school_id: string; is_primary: boolean }>) {
    const list = bySchool.get(c.school_id)
    if (list) list.push(c)
    else bySchool.set(c.school_id, [c])
  }

  for (const s of (schoolRows ?? []) as Array<{ id: string; primary_coach_id: string | null }>) {
    const resolved = resolvePrimaryCoachId(s, bySchool.get(s.id) ?? [])
    if (resolved) out.set(s.id, resolved)
  }
  return out
}

/**
 * Point the family's relationship row at a coach. Called immediately after an
 * insert that designated one, so the pointer and the legacy flag never diverge
 * while both exist. Best-effort: the legacy flag on the inserted row already
 * carries the same answer, so a failure here degrades to the fallback path
 * rather than losing the designation.
 */
export async function designatePrimary(db: Db, schoolId: string, coachId: string): Promise<void> {
  const { error } = await db.from('schools').update({ primary_coach_id: coachId }).eq('id', schoolId)
  if (error) {
    console.warn(`[coach-primary] pointer write failed for school ${schoolId}: ${error.message} — ` +
      `coaches.is_primary still carries the designation, so reads fall back correctly.`)
  }
}

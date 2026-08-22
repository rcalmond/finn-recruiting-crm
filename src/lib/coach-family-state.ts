/**
 * coach-family-state.ts — WHAT A FAMILY THINKS ABOUT A COACH.
 *
 * The companion to coach-primary.ts. That module answers "who do we talk to";
 * this one answers "is this person relevant to us, and what have we written
 * about them". Both are family posture; neither survives on a shared roster row.
 *
 * HIDDEN IS NOT DEPARTED, and the distinction is the reason this table exists.
 *   coaches.is_active = false  — the SCRAPER says this person left the program.
 *                                Roster truth. Shared. Same for every family.
 *   coach_family_state.hidden_at — THIS FAMILY does not want to see them.
 *                                A preference. Says nothing about the world.
 * They were indistinguishable before: both were expressed by writing
 * coaches.archived_at, which is why 18 rows are currently is_active=false with
 * archived_at null and render in NEITHER the active roster NOR the archived
 * drawer — invisible, unreachable through the UI.
 *
 * READS ACCEPT BOTH DOMAINS, no flag: hidden means hidden_at is set OR the
 * legacy coaches.archived_at is set.
 *
 * WRITES GO ONLY TO hidden_at, and this deliberately breaks symmetry with
 * setPrimary's dual-write. The two cases differ in DIRECTION: primary_coach_id
 * and is_primary are both per-family today and the pointer stays per-family
 * afterwards, so writing both is safe. archived_at becomes CATALOG state at the
 * re-point (is_active and archived are SHARED, per the agreed split), so a
 * family-hide that also wrote archived_at would be putting family posture into
 * a column that is about to become everyone's truth. Rolling this code back
 * simply makes hidden coaches reappear — visible and recoverable, which is the
 * better failure.
 *
 * WHAT HIDING MEANS, per the rulings:
 *   - EXCLUDED from recipient pickers and from the primary rotation.
 *   - INCLUDED in generators and school-context, carrying the flag, because a
 *     hidden coach is still a fact about the roster: call prep should know the
 *     GK coach exists even if the family will never email him.
 *   - SHOWN, collapsed, as "Hidden by you (n)" — rendering the family's own
 *     choice is honest; silent absence would be the fabricated-default rule
 *     running in reverse.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from: (t: string) => any }

export interface CoachFamilyStateRow {
  coach_id: string
  notes: string | null
  hidden_at: string | null
}

/** Any coach row or view carrying the legacy hide column. */
export interface HideBearingCoach {
  id: string
  archived_at?: string | null
  notes?: string | null
}

export type CoachFamilyStateMap = Map<string, CoachFamilyStateRow>

/**
 * This family's state for the given coaches. Sparse by design: a family that
 * has never expressed anything about a coach stores no row, so an absent entry
 * is the default and not a missing one.
 *
 * The caller's client supplies the family scope — familyAdmin injects it
 * server-side, RLS enforces it on the user client. There is deliberately no
 * familyId parameter: a helper that took one could be handed the wrong one.
 */
export async function fetchCoachFamilyState(
  db: Db,
  coachIds: readonly string[],
): Promise<CoachFamilyStateMap> {
  const out: CoachFamilyStateMap = new Map()
  if (coachIds.length === 0) return out
  const { data } = await db
    .from('coach_family_state')
    .select('coach_id, notes, hidden_at')
    .in('coach_id', coachIds)
  for (const r of (data ?? []) as CoachFamilyStateRow[]) out.set(r.coach_id, r)
  return out
}

/**
 * Attach the family layer to a roster. `hidden` reads BOTH domains; `notes`
 * prefers the private layer and falls back to the legacy coaches.notes, which
 * still holds the same two rows and is unchanged.
 */
export function withFamilyState<C extends HideBearingCoach>(
  coaches: readonly C[],
  state: CoachFamilyStateMap,
): Array<C & { hidden: boolean; notes: string | null }> {
  return coaches.map(c => {
    const s = state.get(c.id)
    return {
      ...c,
      hidden: Boolean(s?.hidden_at) || Boolean(c.archived_at),
      notes: s?.notes ?? c.notes ?? null,
    }
  })
}

/** Recipient pickers and the primary rotation see neither hidden nor departed. */
export function selectableCoaches<C extends { hidden: boolean; is_active?: boolean }>(
  coaches: readonly C[],
): C[] {
  return coaches.filter(c => !c.hidden && c.is_active !== false)
}

/**
 * Hide a coach for this family, and surrender the primary designation if this
 * was the designated contact — hidden coaches are out of the rotation, so a
 * pointer left aimed at one would mean the school's contact is someone the
 * family has said they do not want to see.
 *
 * Returns whether the primary pointer was cleared, so the caller can say so.
 */
export async function hideCoach(
  db: Db,
  coachId: string,
  schoolId: string,
): Promise<{ error: { message: string } | null; clearedPrimary: boolean }> {
  const error = await setHiddenAt(db, coachId, new Date().toISOString())
  if (error) return { error, clearedPrimary: false }

  const { data: school } = await db
    .from('schools').select('primary_coach_id').eq('id', schoolId).maybeSingle()
  const wasPrimary = (school as { primary_coach_id: string | null } | null)?.primary_coach_id === coachId
  if (wasPrimary) {
    await db.from('schools').update({ primary_coach_id: null }).eq('id', schoolId)
  }
  return { error: null, clearedPrimary: wasPrimary }
}

/** Un-hide. Leaves notes intact — they are a different piece of posture. */
export async function unhideCoach(
  db: Db,
  coachId: string,
): Promise<{ error: { message: string } | null }> {
  return { error: await setHiddenAt(db, coachId, null) }
}

/**
 * Insert-or-update rather than upsert-with-onConflict, matching how
 * camp_family_status is written in camps.ts. family_id is NEVER supplied: on
 * insert it comes from the column DEFAULT (the app.current_family_id() helper),
 * which is the designed tripwire — a service-role write that forgot its scope
 * fails LOUD instead of writing an orphan. Naming a composite conflict target
 * whose second column is DEFAULT-filled would route around that.
 *
 * updated_at is APP-MANAGED on this table — no set_updated_at trigger — so
 * every write sets it explicitly or the column silently rots.
 */
async function setHiddenAt(
  db: Db,
  coachId: string,
  hiddenAt: string | null,
): Promise<{ message: string } | null> {
  const now = new Date().toISOString()
  const { data: existing } = await db
    .from('coach_family_state').select('coach_id').eq('coach_id', coachId).maybeSingle()

  if (existing) {
    const { error } = await db
      .from('coach_family_state')
      .update({ hidden_at: hiddenAt, updated_at: now })
      .eq('coach_id', coachId)
    return error ?? null
  }
  const { error } = await db
    .from('coach_family_state')
    .insert({ coach_id: coachId, hidden_at: hiddenAt, updated_at: now })
  return error ?? null
}

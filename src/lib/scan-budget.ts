/**
 * scan-budget.ts — make a long scan RESUMABLE without making it a queue.
 *
 * THE PROBLEM THIS SOLVES: camp-discovery is a flat loop whose cost grows with
 * the family count, running inside a 300-second function. It was killed on 13 of
 * its first 16 scheduled runs, and a killed function cannot record its own death,
 * so the failure was invisible for months. The requirement is not "make it
 * faster" — it is that the unit of work be small and RESUMABLE, so a run that
 * stops has still made progress and says where it stopped.
 *
 * TWO PIECES, both deliberately GRAIN-INDIFFERENT:
 *
 *   ORDER BY BOOKMARK — process least-recently-scanned first. A run that covers
 *   half the set leaves the other half at the front of the next run's queue.
 *   This subsumes rotation: it responds to what actually completed rather than
 *   assuming a fixed stride.
 *
 *   RUN WITHIN A BUDGET — stop before the ceiling rather than being killed at it,
 *   and report what is left. A completed-partial run and a killed run must not
 *   look alike.
 *
 * WHY GRAIN-INDIFFERENT MATTERS — READ THIS BEFORE EXTENDING IT:
 * Today the scan unit is a (family, school) PAIR and the bookmark lives on
 * schools.camp_scan_last_at, because schools is family-scoped. That grain is
 * TEMPORARY AND KNOWN TO BE WRONG AT SCALE: two families tracking Middlebury run
 * two identical Tavily searches, so the cost scales with families rather than
 * with the world. When camps move to the catalog (E1.5/E2) the unit becomes the
 * DISTINCT SCHOOL and the bookmark migrates to discovery_schools.camp_scan_last_at.
 *
 * So nothing here knows what a unit IS. A unit is an opaque item plus two
 * callbacks — read its bookmark, stamp it when done. Swapping the grain should
 * be a change at the call site and nothing else. Do not add pair-specific
 * machinery here; a catalog scan set would throw it away.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** Fraction of the function ceiling we are willing to spend before stopping
 *  cleanly. The remainder is headroom for the final unit overrunning its
 *  estimate plus the completion write — being killed while recording that we
 *  stopped would defeat the whole exercise. */
export const DEFAULT_BUDGET_MS = 240_000

/** Used until real timings exist in a run. Measured 2026-08-19: ~18s per pair
 *  (100s/7, 182s/10, 371s/20). Deliberately pessimistic — overestimating stops
 *  early and loses a unit; underestimating gets the run killed. */
const SEED_UNIT_MS = 20_000

export interface BudgetedResult {
  processed: number
  remaining: number
  /** True when the budget stopped us. FALSE when everything was processed —
   *  the caller uses this to choose 'success' vs 'partial'. */
  stoppedEarly: boolean
  elapsedMs: number
  /** Rolling mean cost per unit, for the next run's estimate and for the series. */
  meanUnitMs: number
}

/**
 * Sort units least-recently-scanned first; never-scanned (null) leads.
 *
 * `bookmarkOf` is how this stays grain-indifferent — it reads a timestamp off
 * whatever the unit happens to be. Sorting happens IN MEMORY on purpose: the
 * set is small (hundreds), and ordering the paginated read by a non-unique
 * timestamp risks rows shifting between pages, which is how a "complete" read
 * silently skips one.
 */
export function orderByBookmark<T>(
  units: T[],
  bookmarkOf: (unit: T) => string | null | undefined,
): T[] {
  return [...units].sort((a, b) => {
    const ta = bookmarkOf(a)
    const tb = bookmarkOf(b)
    if (!ta && !tb) return 0
    if (!ta) return -1          // never scanned goes first
    if (!tb) return 1
    return ta.localeCompare(tb) // ISO timestamps sort lexically
  })
}

/**
 * Process units until they run out or the budget is spent.
 *
 * Stops BEFORE starting a unit it does not believe will fit, using a rolling
 * mean of observed unit cost. A unit that throws is counted as processed —
 * per-unit error handling belongs to the caller, and retrying a failing unit
 * forever inside a budgeted loop is how a scan set stops making progress.
 */
export async function runWithBudget<T>(
  units: T[],
  onUnit: (unit: T, index: number) => Promise<void>,
  opts: { budgetMs?: number; startedAtMs?: number } = {},
): Promise<BudgetedResult> {
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS
  const startedAtMs = opts.startedAtMs ?? Date.now()

  let processed = 0
  let totalUnitMs = 0

  for (let i = 0; i < units.length; i++) {
    const elapsed = Date.now() - startedAtMs
    const estimate = processed > 0 ? totalUnitMs / processed : SEED_UNIT_MS

    if (i > 0 && elapsed + estimate > budgetMs) {
      return {
        processed,
        remaining: units.length - processed,
        stoppedEarly: true,
        elapsedMs: elapsed,
        meanUnitMs: Math.round(estimate),
      }
    }

    const unitStart = Date.now()
    await onUnit(units[i], i)
    totalUnitMs += Date.now() - unitStart
    processed++
  }

  return {
    processed,
    remaining: 0,
    stoppedEarly: false,
    elapsedMs: Date.now() - startedAtMs,
    meanUnitMs: processed > 0 ? Math.round(totalUnitMs / processed) : 0,
  }
}

/**
 * Stamp a unit as scanned. Table and column are parameters for the same reason
 * the rest of this file is generic: at E1.5/E2 this becomes
 * ('discovery_schools', 'camp_scan_last_at') and nothing else changes.
 *
 * Failure to stamp is logged, never thrown. A missed stamp costs one duplicated
 * scan next run; a thrown error costs the rest of the run.
 */
export async function stampScanned(
  client: SupabaseClient,
  table: string,
  id: string,
  column: string,
  at: string = new Date().toISOString(),
): Promise<void> {
  const { error } = await client.from(table).update({ [column]: at }).eq('id', id)
  if (error) {
    console.error(`[scan-budget] could not stamp ${table}.${column} for ${id}: ${error.message}`)
  }
}

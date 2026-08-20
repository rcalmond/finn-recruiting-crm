/**
 * cron-scan-set.ts — what the unattended crons are allowed to look at.
 *
 * THE PIN THIS REPLACES: camp-discovery and coach-roster-sync both ran
 * familyAdmin(ALMOND_FAMILY_ID), so they scanned exactly one family's schools.
 * That was correct while one family existed and silently wrong the moment a
 * second one did — a school only Testerson tracks would never have been
 * scraped, and nobody would have seen an error, because a cron that does less
 * work than it should still reports success.
 *
 * WHY PER-FAMILY ITERATION RATHER THAN ONE CROSS-FAMILY READ: schools and
 * coaches are FAMILY tables. There is deliberately no wrapper that reads a
 * family table across families — catalogAdmin and rawService both refuse. That
 * is not an obstacle to work around, it is the boundary doing its job: the
 * scraper WRITES coaches, and a coach row has to belong to somebody. So the
 * union is assembled family by family, each through its own scoped client, and
 * every write lands in the scope that produced it.
 *
 * THE COST THIS EXPOSES: the union is (family x school) PAIRS, while the
 * external work — a Tavily search, an athletics page fetch — is per SCHOOL.
 * Two families tracking Amherst produce two identical searches. Today that is
 * a rounding error; at fifty families it is the dominant cost of the job. The
 * distinct-target count is reported alongside the pair count so the gap is
 * visible in the run summary rather than discovered on an invoice.
 */
import { catalogAdmin, familyAdmin } from '@/lib/tenant-db'
import { fetchAll } from '@/lib/fetch-all'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Refine = (q: any) => any

export interface FamilyRow {
  id: string
  name: string | null
}

export interface ScanEntry<T> {
  familyId: string
  familyName: string | null
  school: T
}

/** Every family, paginated and asserted. families is a catalog table. */
export async function listFamilies(): Promise<FamilyRow[]> {
  return fetchAll<FamilyRow>(catalogAdmin(), 'families', 'id, name', { orderBy: 'id' })
}

/**
 * The union scan set: one entry per (family, school) pair, across every family.
 *
 * `refine` is the per-cron school filter (tier, active, has a page url, ...).
 * It is applied inside each family's scoped read, so a family's own filters
 * never see another family's rows.
 */
export async function buildFamilyScanSet<T extends { id: string }>(
  columns: string,
  refine?: Refine,
): Promise<{ entries: ScanEntry<T>[]; families: FamilyRow[] }> {
  const families = await listFamilies()
  const entries: ScanEntry<T>[] = []

  for (const family of families) {
    const schools = await fetchAll<T>(familyAdmin(family.id), 'schools', columns, {
      refine,
      orderBy: 'id',
    })
    for (const school of schools) {
      entries.push({ familyId: family.id, familyName: family.name, school })
    }
  }

  return { entries, families }
}

/**
 * FAIRNESS UNDER A KILL.
 *
 * A flat loop over pairs grouped by family means a run that dies partway always
 * starves whoever sorts last — the same family, every week, invisibly. Two cheap
 * properties fix that without any stored state:
 *
 *   INTERLEAVE — round-robin across families, so an interrupted run costs every
 *   family PROPORTIONALLY instead of costing one family everything. A kill at the
 *   halfway mark leaves each family about half done rather than the first family
 *   complete and the last untouched.
 *
 *   ROTATE — start each run at a different offset, so within a family a different
 *   subset leads each week and the tail that keeps getting cut is not always the
 *   same schools. Rotating a round-robin list is cyclic, so it preserves the
 *   interleave.
 *
 * This does NOT make the run complete. It makes the incompleteness survivable and
 * self-correcting across runs, which is the cheap half of the fix; resumability
 * is the real one.
 */
export function interleaveByFamily<T>(entries: ScanEntry<T>[]): ScanEntry<T>[] {
  const byFamily = new Map<string, ScanEntry<T>[]>()
  for (const e of entries) {
    const list = byFamily.get(e.familyId)
    if (list) list.push(e)
    else byFamily.set(e.familyId, [e])
  }
  const queues = Array.from(byFamily.values())
  const out: ScanEntry<T>[] = []
  for (let i = 0; out.length < entries.length; i++) {
    for (const q of queues) {
      if (i < q.length) out.push(q[i])
    }
  }
  return out
}

/** Cyclic rotation by `offset`. Offset comes from the run counter, so each run
 *  begins somewhere new and the starved tail moves. */
export function rotate<T>(items: T[], offset: number): T[] {
  if (items.length === 0) return items
  const n = ((offset % items.length) + items.length) % items.length
  return n === 0 ? items : [...items.slice(n), ...items.slice(0, n)]
}

/**
 * How many DISTINCT external targets a scan set implies, keyed by whatever
 * identifies the outside thing being fetched (a school name, a page url).
 * Reported next to the pair count so duplicated external work stays visible.
 */
export function distinctTargets<T>(
  entries: ScanEntry<T>[],
  key: (school: T) => string | null | undefined,
): number {
  const seen = new Set<string>()
  for (const e of entries) {
    const k = key(e.school)
    if (k) seen.add(k.trim().toLowerCase())
  }
  return seen.size
}

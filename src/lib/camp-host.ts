/**
 * camp-host.ts — the ONE place that knows what camps.host_school_id points at.
 *
 * E1.5 re-points camps.host_school_id and camp_school_attendees.school_id from
 * the FAMILY schools table to the shared discovery_schools catalog. That is a
 * one-line SQL change with a thirty-site blast radius, and almost none of those
 * sites fail loudly:
 *
 *   - a query filtering camps by a FAMILY school id against a column that now
 *     holds CATALOG ids matches nothing, with no error — including
 *     shouldSkipProposal's existing-camp check, which would make every camp look
 *     new and generate a duplicate on every cron run
 *   - a host lookup against a family schools map returns undefined, and camps.ts
 *     renders "Unknown" for every camp
 *   - prep_docs.school_id would receive a catalog id into a family-scoped FK
 *
 * So the code moves FIRST and is written to be correct in BOTH worlds:
 *
 *   READS are bidirectional — they accept either id, so they work before the
 *   re-point and after it without a flag. This is deliberate: a read that
 *   depends on the flag is a read that breaks if the flag and the schema ever
 *   disagree, and during a migration they WILL disagree for a few minutes.
 *
 *   WRITES cannot be bidirectional — a column takes one value — so they consult
 *   CAMPS_KEYED_ON_CATALOG, which is the single switch flipped in the deploy
 *   that accompanies the schema chunk.
 */

/**
 * FALSE until E1.5's re-point lands, then flipped in the SAME deploy as the
 * schema chunk. It governs WRITES only; reads accept both forms regardless.
 */
export const CAMPS_KEYED_ON_CATALOG = false

export interface HostSchoolRef {
  id: string
  discovery_school_id?: string | null
}

/**
 * What to WRITE into camps.host_school_id / camp_school_attendees.school_id for
 * a given family school.
 *
 * Falls back to the family id when a school has no catalog linkage. After the
 * re-point that fallback would violate the FK, which is correct and loud: a
 * camp at an unlinked school is exactly the state E1.5's precondition forbids,
 * and it should fail rather than write a dangling reference. Rejected catalog
 * proposals keep producing unlinked schools, so this is reachable, not theoretical.
 */
export function campHostIdFor(school: HostSchoolRef): string {
  if (!CAMPS_KEYED_ON_CATALOG) return school.id
  return school.discovery_school_id ?? school.id
}

/**
 * Ids to FILTER by when looking for camps at a given school. Returns both forms
 * so the query is correct on either side of the re-point.
 *
 * Use with .in(), never .eq() — that is the whole point.
 */
export function campHostFilterIds(school: HostSchoolRef): string[] {
  const ids = [school.id]
  if (school.discovery_school_id) ids.push(school.discovery_school_id)
  return ids
}

/** Does this camp/attendee row belong to this family school, either way round? */
export function campHostMatches(hostId: string | null | undefined, school: HostSchoolRef): boolean {
  if (!hostId) return false
  return hostId === school.id || hostId === school.discovery_school_id
}

/**
 * Resolve a camp's host id back to the family's own school row.
 *
 * Replaces `schoolMap.get(camp.host_school_id)`, which silently returns
 * undefined after the re-point and renders every camp as "Unknown" — no error,
 * no empty state, just a wrong word on every card.
 */
export function resolveHostSchool<T extends HostSchoolRef>(
  hostId: string | null | undefined,
  schools: T[],
): T | undefined {
  if (!hostId) return undefined
  return schools.find(s => s.id === hostId || s.discovery_school_id === hostId)
}

/** Index form, for call sites that resolve many camps against one school list. */
export function buildHostIndex<T extends HostSchoolRef>(schools: T[]): Map<string, T> {
  const index = new Map<string, T>()
  for (const s of schools) {
    index.set(s.id, s)
    if (s.discovery_school_id) index.set(s.discovery_school_id, s)
  }
  return index
}

/**
 * school-name-key.ts — the ONE token-normalized school-name matcher.
 *
 * Collapses name-form differences so a school already on the family's list is
 * recognized however it is written ("WPI" ↔ "Worcester Polytechnic Institute",
 * "Case Western" ↔ "Case Western Reserve"). Shared by the Find Schools
 * on-your-list badge and the intake suggestion exclusion so the two surfaces
 * cannot disagree about what "already on the list" means.
 *
 * Extracted from DiscoverSection (the exclude-bridge) in Intake v3.
 */

const NAME_STOP = new Set(['university', 'college', 'the', 'of', 'at', 'in', 'univ', 'and'])

/** Drop a dash-suffix and any parenthetical, lowercase, strip punctuation,
 *  drop generic words, sort tokens, join. */
export function nameKey(s: string): string {
  const cleaned = s.split(/\s+[—–-]\s+|\s*\(/)[0]
  return cleaned.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter(t => t && !NAME_STOP.has(t)).sort().join(' ')
}

export interface ListedSchool {
  name?: string | null
  short_name?: string | null
  aliases?: string[] | null
  discovery_school_id?: string | null
}

export interface OnListIndex {
  keys: Set<string>
  discoveryIds: Set<string>
}

/** Build the working-list index: every name form the family's schools carry,
 *  plus any recorded discovery-catalog ids (the exact linkage). */
export function buildOnListIndex(schools: ListedSchool[]): OnListIndex {
  const keys = new Set<string>()
  const discoveryIds = new Set<string>()
  for (const s of schools) {
    if (s.name) keys.add(nameKey(s.name))
    if (s.short_name) keys.add(nameKey(s.short_name))
    for (const a of s.aliases ?? []) keys.add(nameKey(a))
    if (s.discovery_school_id) discoveryIds.add(s.discovery_school_id)
  }
  keys.delete('')
  return { keys, discoveryIds }
}

/** True when a catalog row resolves to a school already on the family's list —
 *  by recorded discovery id OR by either of its name forms. */
export function isRowOnList(
  index: OnListIndex,
  row: { id?: string | null; name: string; short_name?: string | null },
): boolean {
  if (row.id && index.discoveryIds.has(row.id)) return true
  if (index.keys.has(nameKey(row.name))) return true
  return !!row.short_name && index.keys.has(nameKey(row.short_name))
}

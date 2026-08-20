/**
 * division-label.ts — how a school with NO division reads.
 *
 * schools.division became nullable when the add-a-school flow landed: a family
 * who proposes a school the catalog does not hold has told us a name and
 * nothing else, and inventing a division for them is the exact failure the old
 * off-universe add committed (it wrote 'D3' and that then browsed as if
 * verified).
 *
 * So null is now a real, expected state and it has to READ as one. A blank cell
 * or an empty chip looks like something failed to load — and to a family who
 * just added a school and cannot see its details, "something failed" is the
 * obvious conclusion, which is worse than useless. One label, one place, so
 * every surface says the same word.
 */

/** Compact form, for chips and table cells. */
export function divisionLabel(division: string | null | undefined): string {
  return division && division.trim() ? division : 'Unclassified'
}

/** True when the school has no division yet — for styling it as a muted,
 *  pending state rather than a normal value. */
export function isUnclassified(division: string | null | undefined): boolean {
  return !(division && division.trim())
}

/** Long form, where there is room to explain rather than just label. */
export const UNCLASSIFIED_HINT =
  'Not yet in the shared catalog — division and conference fill in once it is added.'

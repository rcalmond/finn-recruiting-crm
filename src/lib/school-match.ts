/**
 * school-match.ts — the ONE catalog matcher.
 *
 * Answers a single question: "which existing discovery_schools rows might this
 * typed name be?" Shared by three callers that must never disagree —
 *
 *   E1 linkage      resolving a family's legacy schools to the catalog
 *   add-a-school    stopping a family from minting a duplicate
 *   admin review    stopping an ADMIN from accepting a duplicate
 *
 * WHY IT NEVER AUTO-PICKS, even on a single exact hit:
 *
 * nameKey strips the parenthetical, which is frequently the only discriminator
 * in the catalog — measured on the live 1066 rows, 43 groups collapse to a
 * shared key (Trinity University (TX) / Trinity College (CT); Providence (MT) /
 * Providence (RI); Saint Joseph's (PA) / Saint Joseph's (ME)). A query that
 * returns one candidate today can return two after any catalog addition, and
 * the add path is itself a source of catalog additions. So there is deliberately
 * NO field on MatchResult that names "the" match: the shape of the return value
 * forces the caller to present candidates and take a confirmation. Confirming is
 * one click; a wrong silent link attaches a family to another school's coaches
 * and camps.
 *
 * WHY THE DESCRIPTOR GUARD EXISTS:
 *
 * A naive token-overlap matcher returns "Georgia Tech" -> "Georgia College
 * [D2 GA]" with full confidence — a real D1 program mis-linked to a different
 * school. The subset tier therefore accepts leftover query tokens ONLY when
 * every one is a pure descriptor. "tech" is deliberately absent from that list:
 * it is what distinguishes Georgia Tech from Georgia College, and Virginia Tech
 * from Utah Tech.
 *
 * The guard trades false positives for false negatives — "University of
 * Wisconsin Madison" does not reach "Wisconsin", because "madison" is a place
 * name, not a descriptor. That is the intended direction: a false positive
 * silently attaches a family to the wrong school, while a false negative only
 * creates review work. Admin review is where the remaining duplicates are
 * caught, which is why the review screen runs this same matcher again.
 */
import { nameKey, nameTokens } from '@/lib/school-name-key'

/** Words that only ever DESCRIBE an institution, so their presence in the typed
 *  name but not the catalog name carries no distinguishing information.
 *  Deliberately NOT here: tech, state, poly, a&m — each distinguishes real
 *  distinct programs from each other. */
const DESCRIPTORS = new Set([
  'institute', 'institution', 'technology', 'polytechnic', 'school', 'campus',
])

export interface CatalogCandidateRow {
  id: string
  name: string
  short_name: string | null
  division: string | null
  state: string | null
  city?: string | null
}

export type MatchTier = 'exact' | 'subset' | 'none'

export interface MatchCandidate extends CatalogCandidateRow {
  /** How this candidate was reached. Surfaced so the UI can say how sure it is. */
  via: 'exact' | 'subset'
}

export interface MatchResult {
  tier: MatchTier
  /** Possibly several. Possibly one. NEVER pre-selected — see the module note. */
  candidates: MatchCandidate[]
  /** True when more than one candidate shares the top tier, so the UI can lead
   *  with the discriminators (division, state) rather than the names. */
  ambiguous: boolean
}

/**
 * Match a typed school name against catalog rows.
 *
 * `catalog` is passed in rather than fetched so the caller controls scope and
 * paging (fetchAll asserts completeness — a matcher run against a truncated
 * catalog would refuse real schools and mint duplicates, the 1000-row cap
 * wearing a new hat).
 */
export function matchCatalog(
  query: string,
  catalog: CatalogCandidateRow[],
): MatchResult {
  const q = (query ?? '').trim()
  if (!q) return { tier: 'none', candidates: [], ambiguous: false }

  const qKey = nameKey(q)
  if (!qKey) return { tier: 'none', candidates: [], ambiguous: false }

  // ── Tier 1: exact token-set identity, on either name form ─────────────────
  const exact = catalog.filter(
    r => nameKey(r.name) === qKey || (r.short_name ? nameKey(r.short_name) === qKey : false),
  )
  if (exact.length > 0) {
    return {
      tier: 'exact',
      candidates: exact.map(r => ({ ...r, via: 'exact' as const })),
      ambiguous: exact.length > 1,
    }
  }

  // ── Tier 2: catalog tokens are a subset, leftovers are pure descriptors ───
  const qTokens = new Set(nameTokens(q))
  const subset = catalog.filter(r => {
    const rTokens = nameTokens(r.name)
    if (rTokens.length === 0) return false
    for (const t of rTokens) if (!qTokens.has(t)) return false
    for (const t of Array.from(qTokens)) {
      if (!rTokens.includes(t) && !DESCRIPTORS.has(t)) return false
    }
    return true
  })
  if (subset.length > 0) {
    return {
      tier: 'subset',
      candidates: subset.map(r => ({ ...r, via: 'subset' as const })),
      ambiguous: subset.length > 1,
    }
  }

  return { tier: 'none', candidates: [], ambiguous: false }
}

/** Frozen at proposal time onto catalog_proposals.candidates, so a reviewer can
 *  see what the family was shown and declined. Kept small on purpose. */
export function freezeCandidates(result: MatchResult) {
  return {
    tier: result.tier,
    ambiguous: result.ambiguous,
    shown: result.candidates.map(c => ({
      id: c.id, name: c.name, division: c.division, state: c.state, via: c.via,
    })),
  }
}

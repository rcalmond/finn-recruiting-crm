/**
 * program-tags.ts — deterministic best-effort program tagging for
 * discovery_schools (migration 062).
 *
 * Shared by BOTH the live update (seed-discovery-programs.ts) and the committed
 * universe seed (seed-discovery-schools.ts) so the two stay consistent without
 * hand-editing 1,066 rows.
 *
 * Accuracy contract: tag a program ONLY where a school of this shape confidently
 * offers a real undergraduate program in it. Absence = unknown-or-not-offered,
 * NEVER guessed. Rules are conservative-but-meaningful and lean on the existing
 * facets (enrollment_band, academic_band, has_engineering) plus small curated
 * name overrides for the cases the band rules miss (e.g. business-forward SLACs,
 * elite schools with nursing).
 *
 * Vocabulary mirrors DiscoveryProgram in src/lib/types.ts (kept as string[] here
 * so this module has no '@/' alias dependency under standalone tsx).
 */

// Business-forward schools the enrollment rule misses (small/selective, but a
// real undergraduate business/management program).
const BUSINESS_NAMES = [
  'babson', 'bentley', 'bryant', 'bucknell', 'lehigh', 'villanova', 'richmond',
  'washington and lee', 'claremont mckenna', 'wake forest', 'fairfield',
]
// Elite/selective schools with well-known undergraduate nursing the band rule
// (which targets accessible/selective larger publics) would otherwise skip.
const NURSING_NAMES = [
  'pennsylvania', 'georgetown', 'villanova', 'boston college', 'new york university',
  'emory', 'johns hopkins', 'duke', 'marquette', 'creighton', 'fairfield',
  'sacred heart', 'quinnipiac', 'seton hall', 'saint louis',
]

export function programTags(
  name: string,
  enrollment: string | null,
  academic: string | null,
  hasEngineering: boolean,
): string[] {
  const set = new Set<string>()
  const n = name.toLowerCase()
  const big = enrollment === '5k_15k' || enrollment === 'over_15k'
  const mid = enrollment === '2k_5k'
  const elite = academic === 'most_selective' || academic === 'highly_selective'
  const selectivePlus = elite || academic === 'selective'
  const accOrSel = academic === 'accessible' || academic === 'selective'
  const named = (keys: string[]) => keys.some(k => n.includes(k))

  // Engineering — carried from the deprecated has_engineering boolean.
  if (hasEngineering) set.add('engineering')

  // Computer science — engineering schools, large universities, and elite
  // schools (incl. small SLACs like the NESCACs) reliably offer CS.
  if (hasEngineering || big || elite) set.add('computer_science')

  // Business — larger universities broadly carry undergrad business; small elite
  // SLACs generally do not, so gate on size + a curated business-school list.
  if (big || (mid && accOrSel) || named(BUSINESS_NAMES)) set.add('business')

  // Pre-med / health — selective-or-better schools carry strong bio/chem plus
  // real pre-med advising (most liberal-arts colleges qualify).
  if (selectivePlus) set.add('premed_health')

  // Nursing — accessible/selective larger universities commonly offer nursing;
  // elite SLACs / tech schools do not. Plus a curated list of elite programs.
  if ((big && accOrSel) || named(NURSING_NAMES)) set.add('nursing')

  // Education — regional comprehensives (accessible/selective, not tiny) commonly
  // run teacher-prep; elite research universities / SLACs often don't.
  if (accOrSel && (big || mid)) set.add('education')

  return Array.from(set)
}

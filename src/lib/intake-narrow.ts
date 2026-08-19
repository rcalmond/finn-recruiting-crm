/**
 * intake-narrow.ts — PURE narrowing + option math for the intake starting list.
 * No fetch, no DOM — unit-testable, and keeps IntakeSuggest presentational for
 * the demo-funnel seam.
 *
 * Narrowing asks about the 1–2 facet dimensions that most evenly split the
 * result set (Gini impurity), restricted to dimensions the family did NOT pin,
 * so a question is never irrelevant and never second-guesses a stated criterion.
 *
 * v3: selections are MULTI-SELECT (union within a dimension, AND across
 * dimensions), option ORDER is the dimension's natural order — impurity picks
 * WHICH question is asked, never how its options are listed — and option counts
 * are LIVE (each dimension's counts ignore its own selection, the standard
 * faceted-search behaviour, so a family can see what adding a value would give).
 */
import { ACADEMIC_LABELS, ENROLLMENT_LABELS } from './types'
import type { AcademicBand, EnrollmentBand } from './types'

export interface NarrowRow {
  id: string
  division: string
  region: string | null
  academic_band: string | null
  enrollment_band: string | null
  programs: string[] | null
}

export interface IntakeFacets {
  divisions: string[]
  regions: string[]
  academic_bands: string[]
  enrollment_bands: string[]
  programs: string[]
}

export type NarrowDim = 'academic_band' | 'enrollment_band' | 'division' | 'region'

/** Multi-select: dim → chosen values. Empty/absent array = no preference. */
export type NarrowSelections = Partial<Record<NarrowDim, string[]>>

export interface NarrowingQuestion {
  dim: NarrowDim
  question: string
  /** Values in the dimension's NATURAL order (never count order). */
  options: string[]
}

const DIM_QUESTION: Record<NarrowDim, string> = {
  academic_band: 'How academically selective?',
  enrollment_band: 'How big a campus?',
  division: 'Which division?',
  region: 'Which region?',
}

// Natural option order. CONVENTION: both ordinal dimensions run ASCENDING on
// their own scale — least selective → most selective, smallest → largest — so
// the two ladders read the same direction.
const DIM_ORDER: Record<NarrowDim, string[] | null> = {
  academic_band: ['accessible', 'selective', 'highly_selective', 'most_selective'],
  enrollment_band: ['under_2k', '2k_5k', '5k_15k', 'over_15k'],
  division: ['D1', 'D2', 'D3', 'NAIA', 'JUCO'],
  region: null, // no natural ordinal — alphabetical, still never by count
}

export function optionLabel(dim: NarrowDim, value: string): string {
  if (dim === 'academic_band') return ACADEMIC_LABELS[value as AcademicBand] ?? value
  if (dim === 'enrollment_band') return ENROLLMENT_LABELS[value as EnrollmentBand] ?? value
  return value
}

function rowValue(dim: NarrowDim, r: NarrowRow): string | null {
  if (dim === 'academic_band') return r.academic_band
  if (dim === 'enrollment_band') return r.enrollment_band
  if (dim === 'division') return r.division
  return r.region
}

/** Gini impurity of the dim's value distribution — 0 = useless (one value),
 *  higher = splits the set more evenly. */
function impurity(rows: NarrowRow[], dim: NarrowDim): number {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const v = rowValue(dim, r) ?? '(unknown)'
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  if (counts.size < 2) return 0
  const n = rows.length
  let sumSq = 0
  for (const c of Array.from(counts.values())) sumSq += (c / n) ** 2
  return 1 - sumSq
}

function orderValues(dim: NarrowDim, present: Set<string>): string[] {
  const order = DIM_ORDER[dim]
  const values = Array.from(present)
  if (!order) return values.sort((a, b) => a.localeCompare(b))
  return values.sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b)
    if (ia === -1 && ib === -1) return a.localeCompare(b)
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
}

/**
 * Pick up to `max` narrowing questions among dimensions the family did not
 * state, ordered by discriminating power. A dimension with fewer than two
 * distinct values never appears (its question would be pointless). Option
 * lists are stable and in natural order.
 */
export function pickNarrowingQuestions(
  rows: NarrowRow[],
  facets: IntakeFacets,
  max = 2,
): NarrowingQuestion[] {
  const candidates: NarrowDim[] = []
  if (facets.academic_bands.length === 0) candidates.push('academic_band')
  if (facets.enrollment_bands.length === 0) candidates.push('enrollment_band')
  if (facets.divisions.length === 0) candidates.push('division')
  if (facets.regions.length === 0) candidates.push('region')

  return candidates
    .map(dim => ({ dim, power: impurity(rows, dim) }))
    .filter(c => c.power > 0)
    .sort((a, b) => b.power - a.power)
    .slice(0, max)
    .map(({ dim }) => {
      const present = new Set<string>()
      for (const r of rows) {
        const v = rowValue(dim, r)
        if (v) present.add(v)
      }
      return { dim, question: DIM_QUESTION[dim], options: orderValues(dim, present) }
    })
}

/** Apply multi-select narrowing: union within a dimension, AND across
 *  dimensions. Preserves incoming (ranked) order. */
export function applyNarrowing<T extends NarrowRow>(
  rows: T[],
  selections: NarrowSelections,
): T[] {
  const active = (Object.entries(selections) as [NarrowDim, string[] | undefined][])
    .filter(([, vals]) => vals && vals.length > 0) as [NarrowDim, string[]][]
  if (active.length === 0) return rows
  return rows.filter(r => active.every(([dim, vals]) => {
    const v = rowValue(dim, r)
    return v !== null && vals.includes(v)
  }))
}

/**
 * LIVE option counts for one dimension: rows filtered by every OTHER
 * dimension's selections, then counted. (A facet's own selection is excluded so
 * the counts show what choosing each value would yield.)
 */
export function countOptions<T extends NarrowRow>(
  rows: T[],
  dim: NarrowDim,
  selections: NarrowSelections,
): Map<string, number> {
  const others: NarrowSelections = { ...selections }
  delete others[dim]
  const base = applyNarrowing(rows, others)
  const counts = new Map<string, number>()
  for (const r of base) {
    const v = rowValue(dim, r)
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return counts
}

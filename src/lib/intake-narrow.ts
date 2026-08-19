/**
 * intake-narrow.ts — PURE narrowing + ranking math for the intake starting
 * list (Intake v2). No fetch, no DOM — unit-testable, and keeps IntakeSuggest
 * presentational for the demo-funnel seam.
 *
 * Narrowing picks the 1–2 facet dimensions that most evenly split the current
 * result set (highest discriminating power via Gini impurity), restricted to
 * dimensions the family did NOT pin — so the question is never irrelevant and
 * never second-guesses something they stated.
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

export interface NarrowingQuestion {
  dim: NarrowDim
  question: string
  options: { value: string; label: string; count: number }[]
}

const DIM_QUESTION: Record<NarrowDim, string> = {
  academic_band: 'How academically selective?',
  enrollment_band: 'How big a campus?',
  division: 'Which division?',
  region: 'Which region?',
}

function valueLabel(dim: NarrowDim, value: string): string {
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

/**
 * Pick up to `max` narrowing questions among dimensions the family did not
 * specify, ordered by discriminating power. A dimension with fewer than two
 * distinct values in the set never appears (its question would be pointless).
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
      const counts = new Map<string, number>()
      for (const r of rows) {
        const v = rowValue(dim, r)
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
      }
      const options = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, label: valueLabel(dim, value), count }))
      return { dim, question: DIM_QUESTION[dim], options }
    })
}

/** Apply tapped selections (dim → chosen value, absent = no preference).
 *  Preserves incoming (ranked) order. */
export function applyNarrowing<T extends NarrowRow>(
  rows: T[],
  selections: Partial<Record<NarrowDim, string>>,
): T[] {
  return rows.filter(r =>
    (Object.entries(selections) as [NarrowDim, string][]).every(
      ([dim, v]) => !v || rowValue(dim, r) === v,
    ),
  )
}

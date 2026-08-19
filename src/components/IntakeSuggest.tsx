'use client'

/**
 * IntakeSuggest — "Here's a starting list." (Intake v2)
 *
 * PRESENTATIONAL + selection state only. The parent owns the API calls and the
 * adoption write — this component receives ranked rows and callbacks.
 * TODO(demo-funnel): this seam is the auth-and-adopt boundary — an
 * unauthenticated demo renders this same component with a different parent.
 * Do not add auth or DB access here.
 *
 * v2 flow:
 *  - ≤10 ranked rows → show them all (already annotated by the server).
 *  - >10 → a NARROWING step first: 1–2 tappable questions chosen by
 *    discriminating power (pure math in src/lib/intake-narrow.ts, only over
 *    dimensions the family did NOT state) → re-filter → top 10 ranked → the
 *    parent's fail-soft annotate callback fills the whys for the final set.
 *  - Still >10 after narrowing → top 10, said plainly.
 *
 * Cards start CHECKED: with a 10-cap the whole point remains a one-click
 * starting list; every row is C-tier exploratory and reversible, and
 * unchecking outliers is cheaper than hunting checkboxes.
 */
import { useMemo, useState } from 'react'
import { SP, pill } from '@/components/settings/SettingsChrome'
import { ACADEMIC_LABELS, ENROLLMENT_LABELS, PROGRAM_LABELS } from '@/lib/types'
import type { AcademicBand, DiscoveryProgram, EnrollmentBand } from '@/lib/types'
import {
  applyNarrowing, pickNarrowingQuestions,
  type IntakeFacets, type NarrowDim,
} from '@/lib/intake-narrow'

export interface IntakeSuggestion {
  id: string
  name: string
  short_name: string | null
  division: string
  conference: string | null
  region: string | null
  state: string | null
  city: string | null
  academic_band: string | null
  enrollment_band: string | null
  programs: string[] | null
  why: string | null
}

const EMPTY_FACETS: IntakeFacets = { divisions: [], regions: [], academic_bands: [], enrollment_bands: [], programs: [] }
const CAP = 10

export default function IntakeSuggest({
  suggestions,
  facets,
  qualityProxy,
  adding,
  onAdd,
  onSkip,
  annotate,
}: {
  /** Ranked by the server — order is meaningful, top = best matched. */
  suggestions: IntakeSuggestion[]
  facets?: IntakeFacets | null
  /** Academic selectivity stood in for requested program quality — disclose. */
  qualityProxy?: boolean
  adding: boolean
  onAdd: (checked: IntakeSuggestion[]) => void
  onSkip: () => void
  /** Parent-owned, fail-soft: whys for the final displayed set. */
  annotate?: (rows: IntakeSuggestion[]) => Promise<Record<string, string>>
}) {
  const f = facets ?? EMPTY_FACETS
  const questions = useMemo(
    () => (suggestions.length > CAP ? pickNarrowingQuestions(suggestions, f) : []),
    [suggestions, f],
  )
  const [phase, setPhase] = useState<'narrow' | 'list'>(
    suggestions.length > CAP && questions.length > 0 ? 'narrow' : 'list',
  )
  const [selections, setSelections] = useState<Partial<Record<NarrowDim, string>>>({})
  const [finalRows, setFinalRows] = useState<IntakeSuggestion[]>(() =>
    suggestions.length > CAP && questions.length > 0 ? [] : suggestions.slice(0, CAP))
  const [truncatedFrom, setTruncatedFrom] = useState<number>(
    suggestions.length > CAP && questions.length === 0 ? suggestions.length : 0)
  const [checked, setChecked] = useState<Set<string>>(() =>
    new Set((suggestions.length > CAP && questions.length > 0 ? [] : suggestions.slice(0, CAP)).map(s => s.id)))
  const [whys, setWhys] = useState<Record<string, string>>({})

  const narrowedPreview = useMemo(
    () => applyNarrowing(suggestions, selections),
    [suggestions, selections],
  )

  async function finishNarrowing() {
    const filtered = narrowedPreview.length > 0 ? narrowedPreview : suggestions
    const top = filtered.slice(0, CAP)
    setFinalRows(top)
    setTruncatedFrom(filtered.length > CAP ? filtered.length : 0)
    setChecked(new Set(top.map(s => s.id)))
    setPhase('list')
    if (annotate && top.some(r => !r.why)) {
      try { setWhys(await annotate(top)) } catch { /* fail-soft: no whys */ }
    }
  }

  const toggle = (id: string) => setChecked(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const checkedRows = finalRows.filter(s => checked.has(s.id))

  const framing = (
    <p style={{ margin: '0 0 4px', fontSize: 12.5, color: SP.inkLo }}>
      A starting list — you can add more anytime in Find Schools.
    </p>
  )
  const disclosure = qualityProxy ? (
    <p style={{
      margin: '0 0 12px', fontSize: 12.5, color: SP.inkMid, lineHeight: 1.5,
      background: SP.paperDeep, border: `1px solid ${SP.line}`, borderRadius: 8, padding: '8px 12px',
    }}>
      The catalog doesn&apos;t rate individual programs — academic selectivity
      stands in for &ldquo;strong programs&rdquo; here.
    </p>
  ) : null

  // ── Narrowing step ─────────────────────────────────────────────────────────
  if (phase === 'narrow') {
    return (
      <div>
        <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 750, fontStyle: 'italic', color: SP.ink }}>
          {suggestions.length} programs match<span style={{ color: SP.teal }}>.</span>
        </h2>
        {framing}
        <p style={{ margin: '0 0 14px', fontSize: 13.5, color: SP.inkMid, lineHeight: 1.55, maxWidth: 520 }}>
          A couple of taps narrows it to the best fits — or skip straight to the
          top matches.
        </p>
        {disclosure}

        {questions.map(qn => (
          <div key={qn.dim} style={{ background: SP.white, border: `1px solid ${SP.line}`, borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 650, color: SP.ink, marginBottom: 9 }}>{qn.question}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {qn.options.map(opt => {
                const on = selections[qn.dim] === opt.value
                return (
                  <button key={opt.value}
                    onClick={() => setSelections(s => ({ ...s, [qn.dim]: on ? undefined : opt.value }))}
                    style={{
                      padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                      fontFamily: 'inherit', cursor: 'pointer',
                      border: `1px solid ${on ? SP.tealDeep : SP.line2}`,
                      background: on ? SP.tealDeep : SP.white, color: on ? SP.white : SP.ink,
                    }}>
                    {opt.label} <span style={{ opacity: 0.65 }}>({opt.count})</span>
                  </button>
                )
              })}
              <button onClick={() => setSelections(s => ({ ...s, [qn.dim]: undefined }))}
                style={{
                  padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                  fontFamily: 'inherit', cursor: 'pointer',
                  border: `1px solid ${SP.line}`,
                  background: 'transparent',
                  color: selections[qn.dim] ? SP.inkLo : SP.ink,
                }}>
                No preference
              </button>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <button style={pill('accent')} onClick={finishNarrowing}>
            Show {Math.min(narrowedPreview.length || suggestions.length, CAP)} school{Math.min(narrowedPreview.length || suggestions.length, CAP) === 1 ? '' : 's'} →
          </button>
          <button style={pill('ghost')} onClick={onSkip}>Skip for now</button>
        </div>
      </div>
    )
  }

  // ── The list ───────────────────────────────────────────────────────────────
  return (
    <div>
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 750, fontStyle: 'italic', color: SP.ink }}>
        Here&apos;s a starting list<span style={{ color: SP.teal }}>.</span>
      </h2>
      {framing}
      <p style={{ margin: '0 0 12px', fontSize: 13.5, color: SP.inkMid, lineHeight: 1.55, maxWidth: 520 }}>
        Ranked by fit to what you wrote — real programs from the catalog, best
        matches first. Uncheck any that don&apos;t fit; everything lands as an
        exploratory C-tier school you can retier or remove anytime.
      </p>
      {disclosure}
      {truncatedFrom > CAP && (
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: SP.inkLo }}>
          Showing the {CAP} best matches of {truncatedFrom} — the rest are in Find Schools.
        </p>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {finalRows.map(s => {
          const on = checked.has(s.id)
          const why = s.why ?? whys[s.id] ?? null
          const meta = [
            s.division,
            s.conference,
            [s.city, s.state].filter(Boolean).join(', ') || s.region,
            s.academic_band ? ACADEMIC_LABELS[s.academic_band as AcademicBand] : null,
            s.enrollment_band ? ENROLLMENT_LABELS[s.enrollment_band as EnrollmentBand] : null,
            ...(s.programs ?? []).map(p => PROGRAM_LABELS[p as DiscoveryProgram] ?? p),
          ].filter(Boolean).join(' · ')
          return (
            <label key={s.id} style={{
              display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer',
              background: SP.white, border: `1px solid ${on ? SP.tealDeep : SP.line}`,
              borderRadius: 12, padding: '12px 14px',
              opacity: on ? 1 : 0.72, transition: 'border-color 0.12s, opacity 0.12s',
            }}>
              <input type="checkbox" checked={on} onChange={() => toggle(s.id)}
                style={{ marginTop: 3, accentColor: SP.tealDeep }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 650, color: SP.ink }}>{s.name}</div>
                <div style={{ fontSize: 11.5, color: SP.inkLo, marginTop: 2 }}>{meta}</div>
                {why && <div style={{ fontSize: 12, color: SP.inkMid, marginTop: 5, lineHeight: 1.45 }}>{why}</div>}
              </div>
            </label>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
        <button
          style={pill('accent', checkedRows.length === 0 || adding)}
          disabled={checkedRows.length === 0 || adding}
          onClick={() => onAdd(checkedRows)}
        >
          {adding ? 'Adding…' : `Add ${checkedRows.length} school${checkedRows.length === 1 ? '' : 's'} to your list`}
        </button>
        <button style={pill('ghost')} disabled={adding} onClick={onSkip}>Skip for now</button>
      </div>
    </div>
  )
}

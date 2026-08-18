'use client'

/**
 * IntakeSuggest — "Here's a starting list." (Profile v2, Amendment B)
 *
 * PRESENTATIONAL + selection state only. The parent owns the API call and the
 * adoption write — this component receives suggestion rows and hands back the
 * checked ids. TODO(demo-funnel): this seam is the auth-and-adopt boundary —
 * an unauthenticated demo renders this same component with a different parent
 * (no adoption write). Do not add auth, fetching, or DB access here.
 *
 * Cards start CHECKED: the whole point of the moment is a one-click starting
 * list, every row is C-tier exploratory by design, and unchecking is cheaper
 * than hunting checkboxes. (The bench and remove-from-list keep it reversible.)
 */
import { useState } from 'react'
import { SP, pill } from '@/components/settings/SettingsChrome'
import { ACADEMIC_LABELS, ENROLLMENT_LABELS, PROGRAM_LABELS } from '@/lib/types'
import type { AcademicBand, DiscoveryProgram, EnrollmentBand } from '@/lib/types'

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

export default function IntakeSuggest({
  suggestions,
  adding,
  onAdd,
  onSkip,
}: {
  suggestions: IntakeSuggestion[]
  adding: boolean
  onAdd: (checked: IntakeSuggestion[]) => void
  onSkip: () => void
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(suggestions.map(s => s.id)))
  const toggle = (id: string) => setChecked(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const checkedRows = suggestions.filter(s => checked.has(s.id))

  return (
    <div>
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 750, fontStyle: 'italic', color: SP.ink }}>
        Here&apos;s a starting list<span style={{ color: SP.teal }}>.</span>
      </h2>
      <p style={{ margin: '0 0 16px', fontSize: 13.5, color: SP.inkMid, lineHeight: 1.55, maxWidth: 520 }}>
        Real programs from the catalog, matched to what you wrote. Uncheck any
        that don&apos;t fit — everything lands as an exploratory C-tier school you
        can retier or remove anytime.
      </p>

      <div style={{ display: 'grid', gap: 8 }}>
        {suggestions.map(s => {
          const on = checked.has(s.id)
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
                {s.why && <div style={{ fontSize: 12, color: SP.inkMid, marginTop: 5, lineHeight: 1.45 }}>{s.why}</div>}
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

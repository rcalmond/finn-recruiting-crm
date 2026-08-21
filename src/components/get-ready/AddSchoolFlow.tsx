'use client'

/**
 * AddSchoolFlow — "my school isn't in the list."
 *
 * THE ORDER OF THE STEPS IS THE WHOLE POINT: disambiguate, then browse, then
 * create. A family typing "Clark" or "WPI" or "MIT" must land on the catalog row
 * that already exists. If this flow mints duplicates at family scale, the
 * catalog degrades faster than it fills — that is the same 32-row mismatch that
 * produced E1's entire linkage exercise, recreated by a button.
 *
 * NOTHING IS EVER AUTO-PICKED, not even a lone exact hit. The matcher normalizes
 * away the parenthetical, and 43 groups in the live catalog collapse to a shared
 * key (Trinity TX / Trinity CT). A single candidate today can be two tomorrow,
 * and THIS FLOW is one of the things that adds catalog rows. So every candidate
 * is shown with its division and state — the discriminators the matcher discards
 * — and confirmation is always a click.
 *
 * "None of these" does not go straight to create: it offers the facet browser
 * first, because colloquial names ("Berkeley", "DU") are lexically unreachable
 * from their catalog rows ("California", "Denver") and no matcher will ever fix
 * that, while two clicks of state + division will.
 */
import { useCallback, useState } from 'react'

interface Candidate {
  id: string
  name: string
  short_name: string | null
  division: string | null
  state: string | null
  city?: string | null
  via: 'exact' | 'subset'
  /** Set when THIS family already has a school linked to this catalog row. */
  alreadyOnList: { id: string; name: string } | null
}

interface MatchResponse {
  tier: 'exact' | 'subset' | 'none'
  candidates: Candidate[]
  ambiguous: boolean
  /** The family's OWN schools whose name matches what was typed. */
  onList: Array<{ id: string; name: string; division: string | null }>
  error?: string
}

const T = {
  ink: '#1A1A1A', inkMid: '#4A4A4A', inkLo: '#6B655A', inkMute: '#8A8478',
  line: '#E2DBC9', card: '#FFFDF9', pitch: '#1F6B48', soft: '#E3EFE9',
  cream: '#FBF6EC', rust: '#B5502F',
}

export default function AddSchoolFlow({
  initialName = '',
  onAdoptCatalogRow,
  onProposed,
  onCancel,
}: {
  initialName?: string
  /** Family confirmed an existing catalog row — adopt it the normal way. */
  onAdoptCatalogRow: (discoveryId: string) => Promise<void>
  /** A proposal was filed and the school is on the list. */
  onProposed: (schoolName: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [result, setResult] = useState<MatchResponse | null>(null)
  const [busy, setBusy] = useState<'match' | 'adopt' | 'propose' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmedNoMatch, setConfirmedNoMatch] = useState(false)

  const runMatch = useCallback(async () => {
    const q = name.trim()
    if (!q) return
    setBusy('match'); setError(null); setResult(null); setConfirmedNoMatch(false)
    try {
      const res = await fetch(`/api/catalog-match?q=${encodeURIComponent(q)}`)
      const json = await res.json() as MatchResponse
      if (!res.ok) { setError(json.error ?? 'Could not check the catalog.'); setBusy(null); return }
      setResult(json)
      // A zero-candidate result still requires the family to look at the browse
      // step before creating — see the module note on Berkeley and DU.
    } catch {
      setError('Could not check the catalog.')
    }
    setBusy(null)
  }, [name])

  const adopt = useCallback(async (c: Candidate) => {
    setBusy('adopt'); setError(null)
    try { await onAdoptCatalogRow(c.id) } catch { setError(`Could not add ${c.name}.`) }
    setBusy(null)
  }, [onAdoptCatalogRow])

  const propose = useCallback(async () => {
    const q = name.trim()
    if (!q) return
    setBusy('propose'); setError(null)
    try {
      const res = await fetch('/api/catalog-proposals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: q }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Could not add the school.'); setBusy(null); return }
      onProposed(q)
    } catch {
      setError('Could not add the school.')
    }
    setBusy(null)
  }, [name, onProposed])

  const pill = (primary: boolean) => ({
    padding: '6px 13px', fontSize: 12.5, fontWeight: 650, borderRadius: 999,
    border: `1.3px solid ${primary ? T.pitch : T.line}`,
    background: primary ? T.pitch : 'transparent',
    color: primary ? T.cream : T.inkMid,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const,
  })

  return (
    <div style={{
      border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.pitch}`,
      borderRadius: '0 10px 10px 0', padding: '14px 16px', background: T.card,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Add a school that isn&apos;t listed</div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={name}
          onChange={e => { setName(e.target.value); setResult(null); setConfirmedNoMatch(false) }}
          onKeyDown={e => { if (e.key === 'Enter') runMatch() }}
          placeholder="School name"
          style={{
            flex: '1 1 220px', padding: '7px 11px', fontSize: 13.5, fontFamily: 'inherit',
            border: `1px solid ${T.line}`, borderRadius: 8, background: '#fff', color: T.ink,
          }}
        />
        <button onClick={runMatch} disabled={!name.trim() || busy === 'match'} style={pill(true)}>
          {busy === 'match' ? 'Checking…' : 'Check the catalog'}
        </button>
        <button onClick={onCancel} style={pill(false)}>Cancel</button>
      </div>

      {error && <p style={{ margin: 0, fontSize: 12.5, color: T.rust }}>{error}</p>}

      {/* ── Step 0: ALREADY ON YOUR LIST. Checked before anything else,
             because the answer here is not "create" but "here it is". ── */}
      {result && (result.onList?.length ?? 0) > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: T.inkMid }}>
            You already have this on your list:
          </p>
          {result.onList.map(s => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10, padding: '9px 11px', border: `1px solid ${T.line}`,
              borderRadius: 8, background: T.soft,
            }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>
                {s.name}{s.division ? <span style={{ fontWeight: 500, color: T.inkLo }}> · {s.division}</span> : null}
              </span>
              <a href={`/schools/${s.id}`} style={{ ...pill(true), textDecoration: 'none', display: 'inline-block' }}>
                Open it
              </a>
            </div>
          ))}
        </div>
      )}

      {/* ── Step 1: candidates. Always confirmed, never auto-applied. ── */}
      {result && (result.onList?.length ?? 0) === 0 && result.candidates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: T.inkMid }}>
            {result.candidates.length === 1
              ? 'Did you mean this one? It is already in the catalog.'
              : `${result.candidates.length} schools in the catalog could be this. Check the division and state:`}
            {result.tier === 'subset' && ' (close match — worth a second look)'}
          </p>
          {result.candidates.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10, padding: '9px 11px', border: `1px solid ${T.line}`,
              borderRadius: 8, background: T.soft,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{c.name}</span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: T.inkLo }}>
                  {[c.division, c.state, c.city].filter(Boolean).join(' · ')}
                </span>
              </div>
              {c.alreadyOnList ? (
                <a href={`/schools/${c.alreadyOnList.id}`} style={{ ...pill(false), textDecoration: 'none', display: 'inline-block' }}>
                  Already yours — open
                </a>
              ) : (
                <button onClick={() => adopt(c)} disabled={busy !== null} style={pill(true)}>
                  {busy === 'adopt' ? 'Adding…' : "That's it"}
                </button>
              )}
            </div>
          ))}
          {!confirmedNoMatch && (
            <button onClick={() => setConfirmedNoMatch(true)} style={{
              ...pill(false), alignSelf: 'flex-start',
            }}>None of these</button>
          )}
        </div>
      )}

      {/* ── Step 2: browse before create. ── */}
      {result && (result.onList?.length ?? 0) === 0 && (result.candidates.length === 0 || confirmedNoMatch) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: T.inkMid, lineHeight: 1.5 }}>
            Nothing in the catalog matches that name.{' '}
            <b>Try browsing by state and division first</b> — schools are often listed under a
            different name than the one people use (Berkeley is listed as California, Denver as DU).
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={onCancel} style={pill(false)}>Browse instead</button>
            <button onClick={propose} disabled={busy !== null} style={pill(true)}>
              {busy === 'propose' ? 'Adding…' : `Add "${name.trim()}" anyway`}
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 11.5, color: T.inkMute, lineHeight: 1.45 }}>
            It goes on your list right away. We&apos;ll also send it for review so it can join the
            shared catalog — until then it won&apos;t carry division or conference details.
          </p>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSchools } from '@/hooks/useRealtimeData'
import type {
  DiscoverySchool, DiscoveryDivision, DiscoveryRegion,
  EnrollmentBand, AcademicBand, DiscoveryProgram, Division, School,
} from '@/lib/types'
import { ENROLLMENT_LABELS, ACADEMIC_LABELS, DISCOVERY_PROGRAMS, PROGRAM_LABELS } from '@/lib/types'
import { toSchoolInsert } from '@/lib/discovery-add'
import AddSchoolFlow from './AddSchoolFlow'
import { nameKey } from '@/lib/school-name-key'
import { usePlayer } from '@/hooks/usePlayer'
import { sportNoun } from '@/lib/positions'

// Brand chrome (Throughball, Brand Sweep Pass 2). GREEN is repointed at the
// shared --tb-pitch token; every use here is page chrome (facets, buttons,
// badges) — no data-semantic colors live in this component.
const PITCH = '#1F6B48'
const PITCH_SOFT = '#E3EFE9'
const CREAM = '#FBF6EC'
const GREEN = { accent: PITCH, accentSoft: PITCH_SOFT, accentDeep: PITCH }
const SD = {
  paper: '#F6F1E8', ink: '#1A1A1A', inkMid: '#4A4A4A', inkLo: '#6B655A',
  inkMute: '#8A8478', line: '#E2DBC9', cream: '#F6F1E8', rust: '#B5502F',
  cardWhite: '#FFFDF9',
}

// nameKey moved to src/lib/school-name-key.ts — the shared exclude-bridge, so
// the on-your-list badge and the intake suggestion exclusion agree.

const DIVISIONS: DiscoveryDivision[] = ['D1', 'D2', 'D3', 'NAIA', 'JUCO']
const REGIONS: DiscoveryRegion[] = ['Northeast', 'Mid-Atlantic', 'Southeast', 'Midwest', 'Southwest', 'West']
const ENROLLMENTS: EnrollmentBand[] = ['under_2k', '2k_5k', '5k_15k', 'over_15k']
const ACADEMICS: AcademicBand[] = ['most_selective', 'highly_selective', 'selective', 'accessible']
const RESULT_CAP = 50

type Proposal = {
  name: string; division: string | null; region: string | null
  reasoning: string; inUniverse: boolean; discoveryId: string | null; verify: boolean
}

// toSchoolInsert moved to src/lib/discovery-add.ts — shared with the
// create-flow starting list so every catalog add takes the same path.

// ─── Facet control primitives ─────────────────────────────────────────────────

// Multi-select facet: a pill that opens a checkbox list. Values OR within the
// facet (results query uses `.in(...)`); facets AND together upstream. The pill
// shows the selection state — the label, the single value's name, or "Label · N".
function MultiFacet<T extends string>({
  label, options, selected, onChange, labelFor, note,
}: {
  label: string; options: readonly T[]; selected: T[]
  onChange: (next: T[]) => void; labelFor?: (v: T) => string; note?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const count = selected.length
  const active = count > 0
  const pillText = count === 0 ? label
    : count === 1 ? (labelFor ? labelFor(selected[0]) : selected[0])
    : `${label} · ${count}`
  const toggle = (v: T) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          appearance: 'none', padding: '7px 12px', fontSize: 13, fontWeight: 500,
          border: `1px solid ${active ? GREEN.accent : SD.line}`,
          background: active ? GREEN.accentSoft : '#fff',
          color: active ? GREEN.accentDeep : SD.inkMid,
          borderRadius: 999, fontFamily: 'inherit', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        }}
      >
        {pillText}<span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30,
          background: '#fff', border: `1px solid ${SD.line}`, borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, minWidth: 200,
        }}>
          {note && (
            <div style={{ fontSize: 11, color: SD.inkMute, lineHeight: 1.4, padding: '4px 10px 8px', borderBottom: `1px solid ${SD.line}`, marginBottom: 4 }}>
              {note}
            </div>
          )}
          {options.map(o => {
            const on = selected.includes(o)
            return (
              <label key={o} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                borderRadius: 6, cursor: 'pointer', fontSize: 13,
                color: on ? GREEN.accentDeep : SD.inkMid, background: on ? GREEN.accentSoft : 'transparent',
              }}>
                <input type="checkbox" checked={on} onChange={() => toggle(o)} style={{ accentColor: GREEN.accent, cursor: 'pointer' }} />
                {labelFor ? labelFor(o) : o}
              </label>
            )
          })}
          {count > 0 && (
            <button onClick={() => onChange([])} style={{
              marginTop: 4, width: '100%', textAlign: 'left', padding: '7px 10px',
              fontSize: 12, fontWeight: 600, color: SD.inkLo, background: 'transparent',
              border: 'none', borderTop: `1px solid ${SD.line}`, cursor: 'pointer', fontFamily: 'inherit',
            }}>Clear</button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DiscoverSection() {
  const supabase = useMemo(() => createClient(), [])
  const { schools, insertSchool } = useSchools()
  // Sport-honest copy (the player's sport; null reads as men's — the only catalog)
  const { player } = usePlayer()
  const browseNoun = sportNoun(player?.sport)

  // Facets
  const [division, setDivision] = useState<DiscoveryDivision[]>([])
  const [region, setRegion] = useState<DiscoveryRegion[]>([])
  const [academic, setAcademic] = useState<AcademicBand[]>([])
  const [enrollment, setEnrollment] = useState<EnrollmentBand[]>([])
  const [programs, setPrograms] = useState<DiscoveryProgram[]>([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [results, setResults] = useState<DiscoverySchool[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Debounce name search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  // Fetch results on facet change
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // TODO(womens-catalog): sport would select the catalog here — discovery_schools
    // is the men's universe and the ONLY catalog today; players.sport routes nothing yet.
    let q = supabase.from('discovery_schools').select('*', { count: 'exact' })
    // Values OR within a facet (.in); facets AND together.
    if (division.length) q = q.in('division', division)
    if (region.length) q = q.in('region', region)
    if (academic.length) q = q.in('academic_band', academic)
    if (enrollment.length) q = q.in('enrollment_band', enrollment)
    // Programs OR within the facet: a row matches if it offers ANY selected program.
    if (programs.length) q = q.overlaps('programs', programs)
    if (debouncedSearch) q = q.ilike('name', `%${debouncedSearch}%`)
    q.order('name').limit(RESULT_CAP).then(({ data, count }) => {
      if (cancelled) return
      setResults((data as DiscoverySchool[]) ?? [])
      setTotal(count ?? 0)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [supabase, division, region, academic, enrollment, programs, debouncedSearch])

  // Working-list index — token-normalized keys for name + short_name + aliases,
  // so the "On your list" badge catches name-form variants ("WPI" vs "Worcester
  // Polytechnic Institute"), not just exact matches.
  const onList = useMemo(() => {
    const set = new Set<string>()
    for (const s of schools) {
      if (s.name) set.add(nameKey(s.name))
      if (s.short_name) set.add(nameKey(s.short_name))
      for (const a of s.aliases ?? []) set.add(nameKey(a))
    }
    set.delete('')
    return set
  }, [schools])
  const isOnList = useCallback((name: string) => onList.has(nameKey(name)), [onList])
  // A discovery row is "on the list" if EITHER its full name or its short_name
  // resolves to a pipeline school — bridges "Case Western Reserve" ↔ "Case Western".
  const isRowListed = useCallback(
    (d: { name: string; short_name: string | null }) =>
      onList.has(nameKey(d.name)) || (!!d.short_name && onList.has(nameKey(d.short_name))),
    [onList]
  )

  // Every pipeline school (any tier) — sent to the similarity route so a current
  // target is never re-proposed even when it isn't in the seed subset.
  const excludeNames = useMemo(() => schools.map(s => s.name), [schools])

  const addDiscovery = useCallback(async (d: DiscoverySchool) => {
    setAdding(prev => new Set(prev).add(d.id))
    const err = await insertSchool(toSchoolInsert(d))
    setAdding(prev => { const n = new Set(prev); n.delete(d.id); return n })
    if (err) alert(`Could not add ${d.name}: ${err.message}`)
  }, [insertSchool])

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])

  const activeFacets = !!(division.length || region.length || academic.length || enrollment.length || programs.length || debouncedSearch)
  const clearFacets = () => {
    setDivision([]); setRegion([]); setAcademic([]); setEnrollment([]); setPrograms([]); setSearch('')
  }

  // ── Find more like these ────────────────────────────────────────────────────
  const workingSeeds = useMemo(
    () => schools
      .filter(s => ['A', 'B', 'C'].includes(s.category) && s.status !== 'Inactive')
      .map(s => ({ name: s.name, division: s.division as string, tier: s.category })),
    [schools]
  )
  const selectedSeeds = useMemo(
    () => results.filter(r => selected.has(r.id)).map(r => ({ name: r.name, division: r.division, tier: null })),
    [results, selected]
  )
  const seeds = selectedSeeds.length >= 3 ? selectedSeeds : workingSeeds
  const canFindMore = seeds.length >= 3

  const [proposals, setProposals] = useState<Proposal[] | null>(null)
  const [proposalsLoading, setProposalsLoading] = useState(false)
  const [proposalError, setProposalError] = useState<string | null>(null)
  const [proposalsCached, setProposalsCached] = useState(false)
  const proposalsRef = useRef<HTMLDivElement>(null)

  const findMore = useCallback(async (force = false) => {
    if (!canFindMore) return
    setProposalsLoading(true)
    setProposalError(null)
    try {
      const res = await fetch('/api/discover/similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seeds, exclude: excludeNames, force }),
      })
      const json = await res.json()
      if (json.error && (!json.proposals || json.proposals.length === 0)) {
        setProposalError('Could not generate suggestions right now. Try again.')
        setProposals([])
      } else {
        setProposals(json.proposals ?? [])
        setProposalsCached(!!json.cached)
      }
      setTimeout(() => proposalsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60)
    } catch {
      setProposalError('Could not generate suggestions right now. Try again.')
      setProposals([])
    } finally {
      setProposalsLoading(false)
    }
  }, [seeds, excludeNames, canFindMore])

  // The typed/suggested name currently being disambiguated, or null.
  const [addFlowName, setAddFlowName] = useState<string | null>(null)

  /** Adopt a catalog row the family CONFIRMED from the matcher's candidates. */
  const adoptCatalogRow = useCallback(async (discoveryId: string) => {
    const { data } = await supabase.from('discovery_schools').select('*').eq('id', discoveryId).single()
    if (data) await addDiscovery(data as DiscoverySchool)
    setAddFlowName(null)
  }, [supabase, addDiscovery])

  const addProposal = useCallback(async (p: Proposal) => {
    if (p.discoveryId) {
      setAdding(prev => new Set(prev).add(p.name))
      const { data } = await supabase.from('discovery_schools').select('*').eq('id', p.discoveryId).single()
      if (data) await addDiscovery(data as DiscoverySchool)
      setAdding(prev => { const n = new Set(prev); n.delete(p.name); return n })
      return
    }
    // OFF-UNIVERSE: this used to insert immediately with a FABRICATED division
    // of 'D3' — a made-up fact that then browsed as if verified, and a duplicate
    // waiting to happen because nothing checked the catalog for another name
    // form of the same school. It now goes through disambiguation: confirm an
    // existing catalog row, or file a proposal with no invented division.
    setAddFlowName(p.name)
  }, [supabase, addDiscovery])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div id="discover" style={{
      background: '#fff', border: `1px solid ${SD.line}`, borderRadius: 14,
      padding: 'clamp(18px, 2.5vw, 24px)', scrollMarginTop: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: SD.ink, fontStyle: 'italic' }}>
          Find schools<span style={{ color: PITCH }}>.</span>
        </h3>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: SD.inkLo, lineHeight: 1.5 }}>
        Browse {browseNoun} programs by the facets that matter, or let Regista find more like the ones you already like.
      </p>

      {/* Facets */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <MultiFacet label="Division" options={DIVISIONS} selected={division} onChange={setDivision} />
        <MultiFacet label="Region" options={REGIONS} selected={region} onChange={setRegion} />
        <MultiFacet label="Academics" options={ACADEMICS} selected={academic} onChange={setAcademic} labelFor={a => ACADEMIC_LABELS[a]} />
        <MultiFacet label="Size" options={ENROLLMENTS} selected={enrollment} onChange={setEnrollment} labelFor={e => ENROLLMENT_LABELS[e]} />
        {/* Programs: multi-select over the six-program vocabulary (migration 062).
            Absence-means-unknown data model — the note keeps the filter honest. */}
        <MultiFacet
          label="Programs"
          options={DISCOVERY_PROGRAMS}
          selected={programs}
          onChange={setPrograms}
          labelFor={p => PROGRAM_LABELS[p]}
          note="Shows schools known to offer these programs."
        />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name…"
          style={{
            padding: '7px 12px', fontSize: 13, borderRadius: 999, border: `1px solid ${SD.line}`,
            background: '#fff', fontFamily: 'inherit', color: SD.ink, minWidth: 140, flex: '1 1 140px', boxSizing: 'border-box',
          }}
        />
        {activeFacets && (
          <button onClick={clearFacets} style={{
            padding: '7px 12px', fontSize: 12, fontWeight: 600, borderRadius: 999,
            border: 'none', background: 'transparent', color: SD.inkLo, cursor: 'pointer', fontFamily: 'inherit',
          }}>Clear</button>
        )}
      </div>

      {/* Result count + find-more */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: SD.inkLo, fontWeight: 600 }}>
          {loading ? 'Searching…' : total === 0 ? 'No matches' : `${total} school${total !== 1 ? 's' : ''}${total > RESULT_CAP ? ` — showing first ${RESULT_CAP}` : ''}`}
        </span>
        <button
          onClick={() => findMore(false)}
          disabled={!canFindMore || proposalsLoading}
          title={canFindMore ? '' : 'Add 3+ schools to your list, or select 3+ results below'}
          style={{
            padding: '8px 16px', fontSize: 12, fontWeight: 700, borderRadius: 999,
            border: 'none', fontFamily: 'inherit',
            background: canFindMore && !proposalsLoading ? GREEN.accent : SD.line,
            color: canFindMore && !proposalsLoading ? CREAM : SD.inkMute,
            cursor: canFindMore && !proposalsLoading ? 'pointer' : 'default',
          }}
        >
          {proposalsLoading ? 'Thinking…'
            : selectedSeeds.length >= 3 ? `Find more like these (${selectedSeeds.length}) →`
            : 'Find more like your list →'}
        </button>
      </div>

      {/* Results */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
        {results.map(d => {
          const listed = isRowListed(d)
          const isAdding = adding.has(d.id)
          const sel = selected.has(d.id)
          return (
            <div key={d.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 8,
              border: `1px solid ${sel ? GREEN.accent : SD.line}`,
              background: sel ? GREEN.accentSoft : SD.cardWhite,
            }}>
              <input type="checkbox" checked={sel} onChange={() => toggleSelect(d.id)}
                style={{ accentColor: GREEN.accent, cursor: 'pointer', flexShrink: 0 }} aria-label={`Select ${d.name}`} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 650, color: SD.ink }}>{d.name}</div>
                <div style={{ fontSize: 11, color: SD.inkLo, marginTop: 1, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>{d.division}</span>
                  <span>· {d.state}</span>
                  <span>· {d.region}</span>
                  {d.academic_band && <span>· {ACADEMIC_LABELS[d.academic_band]}</span>}
                  {d.has_engineering && <span style={{ color: GREEN.accent, fontWeight: 600 }}>· eng</span>}
                </div>
              </div>
              {listed ? (
                <span style={{ fontSize: 11, fontWeight: 700, color: GREEN.accent, whiteSpace: 'nowrap', flexShrink: 0 }}>✓ On your list</span>
              ) : (
                <button onClick={() => addDiscovery(d)} disabled={isAdding} style={{
                  padding: '5px 12px', fontSize: 12, fontWeight: 650, borderRadius: 999,
                  border: `1.3px solid ${GREEN.accent}`, background: 'transparent', color: GREEN.accent,
                  cursor: isAdding ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {isAdding ? 'Adding…' : '+ Add to list'}
                </button>
              )}
            </div>
          )
        })}
        {!loading && results.length === 0 && (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: SD.inkMute, fontStyle: 'italic' }}>
            No schools match these facets. Loosen a filter.
          </div>
        )}
      </div>

      {/* CAN'T FIND IT — always reachable, and deliberately NOT inside the
          Regista suggestions block: it used to live there, which meant a family
          only saw it after clicking "Find more". The one person who needs this
          is the person who has already failed to find their school, so it sits
          with the results. Also the landing point for an off-universe
          suggestion, which is why it takes a seed name. */}
      <div style={{ marginTop: 14 }}>
        {addFlowName !== null ? (
          <AddSchoolFlow
            initialName={addFlowName}
            onAdoptCatalogRow={adoptCatalogRow}
            onProposed={() => setAddFlowName(null)}
            onCancel={() => setAddFlowName(null)}
          />
        ) : (
          <button onClick={() => setAddFlowName('')} style={{
            padding: 0, border: 'none', background: 'none',
            fontSize: 12.5, fontWeight: 650, color: GREEN.accent, cursor: 'pointer',
            fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3,
          }}>
            Can&apos;t find your school? Add it
          </button>
        )}
      </div>

      {/* Proposals */}
      {(proposals !== null || proposalError) && (
        <div ref={proposalsRef} style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${SD.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: GREEN.accent }}>
                Regista · like your list{proposalsCached ? ' · cached' : ''}
              </div>
              <h4 style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: SD.ink, fontStyle: 'italic', letterSpacing: '-0.02em' }}>
                Worth a look<span style={{ color: PITCH }}>.</span>
              </h4>
            </div>
            <button onClick={() => findMore(true)} disabled={proposalsLoading} style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 999,
              border: `1.3px solid ${SD.line}`, background: 'transparent', color: SD.inkLo,
              cursor: proposalsLoading ? 'default' : 'pointer', fontFamily: 'inherit',
            }}>↻ Refresh</button>
          </div>

          {proposalError && <p style={{ margin: 0, fontSize: 13, color: SD.rust }}>{proposalError}</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(proposals ?? []).map(p => {
              const listed = isOnList(p.name)
              const isAdding = adding.has(p.name)
              return (
                <div key={p.name} style={{
                  border: `1px solid ${SD.line}`, borderLeft: `3px solid ${GREEN.accent}`,
                  borderRadius: '0 10px 10px 0', padding: '12px 14px', background: SD.cardWhite,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: SD.ink }}>{p.name}</span>
                      {p.division && <span style={{ fontSize: 11, fontWeight: 600, color: SD.inkLo }}>{p.division}</span>}
                      {p.region && <span style={{ fontSize: 11, color: SD.inkMute }}>· {p.region}</span>}
                      {p.verify && <span style={{ fontSize: 10, fontWeight: 700, color: SD.rust, background: '#FAF0EA', borderRadius: 4, padding: '1px 6px' }}>verify program</span>}
                    </div>
                    {listed ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: GREEN.accent, whiteSpace: 'nowrap' }}>✓ On your list</span>
                    ) : (
                      <button onClick={() => addProposal(p)} disabled={isAdding} style={{
                        padding: '5px 12px', fontSize: 12, fontWeight: 650, borderRadius: 999,
                        border: `1.3px solid ${GREEN.accent}`, background: 'transparent', color: GREEN.accent,
                        cursor: isAdding ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
                      }}>{isAdding ? 'Adding…' : '+ Add to list'}</button>
                    )}
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 12.5, color: SD.inkMid, lineHeight: 1.5 }}>{p.reasoning}</p>
                </div>
              )
            })}
            {proposals !== null && proposals.length === 0 && !proposalError && (
              <p style={{ margin: 0, fontSize: 13, color: SD.inkMute, fontStyle: 'italic' }}>No suggestions came back — try Refresh.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

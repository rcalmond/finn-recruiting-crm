'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSchools } from '@/hooks/useRealtimeData'
import type {
  DiscoverySchool, DiscoveryDivision, DiscoveryRegion,
  EnrollmentBand, AcademicBand, Division, School,
} from '@/lib/types'
import { ENROLLMENT_LABELS, ACADEMIC_LABELS } from '@/lib/types'

const GREEN = { accent: '#2D6A4F', accentSoft: '#D7EFE0', accentDeep: '#1B4332' }
const SD = {
  paper: '#F6F1E8', ink: '#0E0E0E', inkMid: '#4A4A4A', inkLo: '#7A7570',
  inkMute: '#A8A39B', line: '#E2DBC9', cream: '#F6F1E8', rust: '#B5502F',
  cardWhite: '#FFFDF9',
}

// Token-normalized name key (mirrors the server matcher): drop generic words,
// sort tokens, join. Lets "WPI" and "Worcester Polytechnic Institute" collapse to
// the same key so pipeline schools are recognized across name-form differences.
const NAME_STOP = new Set(['university', 'college', 'the', 'of', 'at', 'in', 'univ', 'and'])
function nameKey(s: string): string {
  // Strip a dash-suffix and any parenthetical first — working names carry them
  // ("Illinois Institute of Technology (Illinois Tech)").
  const cleaned = s.split(/\s+[—–-]\s+|\s*\(/)[0]
  return cleaned.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter(t => t && !NAME_STOP.has(t)).sort().join(' ')
}

const DIVISIONS: DiscoveryDivision[] = ['D1', 'D2', 'D3', 'NAIA', 'JUCO']
const REGIONS: DiscoveryRegion[] = ['Northeast', 'Mid-Atlantic', 'Southeast', 'Midwest', 'Southwest', 'West']
const ENROLLMENTS: EnrollmentBand[] = ['under_2k', '2k_5k', '5k_15k', 'over_15k']
const ACADEMICS: AcademicBand[] = ['most_selective', 'highly_selective', 'selective', 'accessible']
const RESULT_CAP = 50

type Proposal = {
  name: string; division: string | null; region: string | null
  reasoning: string; inUniverse: boolean; discoveryId: string | null; verify: boolean
}

// Build the schools-table insert payload from a discovery row. DB `division`
// column is text, so NAIA/JUCO store honestly despite the D1|D2|D3 TS type.
function toSchoolInsert(d: {
  name: string; short_name: string | null; division: string; conference: string | null
  region: string | null; academic_band: AcademicBand | null; has_engineering: boolean
  city: string | null; state?: string | null
}, extraNote?: string): Omit<School, 'id' | 'created_at' | 'updated_at' | 'sort_order'> {
  const location = [d.city, d.state].filter(Boolean).join(', ') || null
  const facetBits = [
    d.region, d.academic_band ? ACADEMIC_LABELS[d.academic_band] : null,
    d.has_engineering ? 'engineering' : null,
  ].filter(Boolean).join(' · ')
  const note = ['Added from Discovery', d.division, facetBits, extraNote].filter(Boolean).join(' · ')
  return {
    name: d.name, short_name: d.short_name, category: 'C', status: 'Not Contacted',
    division: d.division as unknown as Division, conference: d.conference, location,
    last_contact: null, head_coach: null, coach_email: null, admit_likelihood: null,
    rq_status: null, rq_updated_at: null, videos_sent: false,
    last_video_url: null, last_video_title: null, last_video_sent_at: null,
    rq_link: null, notes: note, generic_team_email: null, aliases: [],
    latitude: null, longitude: null, recruiting_stage: 1,
  }
}

// ─── Facet control primitives ─────────────────────────────────────────────────

function FacetSelect<T extends string>({
  value, onChange, options, placeholder, labelFor,
}: {
  value: T | ''; onChange: (v: T | '') => void; options: readonly T[]
  placeholder: string; labelFor?: (v: T) => string
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T | '')}
      style={{
        appearance: 'none', padding: '7px 12px', fontSize: 13, fontWeight: 500,
        border: `1px solid ${value ? GREEN.accent : SD.line}`,
        background: value ? GREEN.accentSoft : '#fff',
        color: value ? GREEN.accentDeep : SD.inkMid,
        borderRadius: 999, fontFamily: 'inherit', cursor: 'pointer',
      }}
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{labelFor ? labelFor(o) : o}</option>)}
    </select>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DiscoverSection() {
  const supabase = useMemo(() => createClient(), [])
  const { schools, insertSchool } = useSchools()

  // Facets
  const [division, setDivision] = useState<DiscoveryDivision | ''>('')
  const [region, setRegion] = useState<DiscoveryRegion | ''>('')
  const [academic, setAcademic] = useState<AcademicBand | ''>('')
  const [enrollment, setEnrollment] = useState<EnrollmentBand | ''>('')
  const [hasEng, setHasEng] = useState(false)
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
    let q = supabase.from('discovery_schools').select('*', { count: 'exact' })
    if (division) q = q.eq('division', division)
    if (region) q = q.eq('region', region)
    if (academic) q = q.eq('academic_band', academic)
    if (enrollment) q = q.eq('enrollment_band', enrollment)
    if (hasEng) q = q.eq('has_engineering', true)
    if (debouncedSearch) q = q.ilike('name', `%${debouncedSearch}%`)
    q.order('name').limit(RESULT_CAP).then(({ data, count }) => {
      if (cancelled) return
      setResults((data as DiscoverySchool[]) ?? [])
      setTotal(count ?? 0)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [supabase, division, region, academic, enrollment, hasEng, debouncedSearch])

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

  const activeFacets = !!(division || region || academic || enrollment || hasEng || debouncedSearch)
  const clearFacets = () => {
    setDivision(''); setRegion(''); setAcademic(''); setEnrollment(''); setHasEng(false); setSearch('')
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

  const addProposal = useCallback(async (p: Proposal) => {
    setAdding(prev => new Set(prev).add(p.name))
    if (p.discoveryId) {
      const { data } = await supabase.from('discovery_schools').select('*').eq('id', p.discoveryId).single()
      if (data) { await addDiscovery(data as DiscoverySchool); setAdding(prev => { const n = new Set(prev); n.delete(p.name); return n }); return }
    }
    // Off-universe proposal — minimal add, flagged for program verification.
    const err = await insertSchool(toSchoolInsert({
      name: p.name, short_name: null, division: p.division ?? 'D3', conference: null,
      region: p.region, academic_band: null, has_engineering: false, city: null, state: null,
    }, 'verify program'))
    setAdding(prev => { const n = new Set(prev); n.delete(p.name); return n })
    if (err) alert(`Could not add ${p.name}: ${err.message}`)
  }, [supabase, insertSchool, addDiscovery])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div id="discover" style={{
      background: '#fff', border: `1px solid ${SD.line}`, borderRadius: 14,
      padding: 'clamp(18px, 2.5vw, 24px)', scrollMarginTop: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: SD.ink, fontStyle: 'italic' }}>
          Find schools.
        </h3>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: SD.inkLo, lineHeight: 1.5 }}>
        Browse men&apos;s soccer programs by the facets that matter, or let the app find more like the ones you already like.
      </p>

      {/* Facets */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <FacetSelect value={division} onChange={setDivision} options={DIVISIONS} placeholder="Division" />
        <FacetSelect value={region} onChange={setRegion} options={REGIONS} placeholder="Region" />
        <FacetSelect value={academic} onChange={setAcademic} options={ACADEMICS} placeholder="Academics" labelFor={a => ACADEMIC_LABELS[a]} />
        <FacetSelect value={enrollment} onChange={setEnrollment} options={ENROLLMENTS} placeholder="Size" labelFor={e => ENROLLMENT_LABELS[e]} />
        <button
          onClick={() => setHasEng(v => !v)}
          style={{
            padding: '7px 12px', fontSize: 13, fontWeight: 500, borderRadius: 999,
            border: `1px solid ${hasEng ? GREEN.accent : SD.line}`,
            background: hasEng ? GREEN.accentSoft : '#fff',
            color: hasEng ? GREEN.accentDeep : SD.inkMid, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {hasEng ? '✓ ' : ''}Engineering
        </button>
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
            color: canFindMore && !proposalsLoading ? '#fff' : SD.inkMute,
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

      {/* Proposals */}
      {(proposals !== null || proposalError) && (
        <div ref={proposalsRef} style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${SD.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: GREEN.accent }}>
                Like your list{proposalsCached ? ' · cached' : ''}
              </div>
              <h4 style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: SD.ink, fontStyle: 'italic', letterSpacing: '-0.02em' }}>
                Worth a look.
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

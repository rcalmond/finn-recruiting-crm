'use client'

/**
 * Catalog proposal review — MERGE FIRST.
 *
 * The screen leads with live near-matches because the most common correct
 * outcome is "this school is already in the catalog under a different name",
 * not "create a new row". Accept is the exception, and it demands division and
 * state from the reviewer rather than inventing them: an accepted row is a STUB
 * and should look like one.
 *
 * Whatever is decided, the family's own row is never deleted, unlinked or
 * re-tiered. A reject leaves them exactly what the legacy unlinked schools
 * already are — a working relationship row with no catalog linkage.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SettingsMasthead, SP, pill } from '@/components/settings/SettingsChrome'

export interface FrozenCandidates {
  tier?: string
  ambiguous?: boolean
  shown?: Array<{ id: string; name: string; division: string | null; state: string | null; via: string }>
}

export interface ProposalRow {
  id: string
  proposedName: string
  familyName: string
  originSchoolId: string | null
  createdAt: string
  frozen: FrozenCandidates
  liveCandidates: Array<{ id: string; name: string; division: string | null; state: string | null; via: string }>
  liveTier: string
}

const DIVISIONS = ['D1', 'D2', 'D3', 'NAIA', 'JUCO']

export default function CatalogProposalsClient({
  rows, catalogError, catalogSize,
}: { rows: ProposalRow[]; catalogError: string | null; catalogSize: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState<string | null>(null)
  // Manual merge target: the reviewer's escape hatch for the cases the matcher
  // DELIBERATELY refuses (Wisconsin Madison, Cal Poly SLO). Without it, the
  // false-negative class the descriptor guard hands to a human is the one class
  // a human cannot resolve.
  const [searchFor, setSearchFor] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Array<{ id: string; name: string; division: string | null; state: string | null; city: string | null }>>([])
  const [searching, setSearching] = useState(false)

  async function runSearch(q: string) {
    setQuery(q)
    if (q.trim().length < 2) { setHits([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/admin/catalog-search?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      setHits(json.rows ?? [])
    } catch { setHits([]) }
    setSearching(false)
  }
  const [form, setForm] = useState<{ name: string; shortName: string; division: string; state: string; city: string }>(
    { name: '', shortName: '', division: '', state: '', city: '' },
  )

  async function act(id: string, body: Record<string, unknown>) {
    setBusy(id); setError(null)
    try {
      const res = await fetch(`/api/admin/catalog-proposals/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setError(json.error ?? `Failed (${res.status})`)
      else { setAccepting(null); router.refresh() }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    }
    setBusy(null)
  }

  return (
    <div>
      <SettingsMasthead
        title="Catalog proposals."
        subtitle="Schools a family could not find. Most are already in the catalog under another name — check the near-matches before creating anything."
      />
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '0 16px 40px' }}>
        {catalogError && (
          <p style={{ fontSize: 13, color: SP.red }}>
            Catalog could not be read ({catalogError}). Near-matches are unavailable — do not accept anything until this is fixed.
          </p>
        )}
        {error && <p style={{ fontSize: 13, color: SP.red }}>{error}</p>}

        {rows.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: SP.ink }}>Nothing waiting.</div>
            <div style={{ fontSize: 13, color: SP.inkLo }}>Every proposed school has been resolved.</div>
          </div>
        )}

        {rows.map(r => (
          <div key={r.id} style={{
            border: `1px solid ${SP.line}`, borderRadius: 12, padding: 16,
            marginTop: 14, background: SP.white,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: SP.ink }}>{r.proposedName}</div>
                <div style={{ fontSize: 12, color: SP.inkMute }}>
                  {r.familyName} · {new Date(r.createdAt).toLocaleDateString()}
                  {r.originSchoolId ? '' : ' · no family row recorded'}
                </div>
              </div>
              <button style={pill('ghost', busy === r.id)} disabled={busy === r.id}
                onClick={() => act(r.id, { action: 'reject', note: 'not a program we should carry' })}>
                Reject
              </button>
            </div>

            {/* ── Live near-matches: the merge path, first ── */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: SP.ink, marginBottom: 6 }}>
                {r.liveCandidates.length > 0
                  ? `Already in the catalog? (${r.liveTier} match — ${catalogSize} rows checked)`
                  : `No near-match in the catalog (${catalogSize} rows checked)`}
              </div>
              {r.liveCandidates.map(c => (
                <div key={c.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                  padding: '8px 10px', border: `1px solid ${SP.line}`, borderRadius: 8, marginBottom: 6,
                }}>
                  <span style={{ fontSize: 13 }}>
                    <b>{c.name}</b>{' '}
                    <span style={{ color: SP.inkLo }}>{[c.division, c.state].filter(Boolean).join(' · ')}</span>
                  </span>
                  <button style={pill('accent', busy === r.id)} disabled={busy === r.id}
                    onClick={() => act(r.id, { action: 'merge', discoveryId: c.id, note: `merged into ${c.name}` })}>
                    Merge into this
                  </button>
                </div>
              ))}
            </div>

            {/* ── Manual merge target ── */}
            <div style={{ marginTop: 8 }}>
              {searchFor === r.id ? (
                <div>
                  <input
                    autoFocus
                    value={query}
                    onChange={e => runSearch(e.target.value)}
                    placeholder="Search the catalog by any name…"
                    style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: `1px solid ${SP.line}`, borderRadius: 7, fontFamily: 'inherit', marginBottom: 6 }}
                  />
                  {searching && <div style={{ fontSize: 12, color: SP.inkMute }}>Searching…</div>}
                  {!searching && query.trim().length >= 2 && hits.length === 0 && (
                    <div style={{ fontSize: 12, color: SP.inkMute }}>Nothing in the catalog matches that.</div>
                  )}
                  {hits.map(h => (
                    <div key={h.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                      padding: '7px 10px', border: `1px solid ${SP.line}`, borderRadius: 8, marginBottom: 5,
                    }}>
                      <span style={{ fontSize: 13 }}>
                        <b>{h.name}</b>{' '}
                        <span style={{ color: SP.inkLo }}>{[h.division, h.state, h.city].filter(Boolean).join(' · ')}</span>
                      </span>
                      <button style={pill('accent', busy === r.id)} disabled={busy === r.id}
                        onClick={() => act(r.id, { action: 'merge', discoveryId: h.id, note: `merged into ${h.name} (found by reviewer search)` })}>
                        Merge into this
                      </button>
                    </div>
                  ))}
                  <button style={pill('ghost', false)} onClick={() => { setSearchFor(null); setQuery(''); setHits([]) }}>Close search</button>
                </div>
              ) : (
                <button style={pill('ghost', false)}
                  onClick={() => { setSearchFor(r.id); setQuery(''); setHits([]) }}>
                  Search the catalog myself
                </button>
              )}
            </div>

            {/* ── What the family was shown and declined ── */}
            {(r.frozen?.shown?.length ?? 0) > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 12, color: SP.inkLo, cursor: 'pointer' }}>
                  The family saw {r.frozen.shown!.length} candidate(s) and said none matched
                </summary>
                <div style={{ fontSize: 12, color: SP.inkMute, marginTop: 6 }}>
                  {r.frozen.shown!.map(c => `${c.name} [${[c.division, c.state].filter(Boolean).join(' ')}]`).join(' · ')}
                </div>
              </details>
            )}

            {/* ── Accept: create a stub, with reviewer-supplied facts only ── */}
            {accepting === r.id ? (
              <div style={{ marginTop: 12, borderTop: `1px solid ${SP.line}`, paddingTop: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <input placeholder="Catalog name" value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    style={{ flex: '1 1 200px', padding: '6px 9px', fontSize: 13, border: `1px solid ${SP.line}`, borderRadius: 7, fontFamily: 'inherit' }} />
                  <input placeholder="Short name (optional)" value={form.shortName}
                    onChange={e => setForm({ ...form, shortName: e.target.value })}
                    style={{ flex: '1 1 140px', padding: '6px 9px', fontSize: 13, border: `1px solid ${SP.line}`, borderRadius: 7, fontFamily: 'inherit' }} />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <select value={form.division} onChange={e => setForm({ ...form, division: e.target.value })}
                    style={{ padding: '6px 9px', fontSize: 13, border: `1px solid ${SP.line}`, borderRadius: 7, fontFamily: 'inherit' }}>
                    <option value="">Division…</option>
                    {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input placeholder="State (e.g. CA)" maxLength={2} value={form.state}
                    onChange={e => setForm({ ...form, state: e.target.value.toUpperCase() })}
                    style={{ width: 110, padding: '6px 9px', fontSize: 13, border: `1px solid ${SP.line}`, borderRadius: 7, fontFamily: 'inherit' }} />
                  <input placeholder="City (optional)" value={form.city}
                    onChange={e => setForm({ ...form, city: e.target.value })}
                    style={{ flex: '1 1 140px', padding: '6px 9px', fontSize: 13, border: `1px solid ${SP.line}`, borderRadius: 7, fontFamily: 'inherit' }} />
                </div>
                <p style={{ fontSize: 11.5, color: SP.inkMute, margin: '0 0 8px' }}>
                  Conference, bands, programs and domains stay empty — an accepted row is a stub, and
                  domains are only ever filled from observed coach addresses.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={pill('accent', busy === r.id || !form.division || !form.state)}
                    disabled={busy === r.id || !form.division || !form.state}
                    onClick={() => act(r.id, {
                      action: 'accept', name: form.name || r.proposedName, shortName: form.shortName || null,
                      division: form.division, state: form.state, city: form.city || null,
                    })}>
                    Create catalog row
                  </button>
                  <button style={pill('ghost', false)} onClick={() => setAccepting(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button style={{ ...pill('ghost', false), marginTop: 10 }}
                onClick={() => { setAccepting(r.id); setForm({ name: r.proposedName, shortName: '', division: '', state: '', city: '' }) }}>
                Not in the catalog — create it
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

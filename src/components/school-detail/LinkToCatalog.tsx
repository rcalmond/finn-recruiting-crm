'use client'

/**
 * LinkToCatalog — the affordance on an unlinked school.
 *
 * A school with no catalog linkage is not broken, but it is limited: nothing
 * the shared catalog learns can reach it. That state arrives by several routes
 * (auto-add, a family proposal, an import, a rejected proposal that stays on
 * the list) so it needs a way out that is not a database migration.
 *
 * Confirmation always shows DIVISION, STATE and CITY, because those are the
 * discriminators that separate the rows a name alone cannot — Trinity (TX) from
 * Trinity (CT), Rochester (NY) from Rochester (MI). Picking from names alone is
 * how a school gets attached to another school's coaches and camps.
 */
import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Row {
  id: string
  name: string
  short_name: string | null
  division: string | null
  state: string | null
  city: string | null
}

export default function LinkToCatalog({
  schoolId, schoolName, tokens,
}: {
  schoolId: string
  schoolName: string
  tokens: { ink: string; inkMid: string; inkLo: string; inkMute: string; line: string; accent: string; soft: string; cream: string; rust: string }
}) {
  const router = useRouter()
  const T = tokens
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Every keystroke fires a search, and replies do not arrive in the order they
  // were sent. Without this, typing "Wisconsin" showed the results for "wi" —
  // an earlier, slower response overwriting a later one, so the list looked
  // authoritative and was answering a question the user had already moved past.
  const seqRef = useRef(0)

  const search = useCallback(async (text: string) => {
    setQ(text); setError(null)
    const seq = ++seqRef.current
    if (text.trim().length < 2) { setRows([]); setSearching(false); return }
    setSearching(true)
    try {
      const u = new URL('/api/catalog-search', window.location.origin)
      u.searchParams.set('q', text)
      const json = await (await fetch(u.toString())).json()
      if (seq !== seqRef.current) return          // a newer keystroke won
      setRows(json.rows ?? [])
    } catch {
      if (seq === seqRef.current) setRows([])
    }
    if (seq === seqRef.current) setSearching(false)
  }, [])

  const link = useCallback(async (row: Row) => {
    setBusy(row.id); setError(null)
    try {
      const res = await fetch(`/api/schools/${schoolId}/link`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discoveryId: row.id, how: `matched by hand from "${schoolName}"` }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setError(json.error ?? `Could not link (${res.status})`)
      else { setOpen(false); router.refresh() }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not link')
    }
    setBusy(null)
  }, [schoolId, schoolName, router])

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        padding: 0, border: 'none', background: 'none', fontSize: 12,
        color: T.accent, cursor: 'pointer', fontFamily: 'inherit',
        textDecoration: 'underline', textUnderlineOffset: 3,
      }}>
        Not in the shared catalog — link it
      </button>
    )
  }

  return (
    <div style={{
      border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.accent}`,
      borderRadius: '0 10px 10px 0', padding: '12px 14px', background: '#fff',
      display: 'flex', flexDirection: 'column', gap: 8, minWidth: 320, maxWidth: 520,
    }}>
      <div style={{ fontSize: 12.5, color: T.inkMid }}>
        Find <b>{schoolName}</b> in the shared catalog. It may be listed under a different name.
      </div>
      <input
        autoFocus
        value={q}
        onChange={e => search(e.target.value)}
        placeholder="Search the catalog…"
        style={{
          padding: '7px 10px', fontSize: 13, fontFamily: 'inherit',
          border: `1px solid ${T.line}`, borderRadius: 7, background: '#fff', color: T.ink,
        }}
      />
      {error && <div style={{ fontSize: 12, color: T.rust }}>{error}</div>}
      {searching && <div style={{ fontSize: 12, color: T.inkMute }}>Searching…</div>}
      {!searching && q.trim().length >= 2 && rows.length === 0 && (
        <div style={{ fontSize: 12, color: T.inkMute }}>Nothing in the catalog matches that.</div>
      )}
      {rows.map(r => (
        <div key={r.id} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '7px 10px', border: `1px solid ${T.line}`, borderRadius: 8, background: T.soft,
        }}>
          <span style={{ fontSize: 13 }}>
            <b>{r.name}</b>{' '}
            <span style={{ color: T.inkLo }}>{[r.division, r.state, r.city].filter(Boolean).join(' · ')}</span>
          </span>
          <button onClick={() => link(r)} disabled={busy !== null} style={{
            padding: '5px 12px', fontSize: 12, fontWeight: 650, borderRadius: 999,
            border: `1.3px solid ${T.accent}`, background: T.accent, color: T.cream,
            cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>{busy === r.id ? 'Linking…' : 'This one'}</button>
        </div>
      ))}
      <button onClick={() => { setOpen(false); setQ(''); setRows([]); setError(null) }} style={{
        alignSelf: 'flex-start', padding: 0, border: 'none', background: 'none',
        fontSize: 12, color: T.inkMute, cursor: 'pointer', fontFamily: 'inherit',
      }}>Cancel</button>
    </div>
  )
}

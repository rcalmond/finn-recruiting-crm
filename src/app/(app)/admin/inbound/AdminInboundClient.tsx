'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SettingsMasthead, SP, pill } from '@/components/settings/SettingsChrome'

export interface QuarantineRow {
  id: string
  received_at: string
  envelope_to: string[] | null
  envelope_from: string | null
  header_from: string | null
  header_to: string | null
  subject: string | null
  reason: string
  matched_family_ids: string[] | null
  status: string
  resolved_at: string | null
  resolver_note: string | null
  resolved_by_email: string | null
}
export interface FamilyOption { id: string; name: string | null }
export interface AddressRow {
  id: string
  family_id: string
  address: string
  status: string
  label: string | null
  created_at: string
  minted_by_email: string | null
}

const REASON_COPY: Record<string, string> = {
  no_match: 'No registered address matched',
  ambiguous: 'Matched more than one family',
  retired_address: 'Address is retired',
  malformed_envelope: 'Envelope missing or unparseable',
  mode_conflict: 'Family has both OAuth sync and forwarding',
}

export default function AdminInboundClient({
  rows, families, addresses,
}: { rows: QuarantineRow[]; families: FamilyOption[]; addresses: AddressRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [assign, setAssign] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [mintFamily, setMintFamily] = useState('')
  const [minted, setMinted] = useState<string | null>(null)
  const [mintCopied, setMintCopied] = useState(false)

  const pending = rows.filter(r => r.status === 'new')
  const done = rows.filter(r => r.status !== 'new')

  async function act(id: string, action: 'replay' | 'discard') {
    setBusy(id); setError(null)
    try {
      const res = await fetch(`/api/admin/quarantine/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, familyId: action === 'replay' ? assign[id] : undefined }),
      })
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? `Failed (${res.status})`)
      else router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    }
    setBusy(null)
  }

  async function mint(allowAdditional: boolean) {
    if (!mintFamily) return
    setBusy('mint'); setError(null); setMinted(null)
    try {
      const res = await fetch('/api/admin/inbound-address', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ familyId: mintFamily, allowAdditional }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.address) {
        setMinted(json.address as string)
        router.refresh()
      } else if (json.reason === 'already_has_active') {
        setError(`That family already has an active address (${(json.existing ?? []).join(', ')}). Use "Add another" if a second is genuinely wanted.`)
      } else {
        setError(json.error ?? json.reason ?? `Failed (${res.status})`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    }
    setBusy(null)
  }

  const addressesByFamily = new Map<string, AddressRow[]>()
  for (const a of addresses) {
    const list = addressesByFamily.get(a.family_id) ?? []
    list.push(a)
    addressesByFamily.set(a.family_id, list)
  }

  return (
    <div style={{ minHeight: '100vh', background: SP.paper, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px 80px' }}>
        <SettingsMasthead
          title="Inbound quarantine"
          subtitle="Mail that arrived but could not be routed to a family. Nothing here has been written to any family's timeline."
          pending={pending.length > 0 ? `${pending.length} awaiting review` : null}
        />

        {error && <div style={{ marginBottom: 14, fontSize: 12.5, color: SP.red }}>{error}</div>}

        {/* ── Inbound addresses: mint + roster ──────────────────────────────
            With the T1 create-family script, this is the onboarding core:
            family row, user row, seeded questions, minted inbound address. */}
        <div style={{ background: SP.white, border: `1px solid ${SP.line}`, borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, fontStyle: 'italic', color: SP.ink, marginBottom: 4 }}>
            Inbound addresses<span style={{ color: SP.teal }}>.</span>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: SP.inkLo, lineHeight: 1.5 }}>
            Minting is all a new family needs — SendGrid Parse is configured domain-wide,
            so a fresh address receives mail the moment it exists.
          </p>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <select
              value={mintFamily}
              onChange={e => { setMintFamily(e.target.value); setMinted(null) }}
              style={{
                padding: '7px 10px', borderRadius: 8, border: `1px solid ${SP.line2}`,
                background: SP.white, fontSize: 12.5, fontFamily: 'inherit', color: SP.ink,
              }}
            >
              <option value="">Mint for family…</option>
              {families.map(f => <option key={f.id} value={f.id}>{f.name ?? f.id.slice(0, 8)}</option>)}
            </select>
            <button style={pill('accent', !mintFamily || busy === 'mint')} disabled={!mintFamily || busy === 'mint'}
              onClick={() => mint(false)}>
              {busy === 'mint' ? 'Minting…' : 'Mint address'}
            </button>
            <button style={pill('ghost', !mintFamily || busy === 'mint')} disabled={!mintFamily || busy === 'mint'}
              onClick={() => mint(true)}>
              Add another
            </button>
          </div>

          {minted && (
            <div style={{
              background: SP.tealSoft, border: '1px solid #CFE0D5', borderRadius: 10,
              padding: '10px 14px', marginBottom: 12,
            }}>
              <div style={{ fontSize: 12, fontWeight: 650, color: SP.ink, marginBottom: 4 }}>Minted — give this to the family</div>
              <code
                onClick={async () => {
                  try { await navigator.clipboard.writeText(minted); setMintCopied(true); setTimeout(() => setMintCopied(false), 2000) } catch { /* noop */ }
                }}
                title="Click to copy"
                style={{
                  background: mintCopied ? '#DCFCE7' : SP.white, padding: '5px 9px', borderRadius: 6,
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 13, cursor: 'pointer', color: SP.ink,
                }}
              >
                {mintCopied ? 'copied!' : minted}
              </code>
            </div>
          )}

          {families.map(f => {
            const list = addressesByFamily.get(f.id) ?? []
            return (
              <div key={f.id} style={{ fontSize: 12, color: SP.inkMid, padding: '5px 0', borderTop: `1px solid ${SP.line}` }}>
                <b>{f.name ?? f.id.slice(0, 8)}</b>
                {list.length === 0
                  ? <span style={{ color: SP.red }}> — no inbound address</span>
                  : list.map(a => (
                      <span key={a.id} style={{ color: a.status === 'active' ? SP.inkMid : SP.inkMute }}>
                        {' · '}{a.address}{a.status !== 'active' ? ` (${a.status})` : ''}
                        <span style={{ color: SP.inkMute }}>
                          {a.minted_by_email ? ` — minted by ${a.minted_by_email}` : ' — minted by (unrecorded)'}
                        </span>
                      </span>
                    ))}
              </div>
            )
          })}
        </div>

        {pending.length === 0 && (
          <div style={{
            background: SP.white, border: `1px solid ${SP.line}`, borderRadius: 14,
            padding: '38px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 15, fontWeight: 650, fontStyle: 'italic', color: SP.ink, marginBottom: 6 }}>
              Nothing quarantined.
            </div>
            <div style={{ fontSize: 13, color: SP.inkLo }}>
              Every message that arrived resolved to exactly one family.
            </div>
          </div>
        )}

        {pending.map(r => (
          <div key={r.id} style={{ background: SP.white, border: `1px solid ${SP.line}`, borderRadius: 14, padding: '16px 18px', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 650, color: SP.ink }}>{r.subject || '(no subject)'}</div>
                <div style={{ fontSize: 12, color: SP.inkLo, marginTop: 3 }}>
                  {new Date(r.received_at).toLocaleString()} · from {r.header_from || r.envelope_from || 'unknown'}
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                background: SP.paperDeep, color: SP.ink, whiteSpace: 'nowrap', height: 'fit-content',
              }}>
                {REASON_COPY[r.reason] ?? r.reason}
              </span>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: SP.inkMid, lineHeight: 1.6 }}>
              <div><b>envelope.to</b> (the routing input): {(r.envelope_to ?? []).join(', ') || '—'}</div>
              <div style={{ color: SP.inkLo }}><b>To header</b> (never routed on): {r.header_to || '—'}</div>
              {(r.matched_family_ids ?? []).length > 0 && (
                <div>Matched families: {(r.matched_family_ids ?? []).length}</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
              <select
                value={assign[r.id] ?? ''}
                onChange={e => setAssign(a => ({ ...a, [r.id]: e.target.value }))}
                style={{
                  padding: '7px 10px', borderRadius: 8, border: `1px solid ${SP.line2}`,
                  background: SP.white, fontSize: 12.5, fontFamily: 'inherit', color: SP.ink,
                }}
              >
                <option value="">Assign to family…</option>
                {families.map(f => <option key={f.id} value={f.id}>{f.name ?? f.id.slice(0, 8)}</option>)}
              </select>
              <button
                style={pill('accent', !assign[r.id] || busy === r.id)}
                disabled={!assign[r.id] || busy === r.id}
                onClick={() => act(r.id, 'replay')}
              >
                {busy === r.id ? 'Working…' : 'Replay into family'}
              </button>
              <button style={pill('ghost', busy === r.id)} disabled={busy === r.id} onClick={() => act(r.id, 'discard')}>
                Discard
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11.5, color: SP.inkMute }}>
              Replay runs the identical ingestion path, dedup included — a message that also arrived another way collapses instead of duplicating.
            </div>
          </div>
        ))}

        {done.length > 0 && (
          <details style={{ marginTop: 20 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 650, color: SP.ink }}>
              Resolved ({done.length})
            </summary>
            <div style={{ marginTop: 10 }}>
              {done.map(r => (
                <div key={r.id} style={{ fontSize: 12, color: SP.inkLo, padding: '6px 0', borderBottom: `1px solid ${SP.line}` }}>
                  {new Date(r.received_at).toLocaleDateString()} · {r.subject || '(no subject)'} · <b>{r.status}</b>
                  {r.resolved_by_email ? ` by ${r.resolved_by_email}` : ' by (unrecorded)'}
                  {r.resolver_note ? ` — ${r.resolver_note}` : ''}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

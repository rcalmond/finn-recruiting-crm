'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SettingsMasthead, SP, pill } from '@/components/settings/SettingsChrome'

export interface OrphanRow {
  id: string
  sent_at: string | null
  date: string | null
  channel: string
  direction: string
  coach_name: string | null
  summary: string | null
  parse_notes: string | null
}
export interface SchoolOption { id: string; name: string; short_name: string | null; category: string }
export interface AutoAddedRow { id: string; name: string; origin_note: string | null; created_at: string; category: string }

export default function UnmatchedClient({
  orphans, schools, autoAdded,
}: { orphans: OrphanRow[]; schools: SchoolOption[]; autoAdded: AutoAddedRow[] }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [busy, setBusy] = useState<string | null>(null)
  const [pick, setPick] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  async function act(id: string, action: 'attach' | 'dismiss') {
    setBusy(id); setError(null)
    try {
      const res = await fetch(`/api/unmatched/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, schoolId: action === 'attach' ? pick[id] : undefined }),
      })
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? `Failed (${res.status})`)
      else router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    }
    setBusy(null)
  }

  // Undo an auto-add by RE-TIERING to the bench, never deleting: the schools row
  // IS the relationship and contact_log cascades from it, so deleting would
  // destroy the coach message that justified the add.
  async function undoAutoAdd(schoolId: string) {
    setBusy(schoolId); setError(null)
    const { error: err } = await supabase.from('schools').update({ category: 'Nope' }).eq('id', schoolId)
    if (err) setError(err.message)
    else router.refresh()
    setBusy(null)
  }

  const active = schools.filter(s => s.category !== 'Nope')

  return (
    <div style={{ minHeight: '100vh', background: SP.paper, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 80px' }}>
        <SettingsMasthead
          title="Unmatched"
          subtitle="Mail that reached you but didn't match a school. Attach it where it belongs, or dismiss it — nothing here is feeding your summaries yet."
          pending={orphans.length > 0 ? `${orphans.length} waiting` : null}
        />

        {error && <div style={{ marginBottom: 14, fontSize: 12.5, color: SP.red }}>{error}</div>}

        {orphans.length === 0 && (
          <div style={{
            background: SP.white, border: `1px solid ${SP.line}`, borderRadius: 14,
            padding: '38px 24px', textAlign: 'center',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', background: SP.tealSoft, color: SP.tealDeep,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px', fontSize: 16, fontWeight: 700,
            }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 650, fontStyle: 'italic', color: SP.ink, marginBottom: 6 }}>
              Everything matched.
            </div>
            <div style={{ fontSize: 13, color: SP.inkLo, maxWidth: 380, margin: '0 auto', lineHeight: 1.55 }}>
              Every message that arrived found its school.
            </div>
          </div>
        )}

        {orphans.map(o => (
          <div key={o.id} style={{ background: SP.white, border: `1px solid ${SP.line}`, borderRadius: 14, padding: '16px 18px', marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: SP.inkLo }}>
              {(o.sent_at ?? o.date ?? '').slice(0, 10)} · {o.channel} · {o.direction}
              {o.coach_name ? ` · ${o.coach_name}` : ''}
            </div>
            <div style={{ fontSize: 13.5, color: SP.ink, marginTop: 6, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {(o.summary ?? '').slice(0, 400)}{(o.summary ?? '').length > 400 ? '…' : ''}
            </div>
            {o.parse_notes && (
              <div style={{ fontSize: 11.5, color: SP.inkMute, marginTop: 6 }}>{o.parse_notes}</div>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <select
                value={pick[o.id] ?? ''}
                onChange={e => setPick(p => ({ ...p, [o.id]: e.target.value }))}
                style={{
                  padding: '7px 10px', borderRadius: 8, border: `1px solid ${SP.line2}`,
                  background: SP.white, fontSize: 12.5, fontFamily: 'inherit', color: SP.ink,
                }}
              >
                <option value="">Attach to a school…</option>
                {active.map(s => <option key={s.id} value={s.id}>{s.short_name || s.name}</option>)}
              </select>
              <button style={pill('accent', !pick[o.id] || busy === o.id)} disabled={!pick[o.id] || busy === o.id}
                onClick={() => act(o.id, 'attach')}>
                {busy === o.id ? 'Working…' : 'Attach'}
              </button>
              <button style={pill('ghost', busy === o.id)} disabled={busy === o.id} onClick={() => act(o.id, 'dismiss')}>
                Not a coach
              </button>
            </div>
          </div>
        ))}

        {autoAdded.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 15, fontWeight: 700, fontStyle: 'italic', color: SP.ink, marginBottom: 4 }}>
              Added for you<span style={{ color: SP.teal }}>.</span>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: SP.inkLo, lineHeight: 1.5 }}>
              A coach reached out about these, so we put them on your list at C-tier. Undo moves a school to your bench — the message stays.
            </p>
            {autoAdded.map(a => (
              <div key={a.id} style={{
                background: SP.white, border: `1px solid ${SP.line}`, borderRadius: 12,
                padding: '12px 14px', marginBottom: 8,
                display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 650, color: SP.ink }}>
                    {a.name}{a.category === 'Nope' ? ' — benched' : ''}
                  </div>
                  <div style={{ fontSize: 11.5, color: SP.inkLo, marginTop: 2 }}>{a.origin_note ?? 'auto-added from inbound mail'}</div>
                </div>
                {a.category !== 'Nope' && (
                  <button style={pill('ghost', busy === a.id)} disabled={busy === a.id} onClick={() => undoAutoAdd(a.id)}>
                    Undo
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

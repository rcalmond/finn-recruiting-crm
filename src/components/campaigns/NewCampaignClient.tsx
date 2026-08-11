'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { School, Coach, Message } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { CampaignMasthead, CampaignConcept, CampaignStepper, cbtn, CC } from './CampaignChrome'

// ── Style helpers ─────────────────────────────────────────────────────────────

function inputStyle(multiline = false): React.CSSProperties {
  return {
    width: '100%', boxSizing: 'border-box',
    padding: '8px 12px', borderRadius: 8,
    border: `1px solid ${CC.line}`,
    fontSize: 13, color: CC.ink, background: CC.white,
    outline: 'none', fontFamily: 'inherit',
    ...(multiline ? { resize: 'vertical', minHeight: 180 } : {}),
  }
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 700,
  color: CC.ink, marginBottom: 6, letterSpacing: -0.1,
}

const sublabelStyle: React.CSSProperties = {
  fontSize: 12, color: CC.inkLo, marginBottom: 10, lineHeight: 1.5,
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  schools: School[]
  coachBySchool: Record<string, Coach>
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NewCampaignClient({ schools, coachBySchool }: Props) {
  const router = useRouter()

  // Step 1 = Who, Step 2 = What
  const [step, setStep] = useState<1 | 2>(1)

  // ── Pickability ─────────────────────────────────────────────────────────────
  // A school is pickable when its primary coach is on file WITH an email — that's
  // the coach the campaign will actually write to. Anything else is disabled with
  // a reason, so a first-timer knows exactly why and what to do about it.

  const nonNope = useMemo(() => schools.filter(s => s.category !== 'Nope'), [schools])
  function coachEmail(id: string): string | null { return coachBySchool[id]?.email ?? null }
  function pickable(id: string): boolean { return !!coachEmail(id) }

  const abTier = nonNope.filter(s => s.category === 'A' || s.category === 'B')
  const cTier  = nonNope.filter(s => s.category === 'C')

  // Default selection: A/B schools that are pickable
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(abTier.filter(s => pickable(s.id)).map(s => s.id))
  )
  const [showCTier, setShowCTier] = useState(false)

  // ── Step 2 (What) state ──────────────────────────────────────────────────────
  const [campaignName, setCampaignName]     = useState('')
  const [messageSet, setMessageSet]         = useState('')
  const [inventoryMessages, setInventoryMessages] = useState<Message[]>([])
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set())
  const [msgTypeFilter, setMsgTypeFilter]   = useState<'all' | 'update' | 'question'>('all')

  useEffect(() => {
    const sb = createClient()
    sb.from('messages').select('*').eq('status', 'active').order('type').order('title')
      .then(({ data }) => { if (data) setInventoryMessages(data as Message[]) })
  }, [])

  // Submission
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // ── Derived ──────────────────────────────────────────────────────────────────

  const selectedSchools = nonNope.filter(s => selected.has(s.id))
  const coachCount = selectedSchools.filter(s => pickable(s.id)).length
  const canAdvanceWho = coachCount > 0
  const canCreate = canAdvanceWho && campaignName.trim().length > 0

  // ── Handlers ───────────────────────────────────────────────────────────────

  function toggleSchool(id: string) {
    if (!pickable(id)) return
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleTier(tier: 'A' | 'B' | 'C', checked: boolean) {
    const ids = nonNope.filter(s => s.category === tier && pickable(s.id)).map(s => s.id)
    setSelected(prev => {
      const next = new Set(prev)
      ids.forEach(id => checked ? next.add(id) : next.delete(id))
      return next
    })
  }

  function tierCount(tier: string) {
    return nonNope.filter(s => s.category === tier && selected.has(s.id)).length
  }

  async function handleCreate() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName.trim(),
          throttleDays: 7,
          schoolIds: selectedSchools.filter(s => pickable(s.id)).map(s => s.id),
          messageSet: messageSet.trim() || undefined,
          sourceMessageIds: selectedMsgIds.size > 0 ? Array.from(selectedMsgIds) : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to create campaign'); return }
      router.push(`/campaigns/${json.campaignId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error')
    } finally {
      setSubmitting(false)
    }
  }

  // ── School row ────────────────────────────────────────────────────────────

  function SchoolRow({ s }: { s: School }) {
    const ok = pickable(s.id)
    const coach = coachBySchool[s.id]
    const tierBg = s.category === 'A' ? '#FEE2E2' : s.category === 'B' ? '#DBEAFE' : '#F3F4F6'
    const tierColor = s.category === 'A' ? '#991B1B' : s.category === 'B' ? '#1E40AF' : '#374151'
    return (
      <label style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 8,
        cursor: ok ? 'pointer' : 'default',
        opacity: ok ? 1 : 0.65,
        background: selected.has(s.id) ? CC.tealSoft : 'transparent',
      }}>
        <input
          type="checkbox"
          checked={selected.has(s.id)}
          disabled={!ok}
          onChange={() => toggleSchool(s.id)}
          style={{ flexShrink: 0 }}
        />
        <span style={{ fontSize: 13, fontWeight: 550, color: CC.ink }}>{s.name}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: tierBg, color: tierColor }}>
          {s.category}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, textAlign: 'right' }}>
          {ok ? (
            <span style={{ color: CC.inkLo }}>{coach?.name} · has email</span>
          ) : (
            <span style={{ color: CC.amber }}>
              No coach email on file — add one on the school page
            </span>
          )}
        </span>
      </label>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 64px' }}>

      <CampaignMasthead
        title={step === 1 ? 'Who gets this?' : 'What are you saying?'}
        back={{ href: '/campaigns', label: 'Campaigns' }}
      />

      <CampaignStepper current={step} />

      {/* ── Step 1: WHO ──────────────────────────────────────────────────────── */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          <CampaignConcept />

          <div>
            <div style={labelStyle}>Pick the schools this campaign goes to</div>
            <div style={sublabelStyle}>
              Only schools with a coach email on file can be picked — that&apos;s who the email gets written to.
              Others are greyed out with the reason. You can fine-tune the list after too.
            </div>
          </div>

          {/* Tier quick-select */}
          <div style={{
            background: CC.paper, border: `1px solid ${CC.line}`,
            borderRadius: 10, padding: '12px 16px',
            display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: CC.inkLo }}>Select all by tier:</span>
            {(['A', 'B', 'C'] as const).map(tier => {
              const tierPickable = nonNope.filter(s => s.category === tier && pickable(s.id))
              const allOn = tierPickable.length > 0 && tierPickable.every(s => selected.has(s.id))
              return (
                <label key={tier} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={allOn}
                    disabled={tierPickable.length === 0}
                    onChange={e => { toggleTier(tier, e.target.checked); if (tier === 'C' && e.target.checked) setShowCTier(true) }}
                  />
                  <span>Tier {tier}</span>
                  <span style={{ fontSize: 11, color: CC.inkLo }}>({tierCount(tier)}/{tierPickable.length})</span>
                </label>
              )
            })}
          </div>

          {/* A + B schools */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: CC.ink, marginBottom: 6 }}>Tier A &amp; B</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {abTier.map(s => <SchoolRow key={s.id} s={s} />)}
            </div>
          </div>

          {/* C tier (collapsed) */}
          <div>
            <button
              onClick={() => setShowCTier(p => !p)}
              style={{ fontSize: 12, color: CC.inkLo, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span>{showCTier ? '▾' : '▸'}</span>
              <span>Tier C ({tierCount('C')}/{cTier.filter(s => pickable(s.id)).length} selected)</span>
            </button>
            {showCTier && (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {cTier.map(s => <SchoolRow key={s.id} s={s} />)}
              </div>
            )}
          </div>

          {/* Sticky-ish footer: live count + next */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap', marginTop: 4,
            paddingTop: 16, borderTop: `1px solid ${CC.line}`,
          }}>
            <span style={{ fontSize: 13, color: CC.inkMid }}>
              {coachCount > 0
                ? <><strong style={{ color: CC.ink }}>{coachCount}</strong> coach{coachCount === 1 ? '' : 'es'} at <strong style={{ color: CC.ink }}>{coachCount}</strong> school{coachCount === 1 ? '' : 's'} — one email each</>
                : 'Pick at least one school with a coach email'}
            </span>
            <button onClick={() => setStep(2)} disabled={!canAdvanceWho} style={cbtn('primary', !canAdvanceWho)}>
              Next: What to say →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: WHAT ─────────────────────────────────────────────────────── */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div style={{
            background: CC.paper, border: `1px solid ${CC.line}`, borderRadius: 10,
            padding: '12px 16px', fontSize: 13, color: CC.inkMid, lineHeight: 1.5,
          }}>
            Going to <strong style={{ color: CC.ink }}>{coachCount}</strong> coach{coachCount === 1 ? '' : 'es'}.
            The AI writes each email individually, personalized from your prior conversations with that school —
            you&apos;ll review every one before anything sends.
          </div>

          <div>
            <label style={labelStyle}>Name this campaign</label>
            <div style={sublabelStyle}>Just for you — coaches never see it.</div>
            <input
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder="e.g. Spring update — May 2026"
              style={inputStyle()}
              autoFocus
            />
          </div>

          {/* Talking-points inventory */}
          {inventoryMessages.length > 0 && (
            <div>
              <label style={labelStyle}>What&apos;s this campaign carrying?</label>
              <div style={sublabelStyle}>
                Pick the update(s) or question(s) from your talking points — the AI works these into each email.
              </div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {(['all', 'update', 'question'] as const).map(f => (
                  <button key={f} onClick={() => setMsgTypeFilter(f)} style={{
                    padding: '3px 12px', borderRadius: 999, border: `1px solid ${msgTypeFilter === f ? CC.ink : CC.line}`,
                    background: msgTypeFilter === f ? CC.ink : CC.white,
                    color: msgTypeFilter === f ? CC.white : CC.inkLo,
                    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {f === 'all' ? 'All' : f === 'update' ? 'Updates' : 'Questions'}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto', marginBottom: 8 }}>
                {inventoryMessages
                  .filter(m => msgTypeFilter === 'all' || m.type === msgTypeFilter)
                  .map(m => {
                    const checked = selectedMsgIds.has(m.id)
                    const typeBg = m.type === 'update' ? '#DCFCE7' : '#DBEAFE'
                    const typeColor = m.type === 'update' ? '#166534' : '#1E40AF'
                    return (
                      <label key={m.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px',
                        background: checked ? CC.tealSoft : CC.white, borderRadius: 8,
                        border: `1px solid ${checked ? CC.teal : CC.line}`, cursor: 'pointer',
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = new Set(selectedMsgIds)
                            if (checked) next.delete(m.id); else next.add(m.id)
                            setSelectedMsgIds(next)
                            const chosen = inventoryMessages.filter(msg => next.has(msg.id))
                            const lines = chosen.map(msg => msg.title + (msg.notes ? ` — ${msg.notes}` : ''))
                            setMessageSet(lines.join('\n'))
                          }}
                          style={{ marginTop: 2, flexShrink: 0 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                              textTransform: 'uppercase', background: typeBg, color: typeColor,
                            }}>{m.type}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: CC.ink }}>{m.title}</span>
                          </div>
                          {m.notes && (
                            <div style={{ fontSize: 11, color: CC.inkLo, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.notes}
                            </div>
                          )}
                        </div>
                      </label>
                    )
                  })}
              </div>
            </div>
          )}

          <div>
            <label style={labelStyle}>{inventoryMessages.length > 0 ? 'Anything else to say' : 'What do you want to tell each coach?'}</label>
            <textarea
              value={messageSet}
              onChange={e => setMessageSet(e.target.value)}
              rows={6}
              placeholder={'Spring club season just wrapped — won league title\nLikely attending MLS NEXT Cup in late May (to confirm)\nWorking out summer ID camp schedule\nCurious how your program plays with wingbacks'}
              style={{ ...inputStyle(true), minHeight: 140 }}
            />
            <div style={{ marginTop: 4, fontSize: 11, color: CC.inkLo }}>
              One point per line. The AI personalizes each email from these and the school&apos;s history — you review every draft next.
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 13, color: CC.red, background: '#FEF2F2', border: `1px solid #FCA5A5`, borderRadius: 8, padding: '10px 14px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <button onClick={() => setStep(1)} style={cbtn('secondary')}>← Back</button>
            <button onClick={handleCreate} disabled={!canCreate || submitting} style={cbtn('primary', !canCreate || submitting)}>
              {submitting ? 'Creating…' : 'Create drafts → Review'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

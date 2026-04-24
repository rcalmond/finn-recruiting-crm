'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Campaign, CampaignSchool, CampaignSchoolStatus } from '@/lib/types'

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  paper:   '#F6F1E8',
  white:   '#fff',
  border:  '#E2DBC9',
  ink:     '#0E0E0E',
  inkLo:   '#7A7570',
  red:     '#C8102E',
  amber:   '#B45309',
  green:   '#16A34A',
  blue:    '#0369A1',
  teal:    '#00B2A9',
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LastInbound {
  authored_by: string | null
  channel: string
}

interface Props {
  campaign: Campaign
  schools: CampaignSchool[]
  lastInboundBySchool: Record<string, LastInbound>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', opts ?? { month: 'short', day: 'numeric', year: 'numeric' })
}

function channelRec(authored_by: string | null): { label: string; style: React.CSSProperties } | null {
  if (authored_by === 'coach_personal')    return { label: 'Gmail', style: { color: C.green, background: '#DCFCE7' } }
  if (authored_by === 'coach_via_platform') return { label: 'SR',    style: { color: C.blue,  background: '#DBEAFE' } }
  return null
}

// ── Micro-components ──────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, React.CSSProperties> = {
  draft:     { background: '#F3F4F6', color: '#374151' },
  active:    { background: '#DCFCE7', color: '#166534' },
  paused:    { background: '#FEF9C3', color: '#854D0E' },
  completed: { background: '#E0E7FF', color: '#3730A3' },
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      ...(STATUS_BADGE[status] ?? STATUS_BADGE.draft),
      fontSize: 10, fontWeight: 700, padding: '3px 10px',
      borderRadius: 4, textTransform: 'uppercase', letterSpacing: 0.5,
    }}>
      {status}
    </span>
  )
}

const TIER_BADGE: Record<string, React.CSSProperties> = {
  A: { background: '#FEE2E2', color: '#991B1B' },
  B: { background: '#DBEAFE', color: '#1E40AF' },
  C: { background: '#F3F4F6', color: '#374151' },
}

function TierBadge({ tier }: { tier: string }) {
  return (
    <span style={{
      ...(TIER_BADGE[tier] ?? TIER_BADGE.C),
      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
    }}>
      {tier}
    </span>
  )
}

function btn(variant: 'primary' | 'outline' | 'ghost' | 'danger', disabled = false, small = false): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: small ? '5px 12px' : '8px 18px',
    borderRadius: 7, fontSize: small ? 12 : 13, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', border: 'none',
    flexShrink: 0, transition: 'opacity 0.1s', opacity: disabled ? 0.45 : 1,
  }
  if (variant === 'primary') return { ...base, background: C.ink,   color: '#fff' }
  if (variant === 'danger')  return { ...base, background: C.red,   color: '#fff' }
  if (variant === 'outline') return { ...base, background: C.white, color: C.ink, border: `1px solid ${C.border}` }
  return { ...base, background: 'transparent', color: C.inkLo, border: `1px solid ${C.border}` }
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '9px 16px',
      background: C.paper, borderBottom: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.inkLo, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </span>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
        background: C.border, color: C.inkLo,
      }}>
        {count}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CampaignDetailClient({ campaign: init, schools: initSchools, lastInboundBySchool }: Props) {
  const router = useRouter()

  const [campaign, setCampaign]         = useState(init)
  const [schools, setSchools]           = useState(initSchools)
  const [editingTemplate, setEditing]   = useState(false)
  const [templateBody, setTemplateBody] = useState(init.template?.body ?? '')
  const [savingTemplate, setSaving]     = useState(false)
  const [transitioning, setTransition]  = useState(false)
  const [error, setError]               = useState<string | null>(null)

  // draftSchool: set when user clicks "Draft →" — populated for Milestone 3 modal
  const [draftSchool, setDraftSchool] = useState<CampaignSchool | null>(null)
  void draftSchool // used in Milestone 3

  // ── Grouped schools ─────────────────────────────────────────────────────────

  function byStatus(s: CampaignSchoolStatus) { return schools.filter(r => r.status === s) }
  const pending   = byStatus('pending')
  const sent      = byStatus('sent')
  const dismissed = byStatus('dismissed')
  const bounced   = byStatus('bounced')

  // ── Status transitions ──────────────────────────────────────────────────────

  const TRANSITIONS: Record<string, { action: string; label: string; variant: 'primary' | 'outline' }[]> = {
    draft:     [{ action: 'activate', label: 'Activate',      variant: 'primary' }],
    active:    [{ action: 'pause',    label: 'Pause',         variant: 'outline' },
                { action: 'complete', label: 'Mark complete', variant: 'outline' }],
    paused:    [{ action: 'resume',   label: 'Resume',        variant: 'primary' },
                { action: 'complete', label: 'Mark complete', variant: 'outline' }],
    completed: [],
  }

  async function handleTransition(action: string) {
    setTransition(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed'); return }
      setCampaign(c => ({
        ...c,
        status: json.status,
        ...(json.status === 'active' && !c.activated_at ? { activated_at: new Date().toISOString() } : {}),
        ...(json.status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
      }))
    } finally {
      setTransition(false)
    }
  }

  // ── Template edit ───────────────────────────────────────────────────────────

  async function handleSaveTemplate() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/template`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: templateBody }),
      })
      if (!res.ok) { const j = await res.json(); setError(j.error ?? 'Save failed'); return }
      setCampaign(c => c.template ? { ...c, template: { ...c.template!, body: templateBody } } : c)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  // ── Dismiss / Restore ───────────────────────────────────────────────────────

  async function patchSchool(schoolId: string, action: 'dismiss' | 'restore') {
    const res = await fetch(`/api/campaigns/${campaign.id}/schools/${schoolId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (!res.ok) { const j = await res.json(); setError(j.error ?? 'Failed'); return }
    const now = new Date().toISOString()
    setSchools(ss => ss.map(s => {
      if (s.school_id !== schoolId) return s
      return action === 'dismiss'
        ? { ...s, status: 'dismissed' as CampaignSchoolStatus, dismissed_at: now }
        : { ...s, status: 'pending'   as CampaignSchoolStatus, dismissed_at: null }
    }))
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const bodyStartsTodo = (campaign.template?.body ?? '').trimStart().toLowerCase().startsWith('todo')
  const showTodoWarning = bodyStartsTodo && campaign.status === 'draft'

  // ── Render ──────────────────────────────────────────────────────────────────

  const tButtons = TRANSITIONS[campaign.status] ?? []

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px 64px' }}>

      {/* ── Back + header ───────────────────────────────────────────────────── */}
      <button
        onClick={() => router.push('/campaigns')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: C.inkLo, padding: 0, marginBottom: 14 }}
      >
        ← Campaigns
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 750, color: C.ink, letterSpacing: -0.5, margin: '0 0 8px' }}>
            {campaign.name}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <StatusBadge status={campaign.status} />
            <span style={{ fontSize: 12, color: C.inkLo }}>
              Created {fmtDate(campaign.created_at)}
            </span>
            {campaign.activated_at && (
              <span style={{ fontSize: 12, color: C.inkLo }}>
                Activated {fmtDate(campaign.activated_at)}
              </span>
            )}
            {campaign.completed_at && (
              <span style={{ fontSize: 12, color: C.inkLo }}>
                Completed {fmtDate(campaign.completed_at)}
              </span>
            )}
          </div>
        </div>

        {/* Status transition buttons */}
        {tButtons.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {tButtons.map(t => (
              <div key={t.action} style={{ position: 'relative' }}>
                {t.action === 'activate' && showTodoWarning && (
                  <div style={{
                    position: 'absolute', bottom: '110%', right: 0, whiteSpace: 'nowrap',
                    fontSize: 11, color: C.amber, background: '#FFFBEB',
                    border: `1px solid #FCD34D`, borderRadius: 5, padding: '4px 8px',
                  }}>
                    Template body starts with TODO — update before sending
                  </div>
                )}
                <button
                  onClick={() => handleTransition(t.action)}
                  disabled={transitioning}
                  style={btn(t.variant, transitioning)}
                >
                  {t.label}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div style={{
          marginTop: 12, fontSize: 13, color: C.red,
          background: '#FEF2F2', border: `1px solid #FCA5A5`,
          borderRadius: 7, padding: '10px 14px',
        }}>
          {error}
        </div>
      )}

      {/* ── Template section ────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 28, background: C.white,
        border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: C.paper,
        }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.inkLo, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Template
            </span>
            {campaign.template?.name && (
              <span style={{ fontSize: 12, color: C.inkLo, marginLeft: 8 }}>
                {campaign.template.name}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {campaign.status === 'active' && editingTemplate && (
              <span style={{ fontSize: 11, color: C.amber }}>
                Changes apply to future drafts only
              </span>
            )}
            {!editingTemplate && campaign.status !== 'completed' && (
              <button
                onClick={() => { setTemplateBody(campaign.template?.body ?? ''); setEditing(true) }}
                style={btn('ghost', false, true)}
              >
                Edit
              </button>
            )}
            {editingTemplate && (
              <>
                <button onClick={() => setEditing(false)} style={btn('ghost', savingTemplate, true)}>
                  Cancel
                </button>
                <button
                  onClick={handleSaveTemplate}
                  disabled={savingTemplate || !templateBody.trim()}
                  style={btn('primary', savingTemplate || !templateBody.trim(), true)}
                >
                  {savingTemplate ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {editingTemplate ? (
            <textarea
              value={templateBody}
              onChange={e => setTemplateBody(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                minHeight: 280, padding: '10px 12px', borderRadius: 7,
                border: `1px solid ${C.border}`, fontSize: 13,
                fontFamily: 'Georgia, serif', lineHeight: 1.65,
                resize: 'vertical', outline: 'none',
              }}
            />
          ) : (
            <pre style={{
              margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              fontSize: 13, color: '#1F1F1F', fontFamily: 'Georgia, serif',
              lineHeight: 1.65,
            }}>
              {campaign.template?.body ?? <span style={{ color: C.inkLo, fontStyle: 'italic' }}>No template body</span>}
            </pre>
          )}
        </div>
      </div>

      {/* ── Schools ─────────────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 28, background: C.white,
        border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden',
      }}>

        {/* Pending */}
        {pending.length > 0 && (
          <>
            <SectionHeader label="Pending" count={pending.length} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 160px 72px 90px', padding: '8px 16px 4px', borderBottom: `1px solid ${C.border}` }}>
              {['School', 'Tier', 'Coach', 'Channel', ''].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.inkLo, textTransform: 'uppercase', letterSpacing: 0.4, paddingBottom: 4 }}>
                  {h}
                </div>
              ))}
            </div>
            {pending.map((cs, i) => {
              const inbound = lastInboundBySchool[cs.school_id]
              const rec     = channelRec(inbound?.authored_by ?? null)
              const hasCoach = !!cs.coach

              return (
                <div
                  key={cs.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 44px 160px 72px 90px',
                    padding: '10px 16px', alignItems: 'center',
                    borderBottom: i < pending.length - 1 ? `1px solid ${C.border}` : 'none',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>
                    {cs.school?.name ?? cs.school_id}
                  </div>
                  <div>
                    <TierBadge tier={cs.school?.category ?? '?'} />
                  </div>
                  <div style={{ fontSize: 12, color: C.inkLo }}>
                    {cs.coach ? (
                      <>
                        <span style={{ color: C.ink }}>{cs.coach.name}</span>
                        <span style={{ fontSize: 11, marginLeft: 4 }}>({cs.coach.role})</span>
                      </>
                    ) : (
                      <span style={{ color: C.red, fontStyle: 'italic', fontSize: 11 }}>No coach</span>
                    )}
                  </div>
                  <div>
                    {rec ? (
                      <span style={{
                        ...rec.style,
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                      }}>
                        {rec.label}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: C.inkLo }}>—</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                    <button
                      onClick={() => hasCoach && setDraftSchool(cs)}
                      disabled={!hasCoach}
                      title={hasCoach ? 'Open draft' : 'No coach assigned — add a coach first'}
                      style={btn('primary', !hasCoach, true)}
                    >
                      Draft →
                    </button>
                    <button
                      onClick={() => patchSchool(cs.school_id, 'dismiss')}
                      style={btn('ghost', false, true)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* Sent */}
        {sent.length > 0 && (
          <>
            <SectionHeader label="Sent" count={sent.length} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 160px 120px', padding: '8px 16px 4px', borderBottom: `1px solid ${C.border}` }}>
              {['School', 'Tier', 'Coach', 'Sent'].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.inkLo, textTransform: 'uppercase', letterSpacing: 0.4, paddingBottom: 4 }}>
                  {h}
                </div>
              ))}
            </div>
            {sent.map((cs, i) => (
              <div
                key={cs.id}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 44px 160px 120px',
                  padding: '10px 16px', alignItems: 'center',
                  borderBottom: i < sent.length - 1 ? `1px solid ${C.border}` : 'none',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>
                  {cs.school?.name ?? cs.school_id}
                </div>
                <div><TierBadge tier={cs.school?.category ?? '?'} /></div>
                <div style={{ fontSize: 12, color: C.inkLo }}>
                  {cs.coach?.name ?? <span style={{ fontStyle: 'italic' }}>—</span>}
                </div>
                <div style={{ fontSize: 12, color: C.inkLo }}>
                  {fmtDate(cs.sent_at, { month: 'short', day: 'numeric' })}
                </div>
              </div>
            ))}
          </>
        )}

        {/* Dismissed */}
        {dismissed.length > 0 && (
          <>
            <SectionHeader label="Dismissed" count={dismissed.length} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 160px 120px 80px', padding: '8px 16px 4px', borderBottom: `1px solid ${C.border}` }}>
              {['School', 'Tier', 'Coach', 'Dismissed', ''].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.inkLo, textTransform: 'uppercase', letterSpacing: 0.4, paddingBottom: 4 }}>
                  {h}
                </div>
              ))}
            </div>
            {dismissed.map((cs, i) => (
              <div
                key={cs.id}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 44px 160px 120px 80px',
                  padding: '10px 16px', alignItems: 'center',
                  borderBottom: i < dismissed.length - 1 ? `1px solid ${C.border}` : 'none',
                }}
              >
                <div style={{ fontSize: 13, color: C.inkLo }}>{cs.school?.name ?? cs.school_id}</div>
                <div><TierBadge tier={cs.school?.category ?? '?'} /></div>
                <div style={{ fontSize: 12, color: C.inkLo }}>
                  {cs.coach?.name ?? <span style={{ fontStyle: 'italic' }}>—</span>}
                </div>
                <div style={{ fontSize: 12, color: C.inkLo }}>
                  {fmtDate(cs.dismissed_at, { month: 'short', day: 'numeric' })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => patchSchool(cs.school_id, 'restore')}
                    style={btn('ghost', false, true)}
                  >
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Bounced */}
        {bounced.length > 0 && (
          <>
            <SectionHeader label="Bounced" count={bounced.length} />
            {bounced.map((cs, i) => (
              <div
                key={cs.id}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 44px 160px',
                  padding: '10px 16px', alignItems: 'center',
                  borderBottom: i < bounced.length - 1 ? `1px solid ${C.border}` : 'none',
                }}
              >
                <div style={{ fontSize: 13, color: C.inkLo }}>{cs.school?.name ?? cs.school_id}</div>
                <div><TierBadge tier={cs.school?.category ?? '?'} /></div>
                <div style={{ fontSize: 12, color: C.red }}>Bounced</div>
              </div>
            ))}
          </>
        )}

        {/* Empty */}
        {pending.length === 0 && sent.length === 0 && dismissed.length === 0 && bounced.length === 0 && (
          <div style={{ padding: '40px 24px', textAlign: 'center', fontSize: 13, color: C.inkLo }}>
            No schools in this campaign.
          </div>
        )}
      </div>

      {/* DraftReviewModal — Milestone 3 */}
      {/* When draftSchool is set, render <DraftReviewModal cs={draftSchool} campaign={campaign} onClose={() => setDraftSchool(null)} onSent={...} /> */}
    </div>
  )
}

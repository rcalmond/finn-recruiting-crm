'use client'

import { useState } from 'react'
import type { Campaign, CampaignSchool, Coach } from '@/lib/types'

// ── Token subset (avoid re-importing full C object) ──────────────────────────

const T = {
  paper:  '#F6F1E8',
  white:  '#fff',
  border: '#E2DBC9',
  ink:    '#0E0E0E',
  inkLo:  '#7A7570',
  red:    '#C8102E',
  green:  '#16A34A',
  blue:   '#0369A1',
}

// ── Placeholder renderer ──────────────────────────────────────────────────────

function renderTemplate(
  body: string,
  schoolName: string,
  coach: Pick<Coach, 'name' | 'role'> | null | undefined
): string {
  const parts     = (coach?.name ?? '').trim().split(/\s+/)
  const firstName = parts[0] ?? ''
  const lastName  = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? ''
  return body
    .replace(/\{\{coach_last_name\}\}/g,  lastName  || '[Coach]')
    .replace(/\{\{coach_first_name\}\}/g, firstName || '[Coach]')
    .replace(/\{\{school_name\}\}/g,      schoolName || '[School]')
    .replace(/\{\{coach_role\}\}/g,       coach?.role ?? '[Role]')
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LastInbound {
  authored_by: string | null
  channel: string
}

interface Props {
  cs: CampaignSchool
  campaign: Campaign
  lastInbound: LastInbound | undefined
  onSent: (schoolId: string) => void
  onDismissed: (schoolId: string) => void
  onClose: () => void
}

// ── Micro-components ──────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: string }) {
  const s: Record<string, React.CSSProperties> = {
    A: { background: '#FEE2E2', color: '#991B1B' },
    B: { background: '#DBEAFE', color: '#1E40AF' },
    C: { background: '#F3F4F6', color: '#374151' },
  }
  return (
    <span style={{
      ...(s[tier] ?? s.C),
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
    }}>
      {tier}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DraftReviewModal({ cs, campaign, lastInbound, onSent, onDismissed, onClose }: Props) {
  const schoolName   = cs.school?.name ?? cs.school_id
  const initialBody  = renderTemplate(campaign.template?.body ?? '', schoolName, cs.coach ?? null)

  const [editedBody, setEditedBody]   = useState(initialBody)
  const [copied, setCopied]           = useState(false)
  const [sending, setSending]         = useState<'gmail' | 'sr' | 'dismiss' | null>(null)
  const [generating, setGenerating]   = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [ccCopied, setCcCopied]       = useState(false)

  // ── Channel recommendation ───────────────────────────────────────────────

  const authored = lastInbound?.authored_by ?? null
  const rec = authored === 'coach_personal'
    ? { label: 'Recommended: Gmail', color: T.green,  bg: '#DCFCE7' }
    : authored === 'coach_via_platform'
    ? { label: 'Recommended: SR',    color: T.blue,   bg: '#DBEAFE' }
    : { label: 'No recommendation — pick manually', color: T.inkLo, bg: T.paper }

  // ── API helpers ──────────────────────────────────────────────────────────

  async function markSent(channel: 'gmail' | 'sr') {
    setSending(channel)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/schools/${cs.school_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_sent', channel }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed'); return }
      onSent(cs.school_id)
    } finally {
      setSending(null)
    }
  }

  async function handleDismiss() {
    setSending('dismiss')
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/schools/${cs.school_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed'); return }
      onDismissed(cs.school_id)
    } finally {
      setSending(null)
    }
  }

  async function handleGenerate() {
    const savedBody = editedBody
    setGenerating(true)
    setError(null)
    setEditedBody('')  // clear so streaming fills from blank
    try {
      const res = await fetch('/api/campaigns/personalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId:     cs.school_id,
          coachId:      cs.coach_id,
          renderedBody: savedBody,
        }),
      })
      if (!res.ok) {
        // Error response is JSON even though success is text/plain
        const json = await res.json()
        setEditedBody(savedBody)  // restore on error
        setError(json.error ?? 'Generation failed')
        return
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setEditedBody(accumulated)
      }
      // Flush any remaining buffered bytes
      accumulated += decoder.decode()
      if (accumulated !== editedBody) setEditedBody(accumulated)
    } catch (e) {
      setEditedBody(savedBody)  // restore on network error
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(editedBody)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Clipboard write failed — copy manually from the text area')
    }
  }

  const busy = sending !== null || generating

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', zIndex: 50 }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 620, maxHeight: '88vh',
        background: T.white, borderRadius: 10,
        border: `1px solid ${T.border}`,
        boxShadow: '0 20px 48px rgba(0,0,0,0.18)',
        zIndex: 51, display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          padding: '14px 20px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{schoolName}</span>
              <TierBadge tier={cs.school?.category ?? '?'} />
            </div>
            <div style={{ fontSize: 12, color: T.inkLo }}>
              {cs.coach
                ? <>{cs.coach.name} <span style={{ opacity: 0.7 }}>({cs.coach.role})</span></>
                : <span style={{ color: T.red, fontStyle: 'italic' }}>No coach assigned</span>
              }
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: T.inkLo, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>

        {/* ── Channel recommendation ───────────────────────────────────────── */}
        <div style={{
          padding: '8px 20px', borderBottom: `1px solid ${T.border}`,
          background: rec.bg, flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: rec.color }}>
            {rec.label}
          </span>
        </div>

        {/* ── Body editor ─────────────────────────────────────────────────── */}
        <div style={{ padding: '14px 20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.inkLo, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Message — editable (per-school only, does not update template)
            </div>
            <button
              onClick={handleGenerate}
              disabled={busy}
              title="Fill [Finn: ...] placeholders with AI-generated content specific to this school and coach"
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer',
                border: `1px solid ${T.border}`,
                background: generating ? T.paper : T.white,
                color: generating ? T.inkLo : T.ink,
                opacity: busy && !generating ? 0.45 : 1,
                transition: 'background 0.15s',
                flexShrink: 0,
              }}
            >
              {generating ? 'Generating…' : 'Personalize with AI'}
            </button>
          </div>
          <textarea
            value={editedBody}
            onChange={e => !generating && setEditedBody(e.target.value)}
            readOnly={generating}
            placeholder={generating ? 'Generating personalized content…' : ''}
            style={{
              width: '100%', boxSizing: 'border-box',
              minHeight: 260, padding: '10px 12px', borderRadius: 7,
              border: `1px solid ${generating ? T.inkLo : T.border}`, fontSize: 13,
              fontFamily: 'Georgia, serif', lineHeight: 1.65,
              resize: generating ? 'none' : 'vertical',
              outline: 'none', color: generating ? T.inkLo : '#1F1F1F',
              flex: 1,
            }}
          />
        </div>

        {/* ── Action footer ────────────────────────────────────────────────── */}
        <div style={{
          padding: '14px 20px', borderTop: `1px solid ${T.border}`,
          flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {error && (
            <div style={{
              fontSize: 12, color: T.red, background: '#FEF2F2',
              border: '1px solid #FCA5A5', borderRadius: 6, padding: '7px 12px',
            }}>
              {error}
            </div>
          )}

          {/* Clipboard */}
          <div>
            <button
              onClick={handleCopy}
              style={{
                padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: `1px solid ${T.border}`,
                background: copied ? '#DCFCE7' : T.white,
                color: copied ? '#166534' : T.inkLo,
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>
          </div>

          {/* CC reminder */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', borderRadius: 6,
            background: '#F0F4FF', border: '1px solid #C7D2FE',
            fontSize: 12, color: '#4338CA', lineHeight: 1.4,
          }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>✉</span>
            <span>
              CC{' '}
              <code
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText('finn@in.finnsoccer.com')
                    setCcCopied(true)
                    setTimeout(() => setCcCopied(false), 2000)
                  } catch { /* noop */ }
                }}
                title="Click to copy"
                style={{
                  background: ccCopied ? '#DCFCE7' : '#E0E7FF',
                  padding: '1px 5px', borderRadius: 3,
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  fontSize: 11.5, cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {ccCopied ? 'copied!' : 'finn@in.finnsoccer.com'}
              </code>
              {' '}so the CRM captures the actual sent body
            </span>
          </div>

          {/* Send buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => markSent('gmail')}
              disabled={busy}
              style={{
                padding: '9px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                cursor: busy ? 'not-allowed' : 'pointer',
                border: 'none', background: T.ink, color: T.white,
                opacity: busy ? 0.5 : 1,
              }}
            >
              {sending === 'gmail' ? 'Marking…' : 'Mark as sent via Gmail'}
            </button>
            <button
              onClick={() => markSent('sr')}
              disabled={busy}
              style={{
                padding: '9px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                cursor: busy ? 'not-allowed' : 'pointer',
                border: `1px solid ${T.border}`, background: T.white, color: T.ink,
                opacity: busy ? 0.5 : 1,
              }}
            >
              {sending === 'sr' ? 'Marking…' : 'Mark as sent via SR'}
            </button>
          </div>

          {/* Dismiss + Cancel */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              onClick={handleDismiss}
              disabled={busy}
              style={{
                padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: busy ? 'not-allowed' : 'pointer',
                border: `1px solid #FCA5A5`, background: '#FEF2F2', color: T.red,
                opacity: busy ? 0.5 : 1,
              }}
            >
              {sending === 'dismiss' ? 'Dismissing…' : 'Dismiss from this campaign'}
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                cursor: 'pointer', border: `1px solid ${T.border}`,
                background: T.white, color: T.inkLo,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

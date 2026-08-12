'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

// ─── House palette ───────────────────────────────────────────────────────────

export const CC = {
  paper:     '#F6F1E8',
  paperDeep: '#EFE8D8',
  white:     '#fff',
  ink:       '#1A1A1A',
  inkMid:    '#4A4A4A',
  inkLo:     '#6B655A',
  inkMute:   '#8A8478',
  line:      '#E2DBC9',
  line2:     '#D3CAB3',
  red:       '#C8102E',
  amber:     '#B45309',
  green:     '#16A34A',
  blue:      '#0369A1',
  // Brand chrome (Pass 4E): the stepper + Ready-to-review pill were teal — now
  // the shared pitch. The teal keys are repointed so every chrome use migrates.
  teal:      '#1F6B48',
  tealDeep:  '#1F6B48',
  tealSoft:  '#E3EFE9',
} as const

// ─── House pill button ───────────────────────────────────────────────────────

export function cbtn(
  variant: 'primary' | 'secondary' | 'ghost' | 'danger',
  disabled = false,
): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '8px 18px', borderRadius: 999,
    fontSize: 13, fontWeight: 650, fontFamily: 'inherit',
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    flexShrink: 0, transition: 'background 0.15s',
    opacity: disabled ? 0.5 : 1,
  }
  switch (variant) {
    case 'primary':   return { ...base, background: CC.ink, color: CC.white }
    case 'secondary': return { ...base, background: 'transparent', color: CC.ink, borderColor: CC.line2 }
    case 'ghost':     return { ...base, background: 'transparent', color: CC.inkLo, borderColor: CC.line }
    case 'danger':    return { ...base, background: CC.red, color: CC.white }
  }
}

// ─── Masthead cascade ────────────────────────────────────────────────────────

export function CampaignMasthead({
  title,
  subtitle,
  back,
  right,
}: {
  title: string
  subtitle?: string
  back?: { href: string; label: string }
  right?: ReactNode
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      {back && (
        <Link href={back.href} style={{
          display: 'inline-block', marginBottom: 12,
          fontSize: 13, color: CC.inkLo, textDecoration: 'none',
        }}>
          ← {back.label}
        </Link>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{
            margin: 0,
            fontSize: 'clamp(24px, 3.4vw, 30px)', fontWeight: 750,
            letterSpacing: '-0.04em', fontStyle: 'italic', color: CC.ink,
          }}>
            {typeof title === 'string' ? <>{title.replace(/\.$/, '')}<span style={{ color: CC.teal }}>.</span></> : title}
          </h1>
          {subtitle && (
            <p style={{ margin: '8px 0 0', fontSize: 14, color: CC.inkMid, lineHeight: 1.55, maxWidth: 620 }}>
              {subtitle}
            </p>
          )}
        </div>
        {right && <div style={{ flexShrink: 0 }}>{right}</div>}
      </div>
    </div>
  )
}

// ─── Concept block ───────────────────────────────────────────────────────────
// The one plain-language explanation of what a campaign is, when to use one,
// and what you need first. Shown on the landing and the first creation screen.

export function CampaignConcept() {
  return (
    <div style={{
      background: CC.paperDeep, border: `1px solid ${CC.line}`,
      borderRadius: 12, padding: '16px 20px', marginBottom: 24,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ fontSize: 14, color: CC.ink, lineHeight: 1.6 }}>
        <strong>A campaign is one message, sent to many coaches — personalized for each school automatically.</strong>{' '}
        Reach for one when you have something worth sending to your list at once: a showcase coming up, a new highlight reel, a season update.
      </div>
      <div style={{ fontSize: 13, color: CC.inkLo, lineHeight: 1.55 }}>
        Before you start, you need schools on your list with a coach email on file, and something to say. Each coach gets their own email — you review every draft, and nothing sends on its own.
      </div>
    </div>
  )
}

// ─── The four-step stepper ───────────────────────────────────────────────────
// Always visible across both the creation flow (steps 1–2) and the campaign
// detail page (steps 3–4), so the user always knows where they are and what's
// left. current is 1..4.

const STEPS: { n: number; label: string; hint: string }[] = [
  { n: 1, label: 'Who',    hint: 'Pick schools' },
  { n: 2, label: 'What',   hint: 'The message' },
  { n: 3, label: 'Review', hint: 'Check each draft' },
  { n: 4, label: 'Send',   hint: 'One per coach' },
]

export function CampaignStepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 0,
      border: `1px solid ${CC.line}`, borderRadius: 10, overflow: 'hidden',
      marginBottom: 28, background: CC.white,
    }}>
      {STEPS.map((s, i) => {
        const done   = s.n < current
        const active = s.n === current
        return (
          <div key={s.n} style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 9,
            padding: '10px 14px',
            borderLeft: i === 0 ? 'none' : `1px solid ${CC.line}`,
            background: active ? CC.ink : done ? CC.paper : CC.white,
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
              background: active ? CC.teal : done ? CC.tealDeep : CC.line,
              color: active || done ? CC.white : CC.inkLo,
            }}>
              {done ? '✓' : s.n}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 12.5, fontWeight: 700, letterSpacing: -0.1,
                color: active ? CC.white : done ? CC.ink : CC.inkLo,
              }}>
                {s.label}
              </div>
              <div style={{
                fontSize: 10.5,
                color: active ? 'rgba(255,255,255,0.7)' : CC.inkMute,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {s.hint}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Legible campaign state pill (list + detail) ─────────────────────────────

export function campaignState(
  campaign: { status: string; archived_at?: string | null; completed_at?: string | null; activated_at?: string | null },
  counts: Record<string, number>,
): { label: string; bg: string; color: string } {
  const sent    = counts['sent'] ?? 0
  const pending = counts['pending'] ?? 0
  if (campaign.archived_at) return { label: 'Archived', bg: '#E5E7EB', color: '#6B7280' }

  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

  if (campaign.status === 'completed') {
    const d = fmt(campaign.completed_at)
    return { label: `Sent${d ? ` ${d}` : ''} · ${sent} coach${sent === 1 ? '' : 'es'}`, bg: '#E0E7FF', color: '#3730A3' }
  }
  if (campaign.status === 'draft') {
    return { label: 'Draft', bg: '#F3F4F6', color: '#374151' }
  }
  if (campaign.status === 'paused') {
    return { label: 'Paused', bg: '#FEF9C3', color: '#854D0E' }
  }
  // active
  if (sent === 0) return { label: 'Ready to review', bg: CC.tealSoft, color: CC.tealDeep }
  if (pending > 0) return { label: `${sent} sent · ${pending} to go`, bg: '#DCFCE7', color: '#166534' }
  return { label: `Sent · ${sent} coach${sent === 1 ? '' : 'es'}`, bg: '#DCFCE7', color: '#166534' }
}

export function StatePill({ state }: { state: { label: string; bg: string; color: string } }) {
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
      background: state.bg, color: state.color, whiteSpace: 'nowrap',
    }}>
      {state.label}
    </span>
  )
}

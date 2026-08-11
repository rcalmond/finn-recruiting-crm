'use client'

import type { ReactNode } from 'react'

// ─── House palette (shared across the four Settings surfaces) ────────────────
// These pages predate the design eras; this is the single token set that brings
// them in line with school-detail / the phase pages.

export const SP = {
  paper:     '#F6F1E8',
  paperDeep: '#EFE8D8',
  white:     '#fff',
  ink:       '#0E0E0E',
  inkMid:    '#4A4A4A',
  inkLo:     '#7A7570',
  inkMute:   '#A8A39B',
  line:      '#E2DBC9',
  line2:     '#D3CAB3',
  red:       '#C8102E',
  amber:     '#B45309',
  green:     '#16A34A',
  teal:      '#00B2A9',
  tealDeep:  '#006A65',
  tealSoft:  '#D7F0ED',
} as const

// ─── Masthead cascade ────────────────────────────────────────────────────────
// House voice: italic title with a trailing period, second-person subtitle,
// no uppercase eyebrow. Optional pending line sits under the subtitle.

export function SettingsMasthead({
  title,
  subtitle,
  pending,
}: {
  title: string
  subtitle: string
  pending?: string | null
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h1 style={{
        margin: 0,
        fontSize: 'clamp(24px, 3.4vw, 30px)', fontWeight: 750,
        letterSpacing: '-0.04em', fontStyle: 'italic', color: SP.ink,
      }}>
        {title}
      </h1>
      <p style={{
        margin: '8px 0 0', fontSize: 14, color: SP.inkMid,
        lineHeight: 1.55, maxWidth: 580,
      }}>
        {subtitle}
      </p>
      {pending && (
        <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 600, color: SP.ink }}>
          {pending}
        </p>
      )}
    </div>
  )
}

// ─── Designed empty state ────────────────────────────────────────────────────
// An empty review queue is a GOOD state — say so, don't render a bare blank.

export function SettingsEmptyState({
  title,
  note,
}: {
  title: string
  note: ReactNode
}) {
  return (
    <div style={{
      background: SP.white, border: `1px solid ${SP.line}`,
      borderRadius: 14, padding: '44px 28px', textAlign: 'center',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: '50%',
        background: SP.tealSoft, color: SP.tealDeep,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 14px', fontSize: 16, fontWeight: 700,
      }}>
        ✓
      </div>
      <div style={{ fontSize: 15, fontWeight: 650, fontStyle: 'italic', color: SP.ink, marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: SP.inkLo, lineHeight: 1.55, maxWidth: 360, margin: '0 auto' }}>
        {note}
      </div>
    </div>
  )
}

// ─── House pill button ───────────────────────────────────────────────────────
// The school-detail button grammar, as a shared style helper:
//   primary   — filled ink, white text
//   secondary — outlined, ink text
//   ghost     — outlined, muted text (cancel / low-emphasis)
//   accent    — filled teal (affirmative apply on the proposal surfaces)
//   danger    — filled red (destructive confirm)

export function pill(
  variant: 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger',
  disabled = false,
): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '7px 16px', borderRadius: 999,
    fontSize: 12, fontWeight: 650, fontFamily: 'inherit',
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    flexShrink: 0, transition: 'background 0.15s',
  }
  switch (variant) {
    case 'primary':
      return { ...base, background: disabled ? SP.line : SP.ink, color: disabled ? SP.inkLo : SP.white }
    case 'secondary':
      return { ...base, background: 'transparent', color: SP.ink, borderColor: SP.line2 }
    case 'ghost':
      return { ...base, background: 'transparent', color: SP.inkLo, borderColor: SP.line }
    case 'accent':
      return { ...base, background: disabled ? SP.line : SP.tealDeep, color: disabled ? SP.inkLo : SP.white }
    case 'danger':
      return { ...base, background: disabled ? SP.line : SP.red, color: disabled ? SP.inkLo : SP.white }
  }
}

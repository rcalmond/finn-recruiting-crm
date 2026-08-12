/**
 * Throughball brand components (Brand Sweep Pass 0 — foundations).
 *
 * <ThroughballMark />     — the weighted pass-arrow glyph (SVG)
 * <ThroughballWordmark /> — "Throughball" in the house display face, accented period
 * <ThroughballLogo />     — mark + wordmark lockup
 *
 * Colors resolve from the brand tokens in globals.css (var(--tb-*)). These are
 * brand chrome only — never wire them to the data-semantic color systems.
 *
 * NOTE: this pass only establishes the components + a design-preview render test
 * (src/app/design-preview/brand). Wiring into nav/hero/favicon is later passes.
 */

import type { CSSProperties } from 'react'

// ─── Treatments ──────────────────────────────────────────────────────────────

export type BrandTreatment = 'ink' | 'pitch' | 'reversed'

function treatmentColor(t: BrandTreatment): string {
  switch (t) {
    case 'pitch':    return 'var(--tb-pitch)'
    case 'reversed': return 'var(--tb-cream)'
    case 'ink':
    default:         return 'var(--tb-ink)'
  }
}

// ─── The Mark ────────────────────────────────────────────────────────────────
//
// The weighted pass-arrow, drawn to the visual-identity companion geometry: a
// filled ball at the origin, a weighted pass-curve sweeping across, an arrowhead,
// and the runner's dotted path converging to meet it. Two paths meeting at the
// right spot — literally a through ball. Rounded caps, organic curve, the
// tactics-notebook hand. Horizontal (≈3:1); `size` sets the width. The runner's
// dotted path drops for the small icon variant.

export function ThroughballMark({
  size = 132,
  treatment = 'ink',
  showRunner = true,
  title = 'Throughball',
  style,
}: {
  /** Mark width in px; height is size / 3. */
  size?: number
  treatment?: BrandTreatment
  /** Show the runner's dotted path. Auto-drops at small (icon) sizes. */
  showRunner?: boolean
  title?: string
  style?: CSSProperties
}) {
  const color = treatmentColor(treatment)
  const runner = showRunner && size >= 90

  return (
    <svg
      width={size}
      height={size / 3}
      viewBox="0 0 360 120"
      fill="none"
      role="img"
      aria-label={title}
      style={{ color, display: 'block', ...style }}
    >
      <title>{title}</title>

      {/* Runner's dotted path — converges to meet the pass */}
      {runner && (
        <path
          d="M 74 96 C 128 68 204 60 266 72"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeDasharray="1 11"
          opacity={0.35}
        />
      )}

      {/* Weighted pass-curve */}
      <path
        d="M 43 81 C 118 32 236 24 322 52"
        stroke="currentColor"
        strokeWidth={5}
        strokeLinecap="round"
      />

      {/* Arrowhead — the app icon at small sizes */}
      <path
        d="M 309 39 L 326 53 L 305 58"
        stroke="currentColor"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Ball — filled, at the origin of the pass */}
      <circle cx="30" cy="86" r="7.5" fill="currentColor" />
    </svg>
  )
}

// ─── The Wordmark ────────────────────────────────────────────────────────────
//
// "Throughball" in the house display face: bold, italic, tight negative
// tracking, with a trailing period carrying the accent (Pitch Green by default;
// the light variant on reversed/dark grounds).

export function ThroughballWordmark({
  size = 22,
  treatment = 'ink',
  accentPeriod = true,
  style,
}: {
  size?: number
  treatment?: BrandTreatment
  /** Accent the trailing period with the brand green (default true). */
  accentPeriod?: boolean
  style?: CSSProperties
}) {
  const color = treatmentColor(treatment)
  const accent = accentPeriod
    ? (treatment === 'reversed' ? 'var(--tb-pitch-light)' : 'var(--tb-pitch)')
    : 'currentColor'

  return (
    <span
      style={{
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontWeight: 800,
        fontStyle: 'italic',
        letterSpacing: '-0.045em',
        fontSize: size,
        lineHeight: 1,
        color,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      Throughball<span style={{ color: accent }}>.</span>
    </span>
  )
}

// ─── The Lockup ──────────────────────────────────────────────────────────────

export function ThroughballLogo({
  size = 26,
  treatment = 'ink',
  gap = 8,
  style,
}: {
  /** Wordmark font size; the mark scales above it. */
  size?: number
  treatment?: BrandTreatment
  gap?: number
  style?: CSSProperties
}) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap, ...style }}>
      <ThroughballMark size={Math.round(size * 4.4)} treatment={treatment} showRunner={false} />
      <ThroughballWordmark size={size} treatment={treatment} />
    </span>
  )
}

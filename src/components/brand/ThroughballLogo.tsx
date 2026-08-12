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
// A through-ball drawn as a tactics-board play: a filled ball at the origin, an
// arced pass-curve rising into space with an arrowhead, and a runner's dotted
// path converging to the same space. Rounded caps/joins — drawn, not geometric.
// The runner's dotted path drops for the small icon variant.

export function ThroughballMark({
  size = 32,
  treatment = 'ink',
  showRunner = true,
  title = 'Throughball',
  style,
}: {
  size?: number
  treatment?: BrandTreatment
  /** Show the runner's dotted path. Auto-drops at very small sizes. */
  showRunner?: boolean
  title?: string
  style?: CSSProperties
}) {
  const color = treatmentColor(treatment)
  const runner = showRunner && size >= 22

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      role="img"
      aria-label={title}
      style={{ color, display: 'block', ...style }}
    >
      <title>{title}</title>

      {/* Runner's dotted path — converges up toward the space */}
      {runner && (
        <path
          d="M15 35 Q 26 30 31 18"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeDasharray="0.1 4.6"
          opacity={0.5}
        />
      )}

      {/* Pass curve — arced, rising from the ball into space */}
      <path
        d="M11 26 Q 20 8 32 15"
        stroke="currentColor"
        strokeWidth={3.4}
        strokeLinecap="round"
      />

      {/* Arrowhead at the pass destination */}
      <path
        d="M26.2 15.4 L 32 15 L 29 9.6"
        stroke="currentColor"
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Ball — filled, at the origin of the pass */}
      <circle cx="8.5" cy="28" r="4" fill="currentColor" />
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
  gap = 10,
  style,
}: {
  /** Wordmark font size; the mark scales to ~1.35x. */
  size?: number
  treatment?: BrandTreatment
  gap?: number
  style?: CSSProperties
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap, ...style }}>
      <ThroughballMark size={Math.round(size * 1.35)} treatment={treatment} />
      <ThroughballWordmark size={size} treatment={treatment} />
    </span>
  )
}

import Link from 'next/link'
import { ThroughballMark } from '@/components/brand/ThroughballLogo'
import NotFoundLogger from '@/components/NotFoundLogger'

// Brand chrome tokens (house style — never the data-semantic systems).
const INK = '#1A1A1A'
const MUTED = '#6B655A'
const PITCH = '#1F6B48'
const PARCHMENT = '#F6F1E8'
const CREAM = '#FFFDF9'

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        background: PARCHMENT,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '48px 24px',
        boxSizing: 'border-box',
      }}
    >
      {/* Fire-and-forget 404 beacon (log-only). */}
      <NotFoundLogger />

      {/* The pass that sailed past its mark. */}
      <ThroughballMark
        size={168}
        treatment="pitch"
        style={{ maxWidth: '80%', opacity: 0.9, marginBottom: 28 }}
      />

      <h1
        style={{
          margin: 0,
          fontSize: 'clamp(56px, 12vw, 96px)',
          fontWeight: 700,
          fontStyle: 'italic',
          letterSpacing: '-0.04em',
          lineHeight: 0.95,
          color: INK,
        }}
      >
        Offside<span style={{ color: PITCH }}>.</span>
      </h1>

      <p
        style={{
          margin: '20px 0 0',
          maxWidth: 440,
          fontSize: 'clamp(16px, 2.4vw, 19px)',
          fontWeight: 500,
          lineHeight: 1.5,
          color: INK,
        }}
      >
        This page is offside — it&rsquo;s not where play is.
      </p>

      <p
        style={{
          margin: '10px 0 0',
          maxWidth: 440,
          fontSize: 14,
          lineHeight: 1.5,
          color: MUTED,
        }}
      >
        The link may be old, or the page has moved on.
      </p>

      <Link
        href="/get-recruited"
        style={{
          marginTop: 34,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '13px 24px',
          borderRadius: 10,
          background: PITCH,
          color: CREAM,
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          textDecoration: 'none',
        }}
      >
        Back to Throughball <span aria-hidden="true">&rarr;</span>
      </Link>
    </main>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'

// Public "coming soon" stub. The interactive demo build lands here next.
export const metadata: Metadata = {
  title: 'Demo — finnsoccer',
  description: 'The finnsoccer recruiting demo is on the way.',
}

const M = {
  paper: '#F6F1E8', ink: '#0E0E0E', inkMid: '#4A4A4A', inkLo: '#7A7570',
  lineWarm: '#DDD5C3', rust: '#B5502F', green: '#2D6A4F', greenSoft: '#D7EFE0',
  logoMark: '#C8102E',
}

export default function DemoPage() {
  return (
    <div style={{
      minHeight: '100vh', background: M.paper, fontFamily: "'Inter', -apple-system, sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      <header style={{ padding: '18px clamp(20px, 5vw, 56px)', maxWidth: 1120, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', width: 'fit-content' }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7, background: M.logoMark, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800, letterSpacing: -0.3, fontStyle: 'italic',
          }}>F</div>
          <span style={{ fontSize: 15, fontWeight: 700, color: M.ink, letterSpacing: -0.4 }}>finnsoccer</span>
        </Link>
      </header>

      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px clamp(20px, 5vw, 56px)' }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <span style={{
            display: 'inline-block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: M.green, background: M.greenSoft,
            border: `1px solid ${M.green}30`, borderRadius: 6, padding: '4px 10px', marginBottom: 20,
          }}>Coming soon</span>
          <h1 style={{ margin: '0 0 14px', fontSize: 'clamp(36px, 7vw, 60px)', fontWeight: 700, letterSpacing: '-0.04em', color: M.ink, fontStyle: 'italic', lineHeight: 1 }}>
            The demo is on the way.
          </h1>
          <p style={{ margin: '0 0 28px', fontSize: 16, color: M.inkMid, lineHeight: 1.55 }}>
            Five minutes, your kid&apos;s actual schools, and a first look at what the app finds. We&apos;re building it now.
          </p>
          <Link href="/" style={{
            display: 'inline-flex', alignItems: 'center', padding: '12px 24px', borderRadius: 999,
            border: `1.5px solid ${M.lineWarm}`, fontSize: 14, fontWeight: 650, color: M.inkMid,
            textDecoration: 'none', letterSpacing: '-0.01em',
          }}>
            ← Back to home
          </Link>
        </div>
      </main>
    </div>
  )
}

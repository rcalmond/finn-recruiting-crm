'use client'

import dynamic from 'next/dynamic'

const SLDesktopFrame = dynamic(
  () => import('./schools').then(m => ({ default: m.SLDesktopFrame })),
  { ssr: false, loading: () => <div style={{ padding: 40, color: '#94a3b8', textAlign: 'center' }}>Loading desktop view…</div> }
)

const SLMobileFrame = dynamic(
  () => import('./schools').then(m => ({ default: m.SLMobileFrame })),
  { ssr: false, loading: () => null }
)

export default function SchoolsWrapper() {
  return (
    <div>
      <div style={{ marginBottom: 64 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
          Desktop
        </div>
        <SLDesktopFrame label="Schools — Liverpool" />
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
          Mobile
        </div>
        <div style={{ maxWidth: 390, margin: '0 auto' }}>
          <SLMobileFrame label="Schools — Liverpool" />
        </div>
      </div>
    </div>
  )
}

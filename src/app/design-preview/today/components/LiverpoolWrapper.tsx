'use client'

import dynamic from 'next/dynamic'

const LVDesktopFrame = dynamic(
  () => import('./variation-4-liverpool').then(m => ({ default: m.LVDesktopFrame })),
  { ssr: false, loading: () => <div style={{ padding: 40, color: '#94a3b8', textAlign: 'center' }}>Loading desktop view…</div> }
)

const LVMobileFrame = dynamic(
  () => import('./variation-4-liverpool').then(m => ({ default: m.LVMobileFrame })),
  { ssr: false, loading: () => null }
)

export default function LiverpoolWrapper() {
  return (
    <div>
      {/* Desktop */}
      <div style={{ marginBottom: 64 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
          Desktop
        </div>
        <LVDesktopFrame label="Variation 4 — Liverpool" />
      </div>

      {/* Mobile */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
          Mobile
        </div>
        <div style={{ maxWidth: 390, margin: '0 auto' }}>
          <LVMobileFrame label="Variation 4 — Liverpool" />
        </div>
      </div>
    </div>
  )
}

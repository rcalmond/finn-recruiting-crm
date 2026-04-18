'use client'

import dynamic from 'next/dynamic'

const LibDesktopFrame = dynamic(
  () => import('./library').then(m => ({ default: m.LibDesktopFrame })),
  { ssr: false, loading: () => <div style={{ padding: 40, color: '#94a3b8', textAlign: 'center' }}>Loading desktop view…</div> }
)

const LibMobileFrame = dynamic(
  () => import('./library').then(m => ({ default: m.LibMobileFrame })),
  { ssr: false, loading: () => null }
)

export default function LibraryWrapper() {
  return (
    <div>
      <div style={{ marginBottom: 64 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
          Desktop
        </div>
        <LibDesktopFrame label="Library — Liverpool" />
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
          Mobile
        </div>
        <div style={{ maxWidth: 390, margin: '0 auto' }}>
          <LibMobileFrame label="Library — Liverpool" />
        </div>
      </div>
    </div>
  )
}

'use client'

import dynamic from 'next/dynamic'

const SDDesktopFrame = dynamic(
  () => import('./school-detail').then(m => ({ default: m.SDDesktopFrame })),
  { ssr: false, loading: () => <div style={{ padding: 40, color: '#94a3b8', textAlign: 'center' }}>Loading desktop view…</div> }
)

const SDMobileFrame = dynamic(
  () => import('./school-detail').then(m => ({ default: m.SDMobileFrame })),
  { ssr: false, loading: () => null }
)

export default function SchoolDetailWrapper() {
  return (
    <div>
      <div style={{ marginBottom: 64 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
          Desktop
        </div>
        <SDDesktopFrame label="School Detail — Liverpool" />
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
          Mobile
        </div>
        <div style={{ maxWidth: 390, margin: '0 auto' }}>
          <SDMobileFrame label="School Detail — Liverpool" />
        </div>
      </div>
    </div>
  )
}

/**
 * Design preview — /design-preview/today
 *
 * Static visual preview only. No auth, no live data, no wired interactions.
 * Drop Claude Design .jsx files into ./components/ and import them below.
 *
 * To add components:
 *   1. Place .jsx (or .tsx) files in src/app/design-preview/today/components/
 *   2. Uncomment the import lines below and update filenames to match
 *   3. Add <ComponentName /> inside the preview area
 */

// Uncomment and rename once you've dropped your files in:
// import DesktopView from './components/DesktopView'
// import MobileView from './components/MobileView'

export default function DesignPreviewPage() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#f1f5f9', minHeight: '100vh' }}>

      {/* Banner */}
      <div style={{
        background: '#f59e0b',
        color: '#1c1917',
        textAlign: 'center',
        padding: '8px 16px',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        position: 'sticky',
        top: 0,
        zIndex: 9999,
      }}>
        Design Preview — not connected to live data
      </div>

      {/* Preview area */}
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>

        {/* Placeholder shown until components are dropped in */}
        <div style={{
          background: '#fff',
          borderRadius: 12,
          border: '2px dashed #cbd5e1',
          padding: '60px 40px',
          textAlign: 'center',
          color: '#94a3b8',
        }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Components not yet loaded
          </div>
          <div style={{ fontSize: 13 }}>
            Drop your .jsx files into{' '}
            <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>
              src/app/design-preview/today/components/
            </code>
            {' '}then import them in{' '}
            <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>
              page.tsx
            </code>
          </div>
        </div>

        {/* Uncomment once components are imported: */}
        {/* <DesktopView /> */}
        {/* <div style={{ marginTop: 48 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Mobile view</div>
          <div style={{ maxWidth: 390, margin: '0 auto' }}>
            <MobileView />
          </div>
        </div> */}

      </div>
    </div>
  )
}

import SchoolsWrapper from './components/SchoolsWrapper'

export default function DesignPreviewSchoolsPage() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#f1f5f9', minHeight: '100vh' }}>
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
      <div style={{ padding: '32px 24px', maxWidth: 1400, margin: '0 auto' }}>
        <SchoolsWrapper />
      </div>
    </div>
  )
}

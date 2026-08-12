import { ThroughballMark, ThroughballWordmark, ThroughballLogo } from '@/components/brand/ThroughballLogo'

// Brand Sweep Pass 0 — minimal render test for the Throughball mark + wordmark.
// Isolated design-preview route (not linked from nav); the sanctioned render
// test called for in the foundations pass. No app surface is touched here.

export const metadata = { title: 'Brand test — Throughball' }

function Panel({ label, dark, children }: { label: string; dark?: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      border: '1px solid var(--tb-border)', borderRadius: 14, overflow: 'hidden',
      background: dark ? 'var(--tb-ink)' : 'var(--tb-warm-white)',
    }}>
      <div style={{
        padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: dark ? 'var(--tb-faint)' : 'var(--tb-muted)',
        borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'var(--tb-border)'}`,
      }}>{label}</div>
      <div style={{ padding: 28, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 32 }}>
        {children}
      </div>
    </div>
  )
}

export default function BrandTestPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 80px', display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--tb-parchment)' }}>
      <div>
        <ThroughballWordmark size={34} />
        <p style={{ fontSize: 13, color: 'var(--tb-muted)', marginTop: 8 }}>
          Pass 0 render test · mark treatments, sizes, wordmark, lockup. Nothing here is wired into the app.
        </p>
      </div>

      <Panel label="Mark — ink / pitch, at size">
        <ThroughballMark size={72} treatment="ink" />
        <ThroughballMark size={48} treatment="ink" />
        <ThroughballMark size={32} treatment="ink" />
        <ThroughballMark size={72} treatment="pitch" />
        <ThroughballMark size={48} treatment="pitch" />
      </Panel>

      <Panel label="Mark — icon variant (runner's dotted path drops at small sizes)">
        <ThroughballMark size={20} treatment="ink" />
        <ThroughballMark size={16} treatment="ink" />
        <ThroughballMark size={16} treatment="pitch" />
      </Panel>

      <Panel label="Mark — reversed (cream on ink)" dark>
        <ThroughballMark size={72} treatment="reversed" />
        <ThroughballMark size={48} treatment="reversed" />
      </Panel>

      <Panel label="Wordmark — accented period (pitch green) / plain">
        <ThroughballWordmark size={40} treatment="ink" />
        <ThroughballWordmark size={40} treatment="pitch" />
        <ThroughballWordmark size={40} treatment="ink" accentPeriod={false} />
      </Panel>

      <Panel label="Wordmark — reversed (period uses the light green on dark)" dark>
        <ThroughballWordmark size={40} treatment="reversed" />
      </Panel>

      <Panel label="Lockup — mark + wordmark">
        <ThroughballLogo size={28} treatment="ink" />
        <ThroughballLogo size={28} treatment="pitch" />
      </Panel>

      <Panel label="Lockup — reversed" dark>
        <ThroughballLogo size={28} treatment="reversed" />
      </Panel>
    </div>
  )
}

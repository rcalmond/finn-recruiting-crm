'use client'

import Link from 'next/link'

// Calm green = Get Ready + Get Seen phase accent
const GREEN = {
  accent: '#2D6A4F',
  accentSoft: '#D7EFE0',
}

const SD = {
  paper:    '#F6F1E8',
  ink:      '#0E0E0E',
  inkMid:   '#4A4A4A',
  inkLo:    '#7A7570',
  inkMute:  '#A8A39B',
  line:     '#E2DBC9',
}

function daysAgo(isoDate: string): string {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'today'
  if (diff === 1) return '1 day ago'
  return `${diff} days ago`
}

function SectionCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${SD.line}`,
      borderRadius: 14,
      padding: 'clamp(18px, 2.5vw, 24px)',
      ...style,
    }}>
      {children}
    </div>
  )
}

function SectionHeader({ eyebrow, label, href, linkText }: { eyebrow: string; label: string; href?: string; linkText?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: GREEN.accent, marginBottom: 4,
      }}>
        {eyebrow}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{
          margin: 0, fontSize: 16, fontWeight: 700,
          letterSpacing: '-0.02em', color: SD.ink, fontStyle: 'italic',
        }}>{label}</h3>
        {href && (
          <Link href={href} style={{
            fontSize: 12, fontWeight: 600, color: GREEN.accent,
            textDecoration: 'none', letterSpacing: '-0.01em',
          }}>
            {linkText ?? 'View all'} →
          </Link>
        )}
      </div>
    </div>
  )
}

function StatusRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      padding: '8px 0',
      borderBottom: `1px solid ${SD.line}`,
    }}>
      <span style={{ fontSize: 13, color: SD.inkMid, fontWeight: 500 }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: SD.ink }}>{value}</span>
        {sub && <span style={{ fontSize: 11, color: SD.inkMute, marginLeft: 6 }}>{sub}</span>}
      </div>
    </div>
  )
}

export default function GetReadyClient({
  reelAsset,
  resumeAsset,
  transcriptAsset,
  activeMessageCount,
  activeQuestionCount,
  tierCounts,
  totalSchools,
}: {
  reelAsset: { name: string; created_at: string } | null
  resumeAsset: { name: string; version: number; created_at: string } | null
  transcriptAsset: { name: string; created_at: string } | null
  activeMessageCount: number
  activeQuestionCount: number
  tierCounts: { A: number; B: number; C: number }
  totalSchools: number
}) {
  return (
    <div style={{
      minHeight: '100vh',
      background: SD.paper,
      fontFamily: "'Inter', -apple-system, sans-serif",
      paddingBottom: 80,
    }}>
      {/* Masthead */}
      <div style={{ padding: '24px clamp(28px, 4vw, 56px) 4px' }}>
        <h1 style={{
          margin: 0,
          fontSize: 'clamp(56px, 7vw, 88px)',
          fontWeight: 700, letterSpacing: '-0.04em',
          color: SD.ink, lineHeight: 0.95,
          fontStyle: 'italic',
        }}>Get Ready.</h1>
        <p style={{
          margin: '12px 0 0', fontSize: 15, color: SD.inkLo,
          fontWeight: 450, letterSpacing: '-0.01em',
        }}>
          Build the profile, film, and school list that make coaches take notice.
        </p>
      </div>

      {/* Content */}
      <div style={{
        padding: '24px clamp(28px, 4vw, 56px)',
        maxWidth: 900,
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <SectionCard>
          <SectionHeader eyebrow="Profile" label="Assets." href="/assets" linkText="Open Library" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <StatusRow label="Current reel" value={reelAsset?.name ?? 'Not uploaded'} sub={reelAsset ? daysAgo(reelAsset.created_at) : undefined} />
            <StatusRow label="Resume" value={resumeAsset ? `v${resumeAsset.version}` : 'Not uploaded'} sub={resumeAsset ? daysAgo(resumeAsset.created_at) : undefined} />
            <StatusRow label="Transcript" value={transcriptAsset ? 'Current' : 'Not uploaded'} sub={transcriptAsset ? daysAgo(transcriptAsset.created_at) : undefined} />
          </div>
        </SectionCard>

        <SectionCard>
          <SectionHeader eyebrow="Messaging" label="Message Inventory." href="/messages" linkText="Open Messages" />
          <div style={{ display: 'flex', gap: 24 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: SD.ink, letterSpacing: '-0.03em' }}>{activeMessageCount}</div>
              <div style={{ fontSize: 12, color: SD.inkLo, marginTop: 2 }}>active messages</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: SD.ink, letterSpacing: '-0.03em' }}>{activeQuestionCount}</div>
              <div style={{ fontSize: 12, color: SD.inkLo, marginTop: 2 }}>questions</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: SD.ink, letterSpacing: '-0.03em' }}>{activeMessageCount - activeQuestionCount}</div>
              <div style={{ fontSize: 12, color: SD.inkLo, marginTop: 2 }}>updates</div>
            </div>
          </div>
        </SectionCard>

        <SectionCard>
          <SectionHeader eyebrow="Target list" label="School List." href="/schools" linkText="Open Schools" />
          <div style={{ display: 'flex', gap: 24, alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: SD.ink, letterSpacing: '-0.03em' }}>{totalSchools}</div>
              <div style={{ fontSize: 12, color: SD.inkLo, marginTop: 2 }}>active schools</div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              {(['A', 'B', 'C'] as const).map(tier => (
                <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: 5,
                    background: tier === 'A' ? '#DCFCE7' : tier === 'B' ? '#DBEAFE' : '#FEF3C7',
                    color: tier === 'A' ? '#166534' : tier === 'B' ? '#1E40AF' : '#92400E',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                  }}>{tier}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: SD.ink }}>{tierCounts[tier]}</span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard style={{ border: `1.5px dashed ${SD.line}`, background: SD.paper }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h3 style={{
              margin: 0, fontSize: 16, fontWeight: 700,
              letterSpacing: '-0.02em', color: SD.inkMute, fontStyle: 'italic',
            }}>School Discovery.</h3>
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: GREEN.accent,
              background: GREEN.accentSoft, border: `1px solid ${GREEN.accent}30`,
              borderRadius: 4, padding: '2px 8px',
            }}>Coming soon</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: SD.inkMute, lineHeight: 1.6 }}>
            Browse by division, region, and academics — then find more schools like the ones you love.
          </p>
        </SectionCard>
      </div>
    </div>
  )
}

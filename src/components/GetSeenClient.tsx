'use client'

import Link from 'next/link'

const SD = {
  paper:    '#F6F1E8',
  ink:      '#0E0E0E',
  inkMid:   '#4A4A4A',
  inkLo:    '#7A7570',
  inkMute:  '#A8A39B',
  line:     '#E2DBC9',
  tealDeep: '#006A65',
  tealSoft: '#D7F0ED',
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${SD.line}`,
      borderRadius: 14,
      padding: 'clamp(18px, 2.5vw, 24px)',
    }}>
      {children}
    </div>
  )
}

export default function GetSeenClient({
  upcomingCampsCount,
  activeCampaignCount,
}: {
  upcomingCampsCount: number
  activeCampaignCount: number
}) {
  return (
    <div style={{
      minHeight: '100vh',
      background: SD.paper,
      fontFamily: "'Inter', -apple-system, sans-serif",
      paddingBottom: 80,
    }}>
      {/* Masthead */}
      <div style={{
        padding: '24px clamp(28px, 4vw, 56px) 4px',
      }}>
        <h1 style={{
          margin: 0,
          fontSize: 'clamp(56px, 7vw, 88px)',
          fontWeight: 700, letterSpacing: '-0.04em',
          color: SD.ink, lineHeight: 0.95,
          fontStyle: 'italic',
        }}>Get Seen.</h1>
        <p style={{
          margin: '12px 0 0', fontSize: 15, color: SD.inkLo,
          fontWeight: 450, letterSpacing: '-0.01em',
        }}>
          Get in front of the coaches who should know your name.
        </p>
      </div>

      {/* Content */}
      <div style={{
        padding: '24px clamp(28px, 4vw, 56px)',
        maxWidth: 900,
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        {/* Camps */}
        <SectionCard>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{
              margin: 0, fontSize: 16, fontWeight: 700,
              letterSpacing: '-0.02em', color: SD.ink, fontStyle: 'italic',
            }}>Camps & Showcases.</h3>
            <Link href="/camps" style={{
              fontSize: 12, fontWeight: 600, color: SD.tealDeep,
              textDecoration: 'none', letterSpacing: '-0.01em',
            }}>
              Open Camps →
            </Link>
          </div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: SD.ink, letterSpacing: '-0.03em' }}>
                {upcomingCampsCount}
              </div>
              <div style={{ fontSize: 12, color: SD.inkLo, marginTop: 2 }}>upcoming camps</div>
            </div>
          </div>
          <p style={{
            margin: '14px 0 0', fontSize: 13, color: SD.inkMid, lineHeight: 1.6,
          }}>
            ID camps, showcases, and clinics where coaches will see you play. Track registrations, deadlines, and which coaches are attending.
          </p>
        </SectionCard>

        {/* Campaigns */}
        <SectionCard>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{
              margin: 0, fontSize: 16, fontWeight: 700,
              letterSpacing: '-0.02em', color: SD.ink, fontStyle: 'italic',
            }}>Campaigns.</h3>
            <Link href="/campaigns" style={{
              fontSize: 12, fontWeight: 600, color: SD.tealDeep,
              textDecoration: 'none', letterSpacing: '-0.01em',
            }}>
              Open Campaigns →
            </Link>
          </div>
          <p style={{
            margin: '0 0 14px', fontSize: 13, color: SD.inkMid, lineHeight: 1.6,
          }}>
            Going to a showcase? Email every attending coach in one pass. Campaigns batch your outreach so no school gets missed.
          </p>
          {activeCampaignCount > 0 && (
            <div style={{
              fontSize: 13, fontWeight: 600, color: SD.ink,
            }}>
              {activeCampaignCount} active campaign{activeCampaignCount !== 1 ? 's' : ''}
            </div>
          )}
          <Link href="/campaigns/new" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginTop: 12, padding: '8px 16px',
            background: SD.ink, color: '#fff',
            borderRadius: 6, fontSize: 12, fontWeight: 600,
            textDecoration: 'none', letterSpacing: '-0.01em',
          }}>
            + New Campaign
          </Link>
        </SectionCard>
      </div>
    </div>
  )
}

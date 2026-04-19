import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const LV = {
  paper: '#F6F1E8',
  ink: '#0E0E0E',
  inkMid: '#4A4A4A',
  inkLo: '#7A7570',
  inkMute: '#A8A39B',
  line: '#E2DBC9',
  tealDeep: '#006A65',
  tealSoft: '#D7F0ED',
}

interface TileProps {
  href: string
  title: string
  count: number | null
  blurb: string
  items: string[]
  cta: string
}

function LibTile({ href, title, count, blurb, items, cta }: TileProps) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }} className="lib-tile-link">
      <div className="lib-tile" style={{
        background: '#fff',
        border: `1px solid ${LV.line}`,
        borderRadius: 18,
        padding: 'clamp(22px, 3vw, 32px)',
        cursor: 'pointer',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{
            fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: 700,
            letterSpacing: '-0.03em', color: LV.ink, fontStyle: 'italic',
            lineHeight: 1,
          }}>
            {title}
          </div>
          {count != null && count > 0 && (
            <div style={{
              fontSize: 13, fontWeight: 700, color: LV.inkLo,
              background: LV.paper, border: `1px solid ${LV.line}`,
              borderRadius: 999, padding: '3px 10px',
              letterSpacing: '-0.01em', flexShrink: 0,
              marginTop: 4,
            }}>
              {count}
            </div>
          )}
        </div>

        {/* Blurb */}
        <p style={{ margin: '0 0 18px', fontSize: 13, color: LV.inkLo, lineHeight: 1.6 }}>
          {blurb}
        </p>

        {/* Sample list */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 22 }}>
          {items.map(item => (
            <div key={item} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 13, color: LV.inkMid,
            }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                background: LV.inkMute, flexShrink: 0,
              }} />
              {item}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontSize: 13, fontWeight: 700, color: LV.tealDeep,
          letterSpacing: '-0.01em',
        }}>
          {cta}
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            background: LV.tealSoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14m-5-6l6 6-6 6" stroke={LV.tealDeep} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default async function LibraryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ count: assetCount }, { count: questionCount }] = await Promise.all([
    supabase.from('assets').select('*', { count: 'exact', head: true }).eq('is_current', true),
    supabase.from('questions').select('*', { count: 'exact', head: true }),
  ])

  return (
    <div style={{
      minHeight: '100vh',
      background: LV.paper,
      padding: 'clamp(28px, 4vw, 48px) clamp(20px, 5vw, 56px)',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <style>{`
        .lib-tile {
          transition: box-shadow 0.15s, border-color 0.15s;
        }
        .lib-tile-link:hover .lib-tile {
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          border-color: ${LV.inkMute} !important;
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 'clamp(28px, 4vw, 44px)', maxWidth: 640 }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '0.15em',
          textTransform: 'uppercase', color: LV.inkLo,
          marginBottom: 10,
        }}>
          Your reference materials
        </div>
        <h1 style={{
          margin: '0 0 12px',
          fontSize: 'clamp(40px, 6vw, 64px)',
          fontWeight: 700, letterSpacing: 'clamp(-2px, -0.03em, -3px)',
          color: LV.ink, fontStyle: 'italic', lineHeight: 1,
        }}>
          Library.
        </h1>
        <p style={{
          margin: 0, fontSize: 'clamp(13px, 1.5vw, 15px)',
          color: LV.inkLo, lineHeight: 1.65, maxWidth: 480,
        }}>
          Everything Finn needs to put his best foot forward — assets coaches can review, and questions to ask on every call.
        </p>
      </div>

      {/* Tile grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 24,
        maxWidth: 880,
      }}>
        <LibTile
          href="/assets"
          title="Assets."
          count={assetCount}
          blurb="Highlight reels, game film, resume, transcripts, and any links you've shared with coaches."
          items={['Highlight reel', 'Game film', 'Resume', 'Transcript', 'Sports Recruits profile']}
          cta="Open Assets"
        />
        <LibTile
          href="/questions"
          title="Questions."
          count={questionCount}
          blurb="A curated bank of questions to ask coaches on every call — organized by what matters most."
          items={['Formation & Fit', 'Roster & Playing Time', 'Development', 'Culture', 'Academics & Aid']}
          cta="Open Questions"
        />
      </div>

      {/* Footnote */}
      <p style={{
        marginTop: 36, fontSize: 12, color: LV.inkMute,
        lineHeight: 1.6, maxWidth: 520, margin: '36px 0 0',
      }}>
        Looking for templates or past drafts? Those live inside Schools, under each conversation.
      </p>
    </div>
  )
}

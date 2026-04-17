import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function LibraryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <div style={{
      padding: '40px 32px',
      maxWidth: 640,
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.15em',
        textTransform: 'uppercase', color: '#7A7570',
        marginBottom: 8,
      }}>
        Library
      </div>
      <h1 style={{
        margin: '0 0 8px',
        fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em',
        color: '#0E0E0E', fontStyle: 'italic', lineHeight: 1,
      }}>
        Your resources.
      </h1>
      <p style={{ margin: '0 0 40px', fontSize: 14, color: '#7A7570', lineHeight: 1.6 }}>
        Assets, question bank, and recruiting materials in one place.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Link href="/assets" style={{ textDecoration: 'none' }}>
          <div style={{
            background: '#fff', border: '1px solid #E2DBC9',
            borderRadius: 14, padding: '20px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'box-shadow 0.15s',
          }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0E0E0E', letterSpacing: -0.4 }}>
                Assets
              </div>
              <div style={{ fontSize: 13, color: '#7A7570', marginTop: 2 }}>
                Highlight reels, transcripts, resume, links
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: '#7A7570', flexShrink: 0 }}>
              <path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </Link>

        <Link href="/dashboard?tab=questions" style={{ textDecoration: 'none' }}>
          <div style={{
            background: '#fff', border: '1px solid #E2DBC9',
            borderRadius: 14, padding: '20px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer',
          }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0E0E0E', letterSpacing: -0.4 }}>
                Question Bank
              </div>
              <div style={{ fontSize: 13, color: '#7A7570', marginTop: 2 }}>
                Pre-call prep questions across 5 categories
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: '#7A7570', flexShrink: 0 }}>
              <path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </Link>
      </div>
    </div>
  )
}

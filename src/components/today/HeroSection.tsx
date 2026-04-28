'use client'

import { useRouter } from 'next/navigation'
import type { FeaturedAction } from '@/lib/todayLogic'
import type { School, ContactLogEntry } from '@/lib/types'

interface Props {
  featured: FeaturedAction | null
  heroCompleted: boolean
  onComplete: (actionItemId?: string) => void
  onSnooze: (actionItemId: string) => void
  onDraft: (school: School, entry?: ContactLogEntry) => void
}

const LV = {
  red: '#C8102E',
  redDeep: '#9A0B23',
  redInk: '#FFE4E8',
  redChrome: '#FF5468',
  teal: '#00B2A9',
  tealDeep: '#006A65',
  tealInk: '#E6F7F5',
  paper: '#F6F1E8',
  ink: '#0E0E0E',
  inkLo: '#7A7570',
}

export default function HeroSection({ featured, heroCompleted, onComplete, onSnooze, onDraft }: Props) {
  const caughtUp = heroCompleted || featured === null

  // ── Caught up state ────────────────────────────────────────────────────────
  if (caughtUp) {
    return (
      <section style={{
        margin: 'clamp(16px, 4vw, 28px) clamp(16px, 5vw, 56px) 0',
        background: LV.teal, color: '#fff',
        borderRadius: 18, overflow: 'hidden',
        position: 'relative',
        padding: 'clamp(28px, 5vw, 40px) clamp(24px, 5vw, 44px)',
      }}>
        {/* Big faint check */}
        <div style={{
          position: 'absolute', right: -20, bottom: -40,
          fontSize: 'clamp(240px, 30vw, 380px)',
          color: 'rgba(0,0,0,0.12)',
          fontWeight: 800, lineHeight: 1, fontStyle: 'italic',
          pointerEvents: 'none', userSelect: 'none',
        }}>✓</div>

        <div style={{ position: 'relative', maxWidth: 520 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 11px', borderRadius: 999,
            background: 'rgba(0,0,0,0.15)', color: '#fff',
            fontSize: 10, fontWeight: 800, letterSpacing: '0.15em',
            textTransform: 'uppercase', marginBottom: 16,
          }}>
            All clear
          </div>
          <div style={{
            fontSize: 'clamp(36px, 6vw, 56px)',
            fontWeight: 700, letterSpacing: '-0.03em',
            lineHeight: 0.95, marginBottom: 16,
            fontStyle: 'italic',
          }}>
            You&apos;re caught up.
          </div>
          <div style={{
            fontSize: 'clamp(14px, 2vw, 16px)',
            color: LV.tealInk, lineHeight: 1.5, marginBottom: 22, opacity: 0.9,
          }}>
            Nothing waiting on you. Check This Week below for upcoming commitments.
          </div>
          <a href="#this-week" style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: '#fff', color: LV.tealDeep,
            border: 'none', borderRadius: 999,
            padding: '12px 22px',
            fontSize: 14, fontWeight: 700, letterSpacing: -0.1,
            cursor: 'pointer', textDecoration: 'none',
          }}>
            See This Week
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
      </section>
    )
  }

  // ── Hero — red, featured action ─────────────────────────────────────────────
  const router = useRouter()
  const { title, context, ctaLabel, emailType, school, actionItem, inboundEntry } = featured!

  // Extract a quote from the inbound message (first ~140 chars)
  const quoteText = inboundEntry?.summary
    ? inboundEntry.summary.replace(/\n+/g, ' ').trim().slice(0, 160)
    : null

  function handleCTA() {
    if (featured!.type === 'action_item') {
      onComplete(actionItem?.id)
    } else {
      // inbound_reply or going_cold → open draft modal
      onDraft(school, inboundEntry ?? undefined)
    }
  }

  function handleSnoozeClick() {
    if (actionItem?.id) onSnooze(actionItem.id)
  }

  return (
    <section style={{
      margin: 'clamp(16px, 4vw, 28px) clamp(16px, 5vw, 56px) 0',
      background: LV.red, color: '#fff',
      borderRadius: 18, overflow: 'hidden',
      position: 'relative',
      boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 30px 60px -28px rgba(200,16,46,0.45)',
    }}>
      {/* Big numeral behind everything */}
      <div style={{
        position: 'absolute',
        right: -20, bottom: -100,
        fontSize: 'clamp(240px, 32vw, 480px)',
        color: 'rgba(0,0,0,0.18)',
        fontWeight: 800, lineHeight: 1, letterSpacing: -20,
        fontStyle: 'italic',
        pointerEvents: 'none', userSelect: 'none',
      }}>01</div>

      {/* Top strip */}
      <div style={{
        padding: 'clamp(16px, 3vw, 22px) clamp(22px, 4vw, 44px) 0',
        display: 'flex', alignItems: 'center', gap: 14,
        position: 'relative', flexWrap: 'wrap',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '5px 11px', borderRadius: 999,
          background: 'rgba(0,0,0,0.20)', color: '#fff',
          fontSize: 10, fontWeight: 800, letterSpacing: '0.15em',
          textTransform: 'uppercase',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: '#fff',
          }}/>
          Priority №1
        </div>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: LV.redInk,
        }}>
          {context}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: LV.redInk, opacity: 0.6 }}>
          {school.category !== 'Nope' ? `Category ${school.category}` : ''}
          {school.division ? ` · ${school.division}` : ''}
        </div>
      </div>

      {/* Body grid */}
      <div style={{
        padding: 'clamp(20px, 4vw, 36px) clamp(22px, 4vw, 44px) clamp(28px, 4vw, 44px)',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
        gap: 'clamp(24px, 4vw, 56px)',
        alignItems: 'end',
        position: 'relative',
      }} className="hero-grid">

        {/* LEFT — oversized title */}
        <div>
          <div style={{
            fontSize: 'clamp(40px, 6vw, 72px)',
            fontWeight: 700,
            letterSpacing: 'clamp(-2px, -0.04em, -3.6px)',
            lineHeight: 0.92,
            color: '#fff',
            fontStyle: 'italic',
          }}>
            {title}
          </div>
          <div style={{
            marginTop: 'clamp(14px, 2vw, 22px)',
            fontSize: 'clamp(13px, 1.5vw, 16px)',
            color: LV.redInk, opacity: 0.9,
            lineHeight: 1.5, maxWidth: 440,
          }}>
            <span
              onClick={() => router.push(`/schools/${school.id}`)}
              style={{
                cursor: 'pointer',
                textDecoration: 'underline',
                textDecorationColor: 'rgba(255,235,240,0.5)',
                textUnderlineOffset: 3,
              }}
            >{school.name}</span>
            {school.division && ` · ${school.division}`}
            {school.location && ` · ${school.location}`}
          </div>
        </div>

        {/* RIGHT — quote + CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignSelf: 'end' }}>
          {quoteText && quoteText.length > 40 && (
            <div style={{
              padding: '14px 16px',
              background: 'rgba(0,0,0,0.22)',
              borderRadius: 12,
              fontSize: 13, color: '#fff', lineHeight: 1.5,
              fontStyle: 'italic',
              borderLeft: `3px solid ${LV.redChrome}`,
            }}>
              &ldquo;{quoteText}{quoteText.length === 160 ? '…' : ''}&rdquo;
              {inboundEntry && (
                <div style={{
                  marginTop: 8, fontStyle: 'normal',
                  fontSize: 11, color: LV.redInk, opacity: 0.7,
                  letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600,
                }}>
                  {inboundEntry.date} · {inboundEntry.coach_name || school.head_coach || 'Coach'}
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleCTA}
            style={{
              background: '#fff', color: LV.red,
              border: 'none', borderRadius: 12,
              padding: 'clamp(14px, 2vw, 18px) clamp(18px, 2vw, 26px)',
              fontSize: 'clamp(14px, 1.5vw, 17px)', fontWeight: 700,
              letterSpacing: -0.2, cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14, width: '100%',
              boxShadow: '0 1px 0 rgba(0,0,0,0.08), 0 8px 20px -8px rgba(0,0,0,0.25)',
            }}
          >
            <span>{ctaLabel}</span>
            <span style={{
              width: 30, height: 30, borderRadius: '50%',
              background: LV.red, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </button>

          {actionItem && (
            <button
              onClick={handleSnoozeClick}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: LV.redInk, opacity: 0.8,
                textAlign: 'center', letterSpacing: '0.04em',
                textTransform: 'uppercase', fontWeight: 600,
                fontFamily: 'inherit', padding: '4px 0',
              }}
            >
              Snooze 1 day
            </button>
          )}
        </div>
      </div>

      {/* Responsive: stack on mobile */}
      <style>{`
        @media (max-width: 640px) {
          .hero-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  )
}

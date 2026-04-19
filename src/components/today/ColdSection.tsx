'use client'

import { useRouter } from 'next/navigation'
import type { ColdCandidate } from '@/lib/todayLogic'
import type { School } from '@/lib/types'
import type { EmailType } from '@/lib/prompts'

interface Props {
  cold: ColdCandidate[]
  onDraft: (school: School, emailType: EmailType, coachMessage?: string) => void
}

const LV = {
  paper: '#F6F1E8',
  ink: '#0E0E0E',
  inkMid: '#4A4A4A',
  inkLo: '#7A7570',
  line: '#E2DBC9',
  gold: '#F6EB61',
  goldDeep: '#C8B22E',
  goldInk: '#5A4E0F',
}

export default function ColdSection({ cold, onDraft }: Props) {
  const router = useRouter()
  if (cold.length === 0) return null

  return (
    <section style={{
      margin: 'clamp(32px, 5vw, 52px) clamp(16px, 5vw, 56px) 0',
      background: LV.gold,
      borderRadius: 18,
      padding: 'clamp(20px, 3vw, 28px) 6px 6px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: 'clamp(0px, 1vw, 0px) clamp(18px, 3vw, 30px) clamp(18px, 2vw, 22px)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.15em',
            color: LV.goldInk, textTransform: 'uppercase',
            padding: '4px 0', borderTop: `2px solid ${LV.goldInk}`,
          }}>№ 04</div>
          <div style={{
            fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 700,
            letterSpacing: '-0.03em', color: LV.goldInk, fontStyle: 'italic',
          }}>Don&apos;t let these go cold</div>
          <div style={{
            fontSize: 13, color: LV.goldInk, opacity: 0.7, fontWeight: 600,
          }}>{cold.length}</div>
          <div style={{
            marginLeft: 'auto', fontSize: 11, color: LV.goldInk, opacity: 0.7,
            textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700,
          }}>5+ days silent</div>
        </div>
      </div>

      {/* Card grid */}
      <div style={{
        background: LV.paper,
        borderRadius: 14,
        padding: 'clamp(10px, 1.5vw, 14px)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 'clamp(10px, 1.5vw, 14px)',
      }}>
        {cold.map(({ school, inbound, daysWaiting }) => {
          const preview = inbound.summary.replace(/\n+/g, ' ').trim().slice(0, 140)
          const meta = [
            school.category !== 'Nope' ? `Cat ${school.category}` : null,
            school.division || null,
          ].filter(Boolean).join(' · ')

          return (
            <div key={school.id} onClick={() => router.push(`/schools/${school.id}`)} style={{
              background: '#fff',
              border: `1px solid ${LV.line}`,
              borderRadius: 12,
              padding: 'clamp(16px, 2vw, 22px)',
              display: 'flex', flexDirection: 'column', gap: 10,
              minHeight: 160,
              position: 'relative',
              cursor: 'pointer',
            }}>
              {/* Gold top accent bar */}
              <div style={{
                position: 'absolute', top: 0, left: 20, right: 20, height: 3,
                background: LV.gold, borderRadius: '0 0 3px 3px',
              }}/>

              {/* Eyebrow */}
              <div style={{
                fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                fontWeight: 800, color: LV.goldInk,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{
                  width: 7, height: 7, background: LV.gold,
                  borderRadius: '50%', border: `1px solid ${LV.goldDeep}`,
                  flexShrink: 0,
                }}/>
                Day {daysWaiting} · cooling
              </div>

              {/* School name */}
              <div style={{
                fontSize: 'clamp(16px, 2vw, 19px)', fontWeight: 700,
                color: LV.ink, letterSpacing: '-0.02em',
              }}>{school.short_name || school.name}</div>

              {/* Inbound preview */}
              <div style={{
                fontSize: 13, color: LV.inkMid, lineHeight: 1.5,
                letterSpacing: '-0.01em', flex: 1,
              }}>
                {preview}{inbound.summary.length > 140 ? '…' : ''}
              </div>

              {/* Footer */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                paddingTop: 10, borderTop: `1px solid ${LV.line}`,
                gap: 8,
              }}>
                <div style={{ fontSize: 11, color: LV.inkLo, fontWeight: 600 }}>
                  {meta}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDraft(school, 'follow_up', inbound.summary) }}
                  style={{
                    background: LV.ink, color: '#fff',
                    border: 'none', borderRadius: 999,
                    padding: '7px 13px',
                    fontSize: 12, fontWeight: 650,
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    letterSpacing: -0.1, flexShrink: 0,
                  }}
                >
                  Draft follow-up
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

'use client'

import { useState } from 'react'
import type { ContactLogEntry, School } from '@/lib/types'
import type { EmailType } from '@/lib/prompts'
import { daysBetween } from '@/lib/utils'

const INITIAL_LIMIT = 10

interface Props {
  unreplied: ContactLogEntry[]
  schools: School[]
  onDraft: (school: School, emailType: EmailType, coachMessage?: string) => void
}

const LV = {
  teal: '#00B2A9',
  tealDeep: '#006A65',
  tealInk: '#E6F7F5',
  paper: '#F6F1E8',
  ink: '#0E0E0E',
  inkMid: '#4A4A4A',
  inkLo: '#7A7570',
  line: '#E2DBC9',
}

export default function AwaitSection({ unreplied, schools, onDraft }: Props) {
  const schoolMap = new Map(schools.map(s => [s.id, s]))
  const [expanded, setExpanded] = useState(false)

  const visible = expanded ? unreplied : unreplied.slice(0, INITIAL_LIMIT)
  const hasMore = unreplied.length > INITIAL_LIMIT

  return (
    <section style={{
      margin: 'clamp(32px, 5vw, 52px) clamp(16px, 5vw, 56px) 0',
      background: LV.teal, color: '#fff',
      borderRadius: 18,
      padding: 'clamp(20px, 3vw, 28px) 6px 6px',
    }}>
      {/* Header */}
      <div style={{ padding: 'clamp(0px, 1vw, 0px) clamp(18px, 3vw, 30px) clamp(18px, 2vw, 22px)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.15em',
            color: LV.tealInk, textTransform: 'uppercase',
            padding: '4px 0', borderTop: `2px solid ${LV.tealInk}`,
          }}>№ 02</div>
          <div style={{
            fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 700,
            letterSpacing: '-0.03em', color: '#fff', fontStyle: 'italic',
          }}>Awaiting your reply</div>
          <div style={{
            fontSize: 13, color: LV.tealInk, opacity: 0.85, fontWeight: 600,
          }}>{unreplied.length}</div>
          <div style={{
            marginLeft: 'auto', fontSize: 11, color: LV.tealInk, opacity: 0.75,
            textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700,
          }}>Oldest first</div>
        </div>
      </div>

      {/* Rows */}
      <div style={{
        background: LV.paper, borderRadius: 14, overflow: 'hidden',
      }}>
        {unreplied.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <div style={{
              fontSize: 22, fontWeight: 700, color: LV.tealDeep,
              letterSpacing: '-0.03em', marginBottom: 4, fontStyle: 'italic',
            }}>Inbox zero. Well done.</div>
            <div style={{ fontSize: 13, color: LV.inkLo }}>
              No coaches waiting. Check back after your next match.
            </div>
          </div>
        ) : (
          <>
            {visible.map((entry, i) => {
              const school = schoolMap.get(entry.school_id)
              if (!school) return null
              const daysWaiting = daysBetween(entry.date)
              const preview = entry.summary.replace(/\n+/g, ' ').trim().slice(0, 120)

              return (
                <div key={entry.id} style={{
                  padding: 'clamp(14px, 2vw, 20px) clamp(16px, 3vw, 24px)',
                  borderTop: i === 0 ? 'none' : `1px solid ${LV.line}`,
                  display: 'flex', gap: 'clamp(12px, 2vw, 20px)',
                  alignItems: 'center',
                }}>
                  {/* Days column (desktop only) */}
                  <div style={{ width: 96, flexShrink: 0 }} className="await-days">
                    <div style={{
                      fontSize: 'clamp(20px, 2.5vw, 26px)', fontWeight: 700,
                      color: LV.tealDeep, letterSpacing: '-0.03em',
                      fontStyle: 'italic', lineHeight: 1,
                    }}>
                      {daysWaiting}
                      <span style={{
                        fontSize: 11, color: LV.inkLo, fontWeight: 600,
                        marginLeft: 4, letterSpacing: '0.04em',
                        fontStyle: 'normal', textTransform: 'uppercase',
                      }}>days</span>
                    </div>
                    <div style={{
                      marginTop: 3, fontSize: 10, letterSpacing: '0.1em',
                      fontWeight: 700, color: LV.tealDeep, textTransform: 'uppercase',
                    }}>waiting</div>
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex', alignItems: 'baseline', gap: 10,
                      marginBottom: 3, flexWrap: 'wrap',
                    }}>
                      <div style={{
                        fontSize: 'clamp(15px, 2vw, 19px)', fontWeight: 700,
                        color: LV.ink, letterSpacing: '-0.02em',
                      }}>{school.short_name || school.name}</div>
                      <div style={{ fontSize: 13, color: LV.inkMid }}>
                        {entry.coach_name || school.head_coach || ''}
                        {entry.channel ? ` · via ${entry.channel}` : ''}
                      </div>
                      {/* Mobile: days */}
                      <div style={{ marginLeft: 'auto', fontSize: 12, color: LV.tealDeep, fontWeight: 700 }}
                        className="await-days-mobile">
                        {daysWaiting}d
                      </div>
                    </div>
                    <div style={{
                      fontSize: 13, color: LV.inkMid, lineHeight: 1.5,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', maxWidth: 520,
                    }}>{preview}{entry.summary.length > 120 ? '…' : ''}</div>
                  </div>

                  {/* CTA */}
                  <button
                    onClick={() => onDraft(school, 'reply', entry.summary)}
                    style={{
                      padding: 'clamp(9px, 1.5vw, 11px) clamp(13px, 2vw, 18px)',
                      background: LV.tealDeep, color: '#fff',
                      border: 'none', borderRadius: 999,
                      fontSize: 13, fontWeight: 650,
                      cursor: 'pointer', fontFamily: 'inherit',
                      flexShrink: 0, letterSpacing: -0.1,
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    Draft reply
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              )
            })}
            {hasMore && (
              <div style={{
                padding: 'clamp(12px, 2vw, 16px) clamp(16px, 3vw, 24px)',
                borderTop: `1px solid ${LV.line}`,
                textAlign: 'center',
              }}>
                <button
                  onClick={() => setExpanded(e => !e)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 700, color: LV.tealDeep,
                    letterSpacing: '-0.01em', fontFamily: 'inherit',
                    padding: '4px 0',
                  }}
                >
                  {expanded
                    ? 'Show less'
                    : `See all ${unreplied.length} unreplied`
                  }
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @media (max-width: 640px) {
          .await-days { display: none !important; }
          .await-days-mobile { display: block !important; }
        }
        @media (min-width: 641px) {
          .await-days-mobile { display: none !important; }
        }
      `}</style>
    </section>
  )
}

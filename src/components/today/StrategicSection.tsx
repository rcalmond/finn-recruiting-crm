'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { StrategicPrompt, PromptKey } from '@/lib/strategic-prompts'
import type { School } from '@/lib/types'

const LV = {
  paper:    '#F6F1E8',
  ink:      '#0E0E0E',
  inkLo:    '#7A7570',
  inkMute:  '#A8A39B',
  line:     '#E2DBC9',
  tealDeep: '#006A65',
}

// Tag labels for the 4 fixed prompts
const PROMPT_TAG: Record<PromptKey, string> = {
  reel_coverage:  'COVERAGE',
  rq_refresh:     'PROFILE',
  stale_tier_a:   'RHYTHM',
  pipeline_shape: 'PIPELINE',
}

interface Props {
  prompts: StrategicPrompt[]
  schools: School[]
  onSkip: (key: string) => Promise<void>
  onBatchReel: (schoolIds: string[]) => void
}

export default function StrategicSection({ prompts, schools, onSkip, onBatchReel }: Props) {
  const router = useRouter()
  const [listModal, setListModal] = useState<{ title: string; schoolIds: string[] } | null>(null)

  if (prompts.length === 0) return null

  function handleAction(prompt: StrategicPrompt) {
    if (prompt.actionKey === 'batch_reel') {
      onBatchReel(prompt.allTargetSchoolIds)
    } else if (prompt.actionKey === 'school_list') {
      setListModal({
        title: prompt.question,
        schoolIds: prompt.affectedSchoolIds,
      })
    } else if (prompt.actionKey === 'add_schools') {
      router.push('/schools')
    }
  }

  return (
    <section style={{
      margin: 'clamp(36px, 4vw, 52px) clamp(28px, 4vw, 56px) 0',
    }}>
      {/* Section header — subtle variant */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 14,
        marginBottom: 16,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: LV.inkMute,
          padding: '4px 0', borderTop: `2px solid ${LV.inkMute}`,
        }}>Think</div>
        <div style={{
          fontSize: 18, fontWeight: 700,
          letterSpacing: '-0.03em', color: LV.inkLo, fontStyle: 'italic',
        }}>This week.</div>
      </div>

      {/* Card grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 14,
      }}>
        {prompts.map(prompt => (
          <PromptCard
            key={prompt.key}
            prompt={prompt}
            tag={PROMPT_TAG[prompt.key] ?? ''}
            onAction={() => handleAction(prompt)}
            onSkip={() => onSkip(prompt.key)}
          />
        ))}
      </div>

      {/* School list modal */}
      {listModal && (
        <SchoolListModal
          title={listModal.title}
          schoolIds={listModal.schoolIds}
          schools={schools}
          onClose={() => setListModal(null)}
          onNavigate={(id) => { setListModal(null); router.push(`/schools/${id}`) }}
        />
      )}
    </section>
  )
}

// ── Prompt card ──────────────────────────────────────────────────────────────

function PromptCard({ prompt, tag, onAction, onSkip }: {
  prompt: StrategicPrompt
  tag: string
  onAction: () => void
  onSkip: () => void
}) {
  return (
    <div style={{
      background: LV.tealDeep,
      borderRadius: 14,
      padding: '22px 24px',
      display: 'flex', flexDirection: 'column', gap: 10,
      position: 'relative', overflow: 'hidden',
      color: '#fff',
    }}>
      {/* Tag — top-right */}
      {tag && (
        <div style={{
          position: 'absolute', top: 18, right: 20,
          fontSize: 10, fontWeight: 800, letterSpacing: '0.32em',
          textTransform: 'uppercase', whiteSpace: 'nowrap',
          color: 'rgba(255,255,255,0.65)',
        }}>{tag}</div>
      )}

      {/* Question */}
      <div style={{
        fontSize: 'clamp(19px, 1.5vw, 22px)', fontWeight: 700,
        fontStyle: 'italic', letterSpacing: '-0.025em',
        lineHeight: 1.15, color: '#fff', paddingRight: 80,
        textWrap: 'balance' as React.CSSProperties['textWrap'],
      }}>{prompt.question}</div>

      {/* Summary */}
      <div style={{
        fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.55,
        marginBottom: 4,
      }}>{prompt.summary}</div>

      {/* Action row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 2 }}>
        <button
          onClick={onAction}
          style={{
            padding: '8px 18px', background: '#fff', color: LV.tealDeep,
            border: 'none', borderRadius: 999,
            fontSize: 12, fontWeight: 800, letterSpacing: -0.1,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          {prompt.actionLabel}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2.6"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          onClick={onSkip}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 700,
            color: 'rgba(255,255,255,0.65)',
            fontFamily: 'inherit', padding: 0, letterSpacing: -0.1,
          }}
        >Skip this week</button>
      </div>
    </div>
  )
}

// ── School list modal (unchanged) ────────────────────────────────────────────

function SchoolListModal({ title, schoolIds, schools, onClose, onNavigate }: {
  title: string
  schoolIds: string[]
  schools: School[]
  onClose: () => void
  onNavigate: (id: string) => void
}) {
  const listed = schoolIds
    .map(id => schools.find(s => s.id === id))
    .filter(Boolean) as School[]

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1050,
      }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 400, maxHeight: '70vh', background: '#fff', borderRadius: 12,
        boxShadow: '0 20px 48px rgba(0,0,0,0.18)', zIndex: 1051,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${LV.line}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: LV.ink }}>{title}</div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 18, color: LV.inkLo,
            cursor: 'pointer', lineHeight: 1,
          }}>&times;</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {listed.map(s => (
            <button
              key={s.id}
              onClick={() => onNavigate(s.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '10px 20px', background: 'none', border: 'none',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}
            >
              <span style={{
                fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                background: s.category === 'A' ? '#FEE2E2' : s.category === 'B' ? '#DBEAFE' : '#F3F4F6',
                color: s.category === 'A' ? '#991B1B' : s.category === 'B' ? '#1E40AF' : '#374151',
              }}>{s.category}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: LV.ink }}>
                {s.short_name || s.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

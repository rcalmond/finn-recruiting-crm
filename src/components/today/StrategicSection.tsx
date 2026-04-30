'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { StrategicPrompt } from '@/lib/strategic-prompts'
import type { School } from '@/lib/types'

const LV = {
  paper: '#F6F1E8',
  paperDeep: '#EFE8D8',
  ink: '#0E0E0E',
  inkMid: '#4A4A4A',
  inkLo: '#7A7570',
  inkMute: '#A8A39B',
  line: '#E2DBC9',
  tealDeep: '#006A65',
  tealSoft: '#D7F0ED',
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
      onBatchReel(prompt.affectedSchoolIds)
    } else if (prompt.actionKey === 'school_list') {
      const schoolMap = new Map(schools.map(s => [s.id, s]))
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
      margin: 'clamp(24px, 3vw, 36px) clamp(16px, 5vw, 56px) 0',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10,
        marginBottom: 'clamp(12px, 2vw, 18px)',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.15em',
          textTransform: 'uppercase', color: LV.inkMute,
          padding: '4px 0', borderTop: `2px solid ${LV.inkMute}`,
        }}>Think</div>
        <div style={{
          fontSize: 'clamp(16px, 2vw, 20px)', fontWeight: 700,
          letterSpacing: '-0.02em', color: LV.inkLo, fontStyle: 'italic',
        }}>This week.</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {prompts.map(prompt => (
          <PromptCard
            key={prompt.key}
            prompt={prompt}
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

function PromptCard({ prompt, onAction, onSkip }: {
  prompt: StrategicPrompt
  onAction: () => void
  onSkip: () => void
}) {
  return (
    <div style={{
      padding: '14px 18px', borderRadius: 10,
      background: LV.paperDeep, border: `1px solid ${LV.line}`,
    }}>
      <div style={{
        fontSize: 13, fontWeight: 700, color: LV.ink,
        marginBottom: 4, lineHeight: 1.4,
      }}>{prompt.question}</div>
      <div style={{
        fontSize: 12, color: LV.inkMid, marginBottom: 12,
      }}>{prompt.summary}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={onAction}
          style={{
            padding: '6px 14px', background: LV.ink, color: '#fff',
            border: 'none', borderRadius: 999, fontSize: 11, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >{prompt.actionLabel}</button>
        <button
          onClick={onSkip}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 600, color: LV.inkMute,
            fontFamily: 'inherit', padding: 0,
          }}
        >Skip this week</button>
      </div>
    </div>
  )
}

function SchoolListModal({ title, schoolIds, schools, onClose, onNavigate }: {
  title: string
  schoolIds: string[]
  schools: School[]
  onClose: () => void
  onNavigate: (id: string) => void
}) {
  const schoolMap = new Map(schools.map(s => [s.id, s]))
  const listed = schoolIds.map(id => schoolMap.get(id)).filter(Boolean) as School[]

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1100,
      }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 400, maxHeight: '70vh', background: '#fff', borderRadius: 12,
        boxShadow: '0 20px 48px rgba(0,0,0,0.18)', zIndex: 1101,
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

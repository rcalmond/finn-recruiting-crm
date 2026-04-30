'use client'

import { useState, useMemo } from 'react'
import type { School } from '@/lib/types'
import DraftModal, { type TaskContext } from '@/components/DraftModal'

const LV = {
  ink: '#0E0E0E',
  inkLo: '#7A7570',
  inkMute: '#A8A39B',
  line: '#E2DBC9',
  tealDeep: '#006A65',
  tealSoft: '#D7F0ED',
  red: '#C8102E',
}

interface Props {
  schoolIds: string[]
  schools: School[]
  userId: string
  reelUrl: string | null
  reelTitle: string | null
  onClose: () => void
}

type SchoolState = 'pending' | 'drafting' | 'sent' | 'skipped'

export default function BatchReelModal({ schoolIds, schools, userId, reelUrl, reelTitle, onClose }: Props) {
  const reelTaskContext: TaskContext | undefined = reelUrl ? {
    type: 'send_reel',
    metadata: { reelUrl, reelTitle: reelTitle ?? undefined },
  } : undefined
  const schoolMap = useMemo(() => new Map(schools.map(s => [s.id, s])), [schools])
  const listed = useMemo(() =>
    schoolIds.map(id => schoolMap.get(id)).filter(Boolean) as School[],
    [schoolIds, schoolMap]
  )

  const [states, setStates] = useState<Map<string, SchoolState>>(() =>
    new Map(listed.map(s => [s.id, 'pending' as SchoolState]))
  )
  const [draftingSchoolId, setDraftingSchoolId] = useState<string | null>(null)

  const pending = listed.filter(s => states.get(s.id) === 'pending')
  const sent = listed.filter(s => states.get(s.id) === 'sent')
  const skipped = listed.filter(s => states.get(s.id) === 'skipped')

  function startNext() {
    const next = pending[0]
    if (!next) return
    setStates(prev => new Map(prev).set(next.id, 'drafting'))
    setDraftingSchoolId(next.id)
  }

  function handleSent(schoolId: string) {
    setStates(prev => new Map(prev).set(schoolId, 'sent'))
    setDraftingSchoolId(null)
  }

  function handleSkip(schoolId: string) {
    setStates(prev => new Map(prev).set(schoolId, 'skipped'))
    setDraftingSchoolId(null)
  }

  const draftingSchool = draftingSchoolId ? schoolMap.get(draftingSchoolId) : null
  const allDone = pending.length === 0 && !draftingSchoolId

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1050,
      }} />

      {/* Main panel */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 480, maxHeight: '80vh', background: '#fff', borderRadius: 12,
        boxShadow: '0 20px 48px rgba(0,0,0,0.18)', zIndex: 1051,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${LV.line}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: LV.ink }}>Send latest reel</div>
            <div style={{ fontSize: 11, color: LV.inkLo, marginTop: 2 }}>
              {sent.length} sent · {skipped.length} skipped · {pending.length} remaining
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 18, color: LV.inkLo,
            cursor: 'pointer', lineHeight: 1,
          }}>&times;</button>
        </div>

        {/* School list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {listed.map(s => {
            const state = states.get(s.id) ?? 'pending'
            return (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 20px',
                opacity: state === 'skipped' ? 0.4 : 1,
              }}>
                {/* Status indicator */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: state === 'sent' ? LV.tealDeep
                    : state === 'skipped' ? LV.inkMute
                    : state === 'drafting' ? '#F59E0B'
                    : LV.line,
                }} />
                {/* School name + tier */}
                <span style={{
                  fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                  background: s.category === 'A' ? '#FEE2E2' : '#DBEAFE',
                  color: s.category === 'A' ? '#991B1B' : '#1E40AF',
                  flexShrink: 0,
                }}>{s.category}</span>
                <span style={{
                  fontSize: 13, fontWeight: 600, color: LV.ink, flex: 1,
                  textDecoration: state === 'sent' ? 'line-through' : state === 'skipped' ? 'line-through' : 'none',
                }}>
                  {s.short_name || s.name}
                </span>
                {/* State label */}
                <span style={{
                  fontSize: 10, fontWeight: 600, flexShrink: 0,
                  color: state === 'sent' ? LV.tealDeep : state === 'skipped' ? LV.inkMute : state === 'drafting' ? '#F59E0B' : LV.inkLo,
                }}>
                  {state === 'sent' ? 'Sent' : state === 'skipped' ? 'Skipped' : state === 'drafting' ? 'Drafting...' : ''}
                </span>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: `1px solid ${LV.line}`,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          {allDone ? (
            <button onClick={onClose} style={{
              padding: '8px 18px', background: LV.tealDeep, color: '#fff',
              border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Done</button>
          ) : !draftingSchoolId ? (
            <button onClick={startNext} style={{
              padding: '8px 18px', background: LV.ink, color: '#fff',
              border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {sent.length > 0 || skipped.length > 0 ? 'Next school' : 'Start'}
            </button>
          ) : null}
        </div>
      </div>

      {/* DraftModal for current school */}
      {draftingSchool && draftingSchoolId && (
        <DraftModal
          mode={{
            kind: 'fresh',
            schoolId: draftingSchool.id,
            coachId: draftingSchool.id, // placeholder — modal resolves primary coach
            schoolName: draftingSchool.name,
          }}
          userId={userId}
          taskContext={reelTaskContext}
          onClose={() => handleSkip(draftingSchoolId)}
          onSent={() => handleSent(draftingSchoolId)}
        />
      )}
    </>
  )
}

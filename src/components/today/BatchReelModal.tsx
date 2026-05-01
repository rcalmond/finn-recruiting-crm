'use client'

import { useState, useEffect, useMemo } from 'react'
import type { School } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
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
  const supabase = useMemo(() => createClient(), [])
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
  const [loaded, setLoaded] = useState(false)

  // ── Load persisted state from batch_reel_sends on mount ────────────────────
  useEffect(() => {
    if (!reelUrl) { setLoaded(true); return }
    supabase.from('batch_reel_sends')
      .select('school_id, sent_via')
      .eq('reel_url', reelUrl)
      .in('school_id', schoolIds)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setStates(prev => {
            const next = new Map(prev)
            for (const row of data as Array<{ school_id: string; sent_via: string }>) {
              if (row.sent_via === 'Email' || row.sent_via === 'Sports Recruits') {
                next.set(row.school_id, 'sent')
              } else if (row.sent_via === 'Skipped' && next.get(row.school_id) !== 'sent') {
                next.set(row.school_id, 'skipped')
              }
            }
            return next
          })
        }
        setLoaded(true)
      })
  }, [supabase, reelUrl, schoolIds])

  const pending = listed.filter(s => states.get(s.id) === 'pending')
  const sent = listed.filter(s => states.get(s.id) === 'sent')
  const skipped = listed.filter(s => states.get(s.id) === 'skipped')

  // ── Handlers with DB persistence ──────────────────────────────────────────

  function startSchool(schoolId: string) {
    const currentState = states.get(schoolId)
    if (currentState !== 'pending' && currentState !== 'skipped') return

    // If revisiting a skipped school, delete the Skipped row
    if (currentState === 'skipped' && reelUrl) {
      supabase.from('batch_reel_sends')
        .delete()
        .eq('school_id', schoolId)
        .eq('reel_url', reelUrl)
        .eq('sent_via', 'Skipped')
        .then(() => {}) // fire-and-forget
    }

    setStates(prev => new Map(prev).set(schoolId, 'drafting'))
    setDraftingSchoolId(schoolId)
  }

  async function handleSent(schoolId: string) {
    setStates(prev => new Map(prev).set(schoolId, 'sent'))
    setDraftingSchoolId(null)

    // Persist to batch_reel_sends
    if (reelUrl) {
      await supabase.from('batch_reel_sends').insert({
        school_id: schoolId,
        reel_url: reelUrl,
        sent_via: 'Email',
      })
    }
  }

  async function handleSkip(schoolId: string) {
    setStates(prev => new Map(prev).set(schoolId, 'skipped'))
    setDraftingSchoolId(null)

    // Persist to batch_reel_sends
    if (reelUrl) {
      await supabase.from('batch_reel_sends').insert({
        school_id: schoolId,
        reel_url: reelUrl,
        sent_via: 'Skipped',
      })
    }
  }

  const draftingSchool = draftingSchoolId ? schoolMap.get(draftingSchoolId) : null

  if (!loaded) {
    return (
      <>
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1050 }} />
        <div style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: '#fff', borderRadius: 12, padding: '40px 24px', zIndex: 1051,
          fontSize: 13, color: LV.inkLo,
        }}>Loading...</div>
      </>
    )
  }

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
            const isClickable = state === 'pending' || state === 'skipped'
            return (
              <div
                key={s.id}
                onClick={() => isClickable && startSchool(s.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 20px',
                  opacity: state === 'skipped' ? 0.55 : 1,
                  cursor: isClickable ? 'pointer' : 'default',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (isClickable) e.currentTarget.style.background = '#F0EDE4' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: state === 'sent' ? LV.tealDeep
                    : state === 'skipped' ? LV.inkMute
                    : state === 'drafting' ? '#F59E0B'
                    : LV.line,
                }} />
                <span style={{
                  fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                  background: s.category === 'A' ? '#FEE2E2' : '#DBEAFE',
                  color: s.category === 'A' ? '#991B1B' : '#1E40AF',
                  flexShrink: 0,
                }}>{s.category}</span>
                <span style={{
                  fontSize: 13, fontWeight: 600, color: LV.ink, flex: 1,
                  textDecoration: state === 'sent' || state === 'skipped' ? 'line-through' : 'none',
                }}>
                  {s.short_name || s.name}
                </span>
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
          {pending.length === 0 && skipped.length === 0 ? (
            <button onClick={onClose} style={{
              padding: '8px 18px', background: LV.tealDeep, color: '#fff',
              border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Done</button>
          ) : pending.length === 0 && skipped.length > 0 ? (
            <div style={{ fontSize: 11, color: LV.inkMute }}>
              Click skipped schools to revisit, or close
            </div>
          ) : (
            <div style={{ fontSize: 11, color: LV.inkMute }}>
              Click any school to draft
            </div>
          )}
        </div>
      </div>

      {/* DraftModal for current school */}
      {draftingSchool && draftingSchoolId && (
        <DraftModal
          mode={{
            kind: 'fresh',
            schoolId: draftingSchool.id,
            coachId: draftingSchool.id,
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

'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { CampWithRelations } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { updateFinnStatus } from '@/lib/camps'

const LV = {
  ink:      '#0E0E0E',
  inkLo:    '#7A7570',
  inkMute:  '#A8A39B',
  line:     '#E2DBC9',
  tealDeep: '#006A65',
  red:      '#C8102E',
}

interface Props {
  campIds: string[]
  camps: CampWithRelations[]
  onClose: () => void
}

export default function PendingCampDecisionsModal({ campIds, camps, onClose }: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Session-local "skip for now" IDs (not persisted)
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set())
  // Track in-flight decline inputs
  const [declineInputId, setDeclineInputId] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  // Track busy state per camp
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const today = new Date().toISOString().split('T')[0]

  // Filter to only pending camps, sorted by start_date ascending
  // Live-filters: if realtime updates change finnStatus, the camp
  // disappears from the list automatically
  const pendingCamps = useMemo(() => {
    const matched = camps.filter(c => {
      if (!campIds.includes(c.camp.id)) return false
      if (skippedIds.has(c.camp.id)) return false
      // Must still be pending (interested or no status)
      if (c.finnStatus && c.finnStatus.status !== 'interested') return false
      return true
    })
    return matched.sort((a, b) => a.camp.start_date.localeCompare(b.camp.start_date))
  }, [campIds, camps, skippedIds])

  function daysUntil(dateStr: string): number {
    const target = new Date(dateStr + 'T12:00:00Z')
    const now = new Date(today + 'T12:00:00Z')
    return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }

  function formatDateRange(start: string, end: string): string {
    const s = new Date(start + 'T12:00:00Z')
    const e = new Date(end + 'T12:00:00Z')
    const sMonth = s.toLocaleDateString('en-US', { month: 'short' })
    const eMonth = e.toLocaleDateString('en-US', { month: 'short' })
    if (start === end) {
      return `${sMonth} ${s.getUTCDate()}`
    }
    if (sMonth === eMonth) {
      return `${sMonth} ${s.getUTCDate()}-${e.getUTCDate()}`
    }
    return `${sMonth} ${s.getUTCDate()} - ${eMonth} ${e.getUTCDate()}`
  }

  async function handleRegister(campId: string) {
    setBusy(prev => new Set(prev).add(campId))
    await updateFinnStatus(supabase, campId, 'registered')
    setBusy(prev => { const n = new Set(prev); n.delete(campId); return n })
  }

  async function handleDecline(campId: string) {
    if (declineInputId !== campId) {
      // Show the inline input
      setDeclineInputId(campId)
      setDeclineReason('')
      return
    }
    // Submit the decline
    setBusy(prev => new Set(prev).add(campId))
    await updateFinnStatus(supabase, campId, 'declined', {
      declined_reason: declineReason.trim() || undefined,
    })
    setDeclineInputId(null)
    setDeclineReason('')
    setBusy(prev => { const n = new Set(prev); n.delete(campId); return n })
  }

  function handleSkip(campId: string) {
    setSkippedIds(prev => new Set(prev).add(campId))
    if (declineInputId === campId) {
      setDeclineInputId(null)
      setDeclineReason('')
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1050,
      }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 480, maxWidth: 'calc(100vw - 32px)', maxHeight: '80vh',
        background: '#fff', borderRadius: 14,
        boxShadow: '0 20px 48px rgba(0,0,0,0.18)', zIndex: 1051,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: `1px solid ${LV.line}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: LV.ink }}>
            {pendingCamps.length} camp{pendingCamps.length !== 1 ? 's' : ''} awaiting decision
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 20, color: LV.inkLo,
            cursor: 'pointer', lineHeight: 1, padding: '0 4px',
          }}>&times;</button>
        </div>

        {/* Camp list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {pendingCamps.length === 0 && (
            <div style={{
              padding: '32px 24px', textAlign: 'center',
              color: LV.inkMute, fontSize: 13,
            }}>
              All camps decided or skipped
            </div>
          )}
          {pendingCamps.map(c => {
            const days = daysUntil(c.camp.start_date)
            const isBusy = busy.has(c.camp.id)
            const showDeclineInput = declineInputId === c.camp.id

            return (
              <div key={c.camp.id} style={{
                padding: '14px 24px',
                borderBottom: `1px solid ${LV.line}`,
                opacity: isBusy ? 0.5 : 1,
                transition: 'opacity 0.15s',
              }}>
                {/* Clickable camp info → navigates to /camps/[id] */}
                <div
                  onClick={() => { onClose(); router.push(`/camps/${c.camp.id}`) }}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: LV.ink }}>
                      {c.camp.name}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: LV.inkMute,
                    }}>
                      {c.hostSchool.short_name || c.hostSchool.name}
                    </span>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    marginTop: 4, fontSize: 12, color: LV.inkLo,
                  }}>
                    <span>{formatDateRange(c.camp.start_date, c.camp.end_date || c.camp.start_date)}</span>
                    <span style={{
                      fontWeight: 600,
                      color: days <= 7 ? LV.red : days <= 14 ? LV.inkLo : LV.inkMute,
                    }}>
                      in {days} day{days !== 1 ? 's' : ''}
                    </span>
                    {c.camp.registration_deadline && (
                      <span style={{ color: LV.inkMute }}>
                        Register by {new Date(c.camp.registration_deadline + 'T12:00:00Z')
                          .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  marginTop: 10, flexWrap: 'wrap',
                }}>
                  <button
                    onClick={() => handleRegister(c.camp.id)}
                    disabled={isBusy}
                    style={{
                      padding: '5px 14px', fontSize: 11, fontWeight: 700,
                      background: LV.tealDeep, color: '#fff', border: 'none',
                      borderRadius: 999, cursor: isBusy ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >Register</button>
                  <button
                    onClick={() => handleDecline(c.camp.id)}
                    disabled={isBusy}
                    style={{
                      padding: '5px 14px', fontSize: 11, fontWeight: 700,
                      background: showDeclineInput ? LV.red : 'none',
                      color: showDeclineInput ? '#fff' : LV.inkLo,
                      border: showDeclineInput ? 'none' : `1px solid ${LV.line}`,
                      borderRadius: 999, cursor: isBusy ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >{showDeclineInput ? 'Confirm decline' : 'Decline'}</button>
                  <button
                    onClick={() => handleSkip(c.camp.id)}
                    disabled={isBusy}
                    style={{
                      padding: '5px 14px', fontSize: 11, fontWeight: 700,
                      background: 'none', color: LV.inkMute, border: 'none',
                      cursor: isBusy ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >Skip for now</button>
                  <button
                    onClick={() => { onClose(); router.push(`/camps/${c.camp.id}`) }}
                    style={{
                      padding: '5px 14px', fontSize: 11, fontWeight: 600,
                      background: 'none', color: LV.tealDeep, border: 'none',
                      cursor: 'pointer', fontFamily: 'inherit',
                      marginLeft: 'auto',
                    }}
                  >Open camp</button>
                </div>

                {/* Inline decline reason input */}
                {showDeclineInput && (
                  <div style={{ marginTop: 8 }}>
                    <input
                      type="text"
                      placeholder="Reason (optional)"
                      value={declineReason}
                      onChange={e => setDeclineReason(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleDecline(c.camp.id) }}
                      autoFocus
                      style={{
                        width: '100%', padding: '6px 10px', fontSize: 12,
                        border: `1px solid ${LV.line}`, borderRadius: 6,
                        fontFamily: 'inherit', outline: 'none',
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

'use client'

import { useState } from 'react'
import { useCamps } from '@/hooks/useRealtimeData'
import type { School } from '@/lib/types'

const LV = {
  paper:    '#F6F1E8',
  ink:      '#0E0E0E',
  inkMid:   '#4A4A4A',
  inkLo:    '#7A7570',
  inkMute:  '#A8A39B',
  line:     '#E2DBC9',
  red:      '#C8102E',
  tealDeep: '#006A65',
}

interface Props {
  schools: School[]
  onClose: () => void
  onCreated: (campId: string) => void
  prefilledHostSchoolId?: string
}

export default function AddCampModal({ schools, onClose, onCreated, prefilledHostSchoolId }: Props) {
  const { createCamp } = useCamps()

  const [hostSchoolId, setHostSchoolId] = useState(prefilledHostSchoolId ?? '')
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [location, setLocation] = useState('')
  const [registrationUrl, setRegistrationUrl] = useState('')
  const [registrationDeadline, setRegistrationDeadline] = useState('')
  const [cost, setCost] = useState('')
  const [notes, setNotes] = useState('')
  const [schoolSearch, setSchoolSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeSchools = schools.filter(s => s.status !== 'Inactive' && s.category !== 'Nope')
  const filteredSchools = schoolSearch.length > 0
    ? activeSchools.filter(s =>
        (s.short_name || s.name).toLowerCase().includes(schoolSearch.toLowerCase())
      )
    : activeSchools

  const selectedSchool = schools.find(s => s.id === hostSchoolId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!hostSchoolId || !name || !startDate || !endDate) return

    setSaving(true)
    setError(null)

    const result = await createCamp({
      host_school_id: hostSchoolId,
      name,
      start_date: startDate,
      end_date: endDate,
      location: location || null,
      registration_url: registrationUrl || null,
      registration_deadline: registrationDeadline || null,
      cost: cost || null,
      notes: notes || null,
    })

    setSaving(false)

    if (result.error) {
      setError(result.error)
    } else if (result.id) {
      onCreated(result.id)
    } else {
      onClose()
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px',
    border: `1px solid ${LV.line}`, borderRadius: 8,
    fontSize: 13, fontFamily: 'inherit', color: LV.ink,
    background: '#fff',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: LV.inkLo,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    marginBottom: 4, display: 'block',
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1050,
      }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(480px, 90vw)', maxHeight: '85vh',
        background: '#fff', borderRadius: 14,
        boxShadow: '0 20px 48px rgba(0,0,0,0.18)', zIndex: 1051,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: `1px solid ${LV.line}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: LV.ink, fontStyle: 'italic' }}>
            Add camp.
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 20, color: LV.inkLo,
            cursor: 'pointer', lineHeight: 1, padding: 4,
          }}>&times;</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{
          flex: 1, overflowY: 'auto', padding: '20px 24px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {/* Host school */}
          <div>
            <label style={labelStyle}>Host school *</label>
            {selectedSchool ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', border: `1px solid ${LV.line}`, borderRadius: 8,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: LV.ink, flex: 1 }}>
                  {selectedSchool.short_name || selectedSchool.name}
                </span>
                <button
                  type="button"
                  onClick={() => { setHostSchoolId(''); setSchoolSearch('') }}
                  style={{
                    background: 'none', border: 'none', fontSize: 14,
                    color: LV.inkMute, cursor: 'pointer',
                  }}
                >&times;</button>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  placeholder="Search schools..."
                  value={schoolSearch}
                  onChange={e => setSchoolSearch(e.target.value)}
                  style={fieldStyle}
                  autoFocus
                />
                {schoolSearch.length > 0 && (
                  <div style={{
                    maxHeight: 160, overflowY: 'auto',
                    border: `1px solid ${LV.line}`, borderRadius: 8,
                    marginTop: 4, background: '#fff',
                  }}>
                    {filteredSchools.slice(0, 10).map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { setHostSchoolId(s.id); setSchoolSearch('') }}
                        style={{
                          display: 'block', width: '100%', padding: '8px 12px',
                          background: 'none', border: 'none', textAlign: 'left',
                          cursor: 'pointer', fontFamily: 'inherit',
                          fontSize: 13, color: LV.ink,
                          borderBottom: `1px solid ${LV.line}`,
                        }}
                      >{s.short_name || s.name}</button>
                    ))}
                    {filteredSchools.length === 0 && (
                      <div style={{ padding: '8px 12px', fontSize: 12, color: LV.inkMute }}>
                        No matching schools
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label style={labelStyle}>Camp name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Cal Poly Men's Soccer ID Camp"
              style={fieldStyle}
              required
            />
          </div>

          {/* Date range */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Start date *</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={fieldStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>End date *</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={fieldStyle}
                required
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label style={labelStyle}>Location</label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. San Luis Obispo, CA"
              style={fieldStyle}
            />
          </div>

          {/* Registration URL */}
          <div>
            <label style={labelStyle}>Registration URL</label>
            <input
              type="url"
              value={registrationUrl}
              onChange={e => setRegistrationUrl(e.target.value)}
              placeholder="https://..."
              style={fieldStyle}
            />
          </div>

          {/* Registration deadline + Cost */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Registration deadline</label>
              <input
                type="date"
                value={registrationDeadline}
                onChange={e => setRegistrationDeadline(e.target.value)}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Cost</label>
              <input
                type="text"
                value={cost}
                onChange={e => setCost(e.target.value)}
                placeholder="e.g. $150"
                style={fieldStyle}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              style={{ ...fieldStyle, resize: 'vertical' }}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{ fontSize: 12, color: LV.red, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px', background: 'none',
                border: `1px solid ${LV.line}`, borderRadius: 999,
                fontSize: 12, fontWeight: 600, color: LV.inkMid,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Cancel</button>
            <button
              type="submit"
              disabled={saving || !hostSchoolId || !name || !startDate || !endDate}
              style={{
                padding: '8px 18px', background: LV.red, color: '#fff',
                border: 'none', borderRadius: 999,
                fontSize: 12, fontWeight: 800, cursor: 'pointer',
                fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
              }}
            >{saving ? 'Creating...' : 'Create camp'}</button>
          </div>
        </form>
      </div>
    </>
  )
}

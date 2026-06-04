'use client'

import { useState, useRef } from 'react'
import type { Coach } from '@/lib/types'

const SD = {
  ink: '#0E0E0E', inkMid: '#4A4A4A', inkLo: '#7A7570',
  inkMute: '#A8A39B', line: '#E2DBC9', white: '#fff',
}

interface Props {
  schoolId: string
  coaches: Coach[]
  onClose: (uploaded: boolean) => void
}

export default function UploadPrepDocModal({ schoolId, coaches, onClose }: Props) {
  const activeCoaches = coaches.filter(c => c.is_active)
  const defaultCoach = activeCoaches.find(c => c.is_primary)
    ?? activeCoaches.find(c => c.role === 'Head Coach')
    ?? activeCoaches[0]

  const [selectedCoachId, setSelectedCoachId] = useState(defaultCoach?.id ?? '')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const selectedCoach = activeCoaches.find(c => c.id === selectedCoachId)

  async function handleSubmit() {
    if (!file || !selectedCoachId || !selectedCoach || !date) return
    setUploading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('schoolId', schoolId)
      formData.append('coachId', selectedCoachId)
      formData.append('coachName', selectedCoach.name)
      formData.append('date', date)
      if (notes.trim()) formData.append('notes', notes.trim())

      const res = await fetch('/api/call-prep-docs/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(data.error ?? 'Upload failed')
      }

      onClose(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setUploading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: SD.white, borderRadius: 12, width: '100%', maxWidth: 440, boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${SD.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: SD.ink }}>Upload prep doc</h3>
          <button onClick={() => onClose(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: SD.inkMute, padding: 4, lineHeight: 1 }}>&times;</button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* File picker */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: SD.inkMid, display: 'block', marginBottom: 6 }}>
              File
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".docx,.pdf"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) setFile(f)
              }}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 6,
                border: `1.5px dashed ${SD.line}`, background: 'transparent',
                fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
                color: file ? SD.ink : SD.inkMute, textAlign: 'left',
              }}
            >
              {file ? file.name : 'Choose .docx or .pdf file...'}
            </button>
          </div>

          {/* Coach dropdown */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: SD.inkMid, display: 'block', marginBottom: 6 }}>
              Coach
            </label>
            <select
              value={selectedCoachId}
              onChange={e => setSelectedCoachId(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 6,
                border: `1px solid ${SD.line}`, fontSize: 13, fontFamily: 'inherit',
                background: SD.white, color: SD.ink,
              }}
            >
              {activeCoaches.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.role ?? 'Unknown role'}
                </option>
              ))}
            </select>
          </div>

          {/* Date picker */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: SD.inkMid, display: 'block', marginBottom: 6 }}>
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 6,
                border: `1px solid ${SD.line}`, fontSize: 13, fontFamily: 'inherit',
                color: SD.ink,
              }}
            />
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: SD.inkMid, display: 'block', marginBottom: 6 }}>
              Notes <span style={{ fontWeight: 400, color: SD.inkMute }}>(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g., Edited version with updated stats"
              rows={2}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 6,
                border: `1px solid ${SD.line}`, fontSize: 13, fontFamily: 'inherit',
                resize: 'vertical', color: SD.ink,
              }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', borderRadius: 6, padding: '8px 12px', border: '1px solid #fecaca' }}>
              {error}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              onClick={() => onClose(false)}
              style={{
                padding: '8px 16px', borderRadius: 6,
                border: `1px solid ${SD.line}`, background: SD.white,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', color: SD.inkMid,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!file || !selectedCoachId || !date || uploading}
              style={{
                padding: '8px 16px', borderRadius: 6, border: 'none',
                background: (!file || uploading) ? SD.inkMute : SD.ink,
                fontSize: 13, fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', color: SD.white,
              }}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

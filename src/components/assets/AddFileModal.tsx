'use client'

import { useState, useRef } from 'react'
import type { AssetType } from '@/lib/types'

const LV = {
  paper: '#F6F1E8',
  ink: '#0E0E0E',
  inkMid: '#4A4A4A',
  inkLo: '#7A7570',
  line: '#E2DBC9',
  inputBorder: '#D3CAB3',
  tealDeep: '#006A65',
  tealSoft: '#D7F0ED',
  red: '#C8102E',
}

const FILE_TYPES: { value: AssetType; label: string }[] = [
  { value: 'resume', label: 'Resume' },
  { value: 'transcript', label: 'Transcript' },
  { value: 'other', label: 'Other' },
]

const ACCEPTED = '.pdf,.doc,.docx'
const MAX_MB = 10

interface Props {
  onClose: () => void
  onUploaded: () => void
}

export default function AddFileModal({ onClose, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState<AssetType>('resume')
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draggingOver, setDraggingOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(f: File | null) {
    if (!f) return
    if (f.size > MAX_MB * 1024 * 1024) { setError(`File exceeds ${MAX_MB} MB.`); return }
    setError(null)
    setFile(f)
    if (!name) setName(f.name.replace(/\.[^/.]+$/, ''))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDraggingOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFileChange(f)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !name.trim()) return
    setUploading(true)
    setError(null)

    const fd = new FormData()
    fd.append('file', file)
    fd.append('name', name.trim())
    fd.append('type', type)
    fd.append('description', description.trim())

    const res = await fetch('/api/assets/upload', { method: 'POST', body: fd })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Upload failed')
      setUploading(false)
      return
    }

    onUploaded()
    onClose()
  }

  const disabled = !file || !name.trim() || uploading

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500,
        boxShadow: '0 25px 60px rgba(0,0,0,0.18)', overflow: 'hidden',
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}>
        {/* Header */}
        <div style={{ padding: '22px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 700, fontStyle: 'italic', letterSpacing: '-0.03em', color: LV.ink }}>
            Add file.
          </h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: LV.inkLo, fontSize: 22, lineHeight: 1, padding: 2,
          }}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '18px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Drop zone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDraggingOver(true) }}
            onDragLeave={() => setDraggingOver(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${draggingOver ? LV.tealDeep : file ? '#2D6A4F' : LV.line}`,
              borderRadius: 10, padding: '22px 16px', textAlign: 'center', cursor: 'pointer',
              background: draggingOver ? LV.tealSoft : file ? '#D7EFE0' : LV.paper,
              transition: 'all 0.15s',
            }}
          >
            <input ref={inputRef} type="file" accept={ACCEPTED} style={{ display: 'none' }}
              onChange={e => handleFileChange(e.target.files?.[0] ?? null)} />
            {file ? (
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#2D6A4F' }}>{file.name}</div>
                <div style={{ fontSize: 11, color: LV.inkLo, marginTop: 4 }}>
                  {(file.size / 1024).toFixed(0)} KB — click to change
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: LV.inkMid, fontWeight: 600 }}>
                  Drop file here or click to browse
                </div>
                <div style={{ fontSize: 11, color: LV.inkLo, marginTop: 4 }}>
                  PDF, Word — max {MAX_MB} MB
                </div>
              </div>
            )}
          </div>

          <Field label="Display Name" required>
            <input value={name} onChange={e => setName(e.target.value)} required
              style={fieldStyle(LV)} placeholder="e.g. Soccer Resume 2026" />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Type" required>
              <select value={type} onChange={e => setType(e.target.value as AssetType)} style={fieldStyle(LV)}>
                {FILE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Description">
              <input value={description} onChange={e => setDescription(e.target.value)}
                style={fieldStyle(LV)} placeholder="Optional notes" />
            </Field>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: LV.red, background: '#FAD9D9', padding: '8px 12px', borderRadius: 8 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={cancelBtn(LV)}>Cancel</button>
            <button type="submit" disabled={disabled} style={{ ...primaryBtn(LV), opacity: disabled ? 0.45 : 1 }}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontSize: 10, fontWeight: 800, color: '#7A7570',
        textTransform: 'uppercase', letterSpacing: '0.1em',
      }}>
        {label}{required && ' *'}
      </span>
      {children}
    </label>
  )
}

function fieldStyle(LV: Record<string, string>): React.CSSProperties {
  return {
    width: '100%', padding: '8px 11px',
    border: `1px solid ${LV.inputBorder}`,
    borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box',
    background: LV.paper, color: LV.ink,
  }
}

function cancelBtn(LV: Record<string, string>): React.CSSProperties {
  return {
    padding: '8px 16px', borderRadius: 999, border: 'none',
    cursor: 'pointer', fontSize: 13, fontWeight: 700,
    fontFamily: 'inherit', background: LV.paper, color: LV.inkMid,
    letterSpacing: '-0.01em',
  }
}

function primaryBtn(LV: Record<string, string>): React.CSSProperties {
  return {
    padding: '8px 18px', borderRadius: 999, border: 'none',
    cursor: 'pointer', fontSize: 13, fontWeight: 700,
    fontFamily: 'inherit', background: LV.red, color: '#fff',
    letterSpacing: '-0.01em',
  }
}

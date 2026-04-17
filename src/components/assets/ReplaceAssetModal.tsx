'use client'

import { useState, useRef } from 'react'
import type { Asset } from '@/lib/types'

const ACCEPTED = '.pdf,.doc,.docx'
const MAX_MB = 10

interface Props {
  asset: Asset                        // the current asset being replaced
  userId: string
  onClose: () => void
  onReplaced: (newAsset: Asset) => void
}

export default function ReplaceAssetModal({ asset, onClose, onReplaced }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState(asset.name)
  const [description, setDescription] = useState(asset.description ?? '')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draggingOver, setDraggingOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(f: File | null) {
    if (!f) return
    if (f.size > MAX_MB * 1024 * 1024) { setError(`File exceeds ${MAX_MB} MB.`); return }
    setError(null)
    setFile(f)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDraggingOver(false)
    handleFileChange(e.dataTransfer.files[0] ?? null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !name.trim()) return
    setUploading(true)
    setError(null)

    // Upload new version
    const fd = new FormData()
    fd.append('file', file)
    fd.append('name', name.trim())
    fd.append('type', asset.type)
    fd.append('description', description.trim())

    const res = await fetch('/api/assets/upload', { method: 'POST', body: fd })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Upload failed')
      setUploading(false)
      return
    }

    const newAsset: Asset = { ...json.asset, version: asset.version + 1 }

    // Set correct version in DB
    await fetch(`/api/assets/${json.asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: newAsset.version }),
    })

    onReplaced(newAsset)
    onClose()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 500, boxShadow: '0 25px 50px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Replace Asset</h3>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              Replacing: {asset.name} (v{asset.version}) → v{asset.version + 1}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Drop zone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDraggingOver(true) }}
            onDragLeave={() => setDraggingOver(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${draggingOver ? '#6366f1' : file ? '#10b981' : '#e2e8f0'}`,
              borderRadius: 8, padding: '24px 16px', textAlign: 'center', cursor: 'pointer',
              background: draggingOver ? '#f5f3ff' : file ? '#f0fdf4' : '#fafbfc',
            }}
          >
            <input ref={inputRef} type="file" accept={ACCEPTED} style={{ display: 'none' }} onChange={e => handleFileChange(e.target.files?.[0] ?? null)} />
            {file ? (
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#059669' }}>{file.name}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{(file.size / 1024).toFixed(0)} KB — click to change</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Drop new file here or click to browse</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>PDF, Word — max {MAX_MB} MB</div>
              </div>
            )}
          </div>

          <Field label="Display Name" required>
            <input value={name} onChange={e => setName(e.target.value)} required style={fieldStyle} />
          </Field>

          <Field label="Description">
            <input value={description} onChange={e => setDescription(e.target.value)} style={fieldStyle} placeholder="What changed in this version?" />
          </Field>

          <div style={{ fontSize: 11, color: '#64748b', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px' }}>
            The current version will be archived. Old file is kept for version history.
          </div>

          {error && <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
            <button type="submit" disabled={!file || !name.trim() || uploading} style={{ ...submitBtn, opacity: (!file || !name.trim() || uploading) ? 0.5 : 1 }}>
              {uploading ? 'Uploading…' : 'Upload & Replace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}{required && ' *'}</span>
      {children}
    </label>
  )
}

const fieldStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }
const cancelBtn: React.CSSProperties = { padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#f1f5f9', color: '#475569' }
const submitBtn: React.CSSProperties = { padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#0f172a', color: '#fff' }

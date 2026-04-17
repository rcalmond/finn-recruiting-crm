'use client'

import { useState } from 'react'
import type { AssetType, Asset } from '@/lib/types'

const LINK_TYPES: { value: AssetType; label: string }[] = [
  { value: 'highlight_reel', label: 'Highlight Reel' },
  { value: 'game_film', label: 'Game Film' },
  { value: 'sports_recruits', label: 'Sports Recruits' },
  { value: 'link', label: 'General Link' },
]

interface Props {
  userId: string
  existing?: Asset   // if set, we're editing
  onClose: () => void
  onSave: (data: { name: string; type: AssetType; url: string; description: string }) => Promise<void>
}

export default function AddLinkModal({ existing, onClose, onSave }: Props) {
  const [name, setName] = useState(existing?.name ?? '')
  const [type, setType] = useState<AssetType>(existing?.type ?? 'highlight_reel')
  const [url, setUrl] = useState(existing?.url ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave({ name: name.trim(), type, url: url.trim(), description: description.trim() })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 460, boxShadow: '0 25px 50px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{existing ? 'Edit Link' : 'Add Link'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Display Name" required>
            <input value={name} onChange={e => setName(e.target.value)} required style={fieldStyle} placeholder="e.g. Highlight Reel 2026" autoFocus />
          </Field>

          <Field label="Type" required>
            <select value={type} onChange={e => setType(e.target.value as AssetType)} style={fieldStyle}>
              {LINK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>

          <Field label="URL" required>
            <input type="url" value={url} onChange={e => setUrl(e.target.value)} required style={fieldStyle} placeholder="https://" />
          </Field>

          <Field label="Description">
            <input value={description} onChange={e => setDescription(e.target.value)} style={fieldStyle} placeholder="Optional notes" />
          </Field>

          {error && <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
            <button type="submit" disabled={!name.trim() || !url.trim() || saving} style={{ ...submitBtn, opacity: (!name.trim() || !url.trim() || saving) ? 0.5 : 1 }}>
              {saving ? 'Saving…' : existing ? 'Save' : 'Add Link'}
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

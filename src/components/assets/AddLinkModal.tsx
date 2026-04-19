'use client'

import { useState } from 'react'
import type { AssetType, Asset } from '@/lib/types'

const LV = {
  paper: '#F6F1E8',
  ink: '#0E0E0E',
  inkMid: '#4A4A4A',
  inkLo: '#7A7570',
  inputBorder: '#D3CAB3',
  red: '#C8102E',
}

const LINK_TYPES: { value: AssetType; label: string }[] = [
  { value: 'highlight_reel', label: 'Highlight Reel' },
  { value: 'game_film', label: 'Game Film' },
  { value: 'sports_recruits', label: 'Sports Recruits' },
  { value: 'link', label: 'General Link' },
]

interface Props {
  existing?: Asset
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

  const isEdit = !!existing

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

  const disabled = !name.trim() || !url.trim() || saving

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460,
        boxShadow: '0 25px 60px rgba(0,0,0,0.18)', overflow: 'hidden',
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}>
        {/* Header */}
        <div style={{ padding: '22px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 700, fontStyle: 'italic', letterSpacing: '-0.03em', color: LV.ink }}>
            {isEdit ? 'Edit link.' : 'Add link.'}
          </h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: LV.inkLo, fontSize: 22, lineHeight: 1, padding: 2,
          }}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '18px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Display Name" required>
            <input value={name} onChange={e => setName(e.target.value)} required
              style={fieldStyle(LV)} placeholder="e.g. Highlight Reel 2026" autoFocus />
          </Field>

          <Field label="Type" required>
            <select value={type} onChange={e => setType(e.target.value as AssetType)} style={fieldStyle(LV)}>
              {LINK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>

          <Field label="URL" required>
            <input type="url" value={url} onChange={e => setUrl(e.target.value)} required
              style={fieldStyle(LV)} placeholder="https://" />
          </Field>

          <Field label="Description">
            <input value={description} onChange={e => setDescription(e.target.value)}
              style={fieldStyle(LV)} placeholder="Optional notes" />
          </Field>

          {error && (
            <div style={{ fontSize: 12, color: LV.red, background: '#FAD9D9', padding: '8px 12px', borderRadius: 8 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={cancelBtn(LV)}>Cancel</button>
            <button type="submit" disabled={disabled} style={{ ...primaryBtn(LV), opacity: disabled ? 0.45 : 1 }}>
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Add Link'}
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

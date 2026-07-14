'use client'

import { useState } from 'react'
import type { Asset, AssetType } from '@/lib/types'

const LV = {
  paper: '#F6F1E8',
  ink: '#0E0E0E',
  inkMid: '#4A4A4A',
  inkLo: '#7A7570',
  inputBorder: '#D3CAB3',
  red: '#C8102E',
}

const FILE_TYPES: { value: AssetType; label: string }[] = [
  { value: 'resume', label: 'Resume' },
  { value: 'transcript', label: 'Transcript' },
  { value: 'test_scores', label: 'Test Scores' },
  { value: 'other', label: 'Other' },
]

const LINK_TYPES: { value: AssetType; label: string }[] = [
  { value: 'highlight_reel', label: 'Highlight Reel' },
  { value: 'game_film', label: 'Game Film' },
  { value: 'sports_recruits', label: 'Sports Recruits' },
  { value: 'link', label: 'General Link' },
]

// Types consumed by LLM pipelines — changing away from these removes them from AI context
const LLM_CONSUMED_TYPES: Set<string> = new Set([
  'resume', 'transcript', 'highlight_reel', 'game_film', 'sports_recruits',
])

interface Props {
  asset: Asset
  onClose: () => void
  onSave: (id: string, updates: { name: string; type: AssetType; description: string | null; url?: string }) => Promise<void>
}

export default function EditAssetModal({ asset, onClose, onSave }: Props) {
  const [name, setName] = useState(asset.name)
  const [type, setType] = useState<AssetType>(asset.type)
  const [description, setDescription] = useState(asset.description ?? '')
  const [url, setUrl] = useState(asset.url ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isFile = asset.category === 'file'
  const isLink = asset.category === 'link'
  const typeOptions = isFile ? FILE_TYPES : LINK_TYPES

  // Retype warnings
  const retypedAwayFromLlm = LLM_CONSUMED_TYPES.has(asset.type) && !LLM_CONSUMED_TYPES.has(type) && type !== asset.type
  const retypedToResume = type === 'resume' && asset.type !== 'resume'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    if (isLink && !url.trim()) return
    setSaving(true)
    setError(null)
    try {
      const updates: { name: string; type: AssetType; description: string | null; url?: string } = {
        name: name.trim(),
        type,
        description: description.trim() || null,
      }
      if (isLink) updates.url = url.trim()
      await onSave(asset.id, updates)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      setSaving(false)
    }
  }

  const disabled = !name.trim() || (isLink && !url.trim()) || saving

  return (
    <div style={{
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
            Edit {isFile ? 'file' : 'link'}.
          </h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: LV.inkLo, fontSize: 22, lineHeight: 1, padding: 2,
          }}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '18px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Display Name" required>
            <input value={name} onChange={e => setName(e.target.value)} required
              style={fieldStyle()} placeholder="e.g. Soccer Resume 2026" autoFocus />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Type" required>
              <select value={type} onChange={e => setType(e.target.value as AssetType)} style={fieldStyle()}>
                {typeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Description">
              <input value={description} onChange={e => setDescription(e.target.value)}
                style={fieldStyle()} placeholder="Optional notes" />
            </Field>
          </div>

          {isLink && (
            <Field label="URL" required>
              <input type="url" value={url} onChange={e => setUrl(e.target.value)} required
                style={fieldStyle()} placeholder="https://" />
            </Field>
          )}

          {/* Retype warnings */}
          {retypedAwayFromLlm && (
            <div style={{
              fontSize: 12, color: '#92400E', background: '#FEF3C7',
              padding: '8px 12px', borderRadius: 8, lineHeight: 1.5,
            }}>
              This type is used by email generation and the player profile. Retyping it may remove it from AI context.
            </div>
          )}
          {retypedToResume && (
            <div style={{
              fontSize: 12, color: LV.inkMid, background: LV.paper,
              padding: '8px 12px', borderRadius: 8, lineHeight: 1.5,
            }}>
              Use Re-parse after saving to update the player profile.
            </div>
          )}

          {error && (
            <div style={{ fontSize: 12, color: LV.red, background: '#FAD9D9', padding: '8px 12px', borderRadius: 8 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={cancelBtn()}>Cancel</button>
            <button type="submit" disabled={disabled} style={{ ...primaryBtn(), opacity: disabled ? 0.45 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
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

function fieldStyle(): React.CSSProperties {
  return {
    width: '100%', padding: '8px 11px',
    border: `1px solid ${LV.inputBorder}`,
    borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box',
    background: LV.paper, color: LV.ink,
  }
}

function cancelBtn(): React.CSSProperties {
  return {
    padding: '8px 16px', borderRadius: 999, border: 'none',
    cursor: 'pointer', fontSize: 13, fontWeight: 700,
    fontFamily: 'inherit', background: LV.paper, color: LV.inkMid,
    letterSpacing: '-0.01em',
  }
}

function primaryBtn(): React.CSSProperties {
  return {
    padding: '8px 18px', borderRadius: 999, border: 'none',
    cursor: 'pointer', fontSize: 13, fontWeight: 700,
    fontFamily: 'inherit', background: LV.red, color: '#fff',
    letterSpacing: '-0.01em',
  }
}

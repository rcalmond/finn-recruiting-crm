'use client'

import type { Asset } from '@/lib/types'
import { useState } from 'react'

const TYPE_LABELS: Record<string, string> = {
  resume: 'Resume',
  transcript: 'Transcript',
  highlight_reel: 'Highlight Reel',
  game_film: 'Game Film',
  sports_recruits: 'Sports Recruits',
  link: 'Link',
  other: 'Other',
}

const TYPE_COLORS: Record<string, string> = {
  resume: '#2563eb',
  transcript: '#059669',
  highlight_reel: '#dc2626',
  game_film: '#7c3aed',
  sports_recruits: '#0369a1',
  link: '#64748b',
  other: '#94a3b8',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Props {
  asset: Asset
  onPreview: (asset: Asset) => void
  onReplace: (asset: Asset) => void
  onEdit: (asset: Asset) => void
  onDelete: (asset: Asset) => void
}

export default function AssetCard({ asset, onPreview, onReplace, onEdit, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const color = TYPE_COLORS[asset.type] ?? '#94a3b8'
  const label = TYPE_LABELS[asset.type] ?? asset.type

  return (
    <div style={{
      background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb',
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14,
    }}>
      {/* Type badge */}
      <span style={{
        padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
        background: color + '14', color, flexShrink: 0, whiteSpace: 'nowrap',
      }}>
        {label}
      </span>

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {asset.name}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {asset.category === 'file' && asset.file_name && (
            <span>{asset.file_name}</span>
          )}
          {asset.category === 'file' && asset.file_size && (
            <span>{formatBytes(asset.file_size)}</span>
          )}
          {asset.category === 'link' && asset.url && (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300 }}>{asset.url}</span>
          )}
          {asset.version > 1 && (
            <span style={{ color: '#6366f1', fontWeight: 600 }}>v{asset.version}</span>
          )}
          {asset.description && (
            <span style={{ fontStyle: 'italic' }}>{asset.description}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        {!confirmDelete ? (
          <>
            {asset.category === 'file' && (
              <button onClick={() => onPreview(asset)} style={btnStyle('#eff6ff', '#2563eb')}>Preview</button>
            )}
            {asset.category === 'link' && asset.url && (
              <a href={asset.url} target="_blank" rel="noopener noreferrer" style={{ ...btnStyle('#eff6ff', '#2563eb'), textDecoration: 'none' }}>Open</a>
            )}
            <button onClick={() => onEdit(asset)} style={btnStyle('#f1f5f9', '#475569')}>Edit</button>
            <button onClick={() => onReplace(asset)} style={btnStyle('#f1f5f9', '#475569')}>Replace</button>
            <button onClick={() => setConfirmDelete(true)} style={btnStyle('#fef2f2', '#dc2626')}>✕</button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 11, color: '#dc2626' }}>Delete?</span>
            <button onClick={() => onDelete(asset)} style={btnStyle('#dc2626', '#fff')}>Yes</button>
            <button onClick={() => setConfirmDelete(false)} style={btnStyle('#f1f5f9', '#475569')}>No</button>
          </>
        )}
      </div>
    </div>
  )
}

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    padding: '4px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
    fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', background: bg, color,
  }
}

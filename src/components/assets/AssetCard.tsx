'use client'

import type { Asset } from '@/lib/types'
import { useState } from 'react'

const LV = {
  ink: '#0E0E0E',
  inkMid: '#4A4A4A',
  inkLo: '#7A7570',
  inkMute: '#A8A39B',
  line: '#E2DBC9',
  paper: '#F6F1E8',
  tealDeep: '#006A65',
  tealSoft: '#D7F0ED',
  red: '#C8102E',
}

const TYPE_LABELS: Record<string, string> = {
  resume: 'Resume',
  transcript: 'Transcript',
  highlight_reel: 'Highlight Reel',
  game_film: 'Game Film',
  sports_recruits: 'Sports Recruits',
  link: 'Link',
  other: 'Other',
}

// Ink-adjacent hues — readable on paper, semantically distinct
const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  resume:          { bg: LV.tealSoft,  text: LV.tealDeep },
  transcript:      { bg: '#D7EFE0',    text: '#2D6A4F'   },
  highlight_reel:  { bg: '#FAD9D9',    text: LV.red      },
  game_film:       { bg: '#E9D9FA',    text: '#5B21B6'   },
  sports_recruits: { bg: '#D6EAF8',    text: '#1A5276'   },
  link:            { bg: LV.paper,     text: LV.inkLo    },
  other:           { bg: LV.paper,     text: LV.inkMute  },
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
  const colors = TYPE_COLORS[asset.type] ?? { bg: LV.paper, text: LV.inkMute }
  const label = TYPE_LABELS[asset.type] ?? asset.type

  return (
    <div style={{
      background: '#fff',
      borderRadius: 10,
      border: `1px solid ${LV.line}`,
      padding: '13px 16px',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      {/* Type badge */}
      <span style={{
        padding: '3px 9px', borderRadius: 999,
        fontSize: 10, fontWeight: 800,
        background: colors.bg, color: colors.text,
        flexShrink: 0, whiteSpace: 'nowrap',
        letterSpacing: '0.04em', textTransform: 'uppercase',
      }}>
        {label}
      </span>

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 650, fontSize: 13, color: LV.ink,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {asset.name}
        </div>
        <div style={{
          fontSize: 11, color: LV.inkLo, marginTop: 2,
          display: 'flex', gap: 8, flexWrap: 'wrap',
        }}>
          {asset.category === 'file' && asset.file_name && (
            <span>{asset.file_name}</span>
          )}
          {asset.category === 'file' && asset.file_size && (
            <span>{formatBytes(asset.file_size)}</span>
          )}
          {asset.category === 'link' && asset.url && (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300 }}>
              {asset.url}
            </span>
          )}
          {asset.version > 1 && (
            <span style={{ color: LV.tealDeep, fontWeight: 700 }}>v{asset.version}</span>
          )}
          {asset.description && (
            <span style={{ fontStyle: 'italic', color: LV.inkMute }}>{asset.description}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        {!confirmDelete ? (
          <>
            {asset.category === 'file' && (
              <button onClick={() => onPreview(asset)} style={btn(LV.tealSoft, LV.tealDeep)}>
                Preview
              </button>
            )}
            {asset.category === 'link' && asset.url && (
              <a href={asset.url} target="_blank" rel="noopener noreferrer"
                style={{ ...btn(LV.tealSoft, LV.tealDeep), textDecoration: 'none' }}>
                Open
              </a>
            )}
            {asset.category === 'link' && (
              <button onClick={() => onEdit(asset)} style={btn(LV.paper, LV.inkMid)}>Edit</button>
            )}
            <button onClick={() => onReplace(asset)} style={btn(LV.paper, LV.inkMid)}>Replace</button>
            <button onClick={() => setConfirmDelete(true)} style={btn('#FAD9D9', LV.red)}>✕</button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 11, color: LV.red, fontWeight: 600 }}>Delete?</span>
            <button onClick={() => onDelete(asset)} style={btn(LV.red, '#fff')}>Yes</button>
            <button onClick={() => setConfirmDelete(false)} style={btn(LV.paper, LV.inkMid)}>No</button>
          </>
        )}
      </div>
    </div>
  )
}

function btn(bg: string, color: string): React.CSSProperties {
  return {
    padding: '4px 10px', borderRadius: 6, border: 'none',
    cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
    fontFamily: 'inherit', background: bg, color,
    letterSpacing: '-0.01em',
  }
}

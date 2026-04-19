'use client'

import { useState } from 'react'
import type { Asset } from '@/lib/types'

const LV = {
  ink: '#0E0E0E',
  inkMid: '#4A4A4A',
  inkLo: '#7A7570',
  inkMute: '#A8A39B',
  line: '#E2DBC9',
  paper: '#F6F1E8',
  tealDeep: '#006A65',
  tealSoft: '#D7F0ED',
}

const TYPE_LABELS: Record<string, string> = {
  resume: 'Resume', transcript: 'Transcript', highlight_reel: 'Highlight Reel',
  game_film: 'Game Film', sports_recruits: 'Sports Recruits', link: 'Link', other: 'Other',
}

interface Props {
  archivedAssets: Asset[]
  onPreview: (asset: Asset) => void
}

export default function VersionHistoryDrawer({ archivedAssets, onPreview }: Props) {
  const [open, setOpen] = useState(false)

  if (archivedAssets.length === 0) return null

  const byType = archivedAssets.reduce<Record<string, Asset[]>>((acc, a) => {
    if (!acc[a.type]) acc[a.type] = []
    acc[a.type].push(a)
    return acc
  }, {})

  return (
    <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${LV.line}` }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', padding: 0,
        }}
      >
        <span style={{
          fontSize: 11, fontWeight: 800, color: LV.inkLo,
          textTransform: 'uppercase', letterSpacing: '0.1em',
        }}>
          Version History ({archivedAssets.length})
        </span>
        <span style={{
          fontSize: 11, color: LV.inkMute,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.15s', display: 'inline-block',
        }}>▾</span>
      </button>

      {open && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {Object.entries(byType).map(([type, items]) => (
            <div key={type}>
              <div style={{
                fontSize: 10, fontWeight: 800, color: LV.inkMute,
                textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7,
              }}>
                {TYPE_LABELS[type] ?? type}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {items
                  .sort((a, b) => b.version - a.version)
                  .map(a => (
                    <div key={a.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 13px',
                      background: '#fff', borderRadius: 8,
                      border: `1px solid ${LV.line}`,
                    }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, color: LV.inkMute,
                        flexShrink: 0, letterSpacing: '0.04em',
                      }}>
                        v{a.version}
                      </span>
                      <span style={{
                        flex: 1, fontSize: 12, color: LV.inkMid,
                        minWidth: 0, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {a.name}
                        {a.description && (
                          <span style={{ color: LV.inkMute, fontStyle: 'italic' }}> — {a.description}</span>
                        )}
                      </span>
                      <span style={{ fontSize: 11, color: LV.inkMute, flexShrink: 0 }}>
                        {new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      {a.category === 'file' && a.storage_path && (
                        <button onClick={() => onPreview(a)} style={{
                          padding: '3px 9px', borderRadius: 6, border: 'none',
                          cursor: 'pointer', fontSize: 11, fontWeight: 700,
                          fontFamily: 'inherit', background: LV.tealSoft, color: LV.tealDeep, flexShrink: 0,
                        }}>
                          Preview
                        </button>
                      )}
                      {a.category === 'link' && a.url && (
                        <a href={a.url} target="_blank" rel="noopener noreferrer" style={{
                          padding: '3px 9px', borderRadius: 6,
                          fontSize: 11, fontWeight: 700,
                          fontFamily: 'inherit', background: LV.tealSoft, color: LV.tealDeep,
                          textDecoration: 'none', flexShrink: 0,
                        }}>
                          Open
                        </a>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

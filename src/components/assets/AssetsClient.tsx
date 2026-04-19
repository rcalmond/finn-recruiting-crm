'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import type { Asset, AssetType } from '@/lib/types'
import { useAssets } from '@/hooks/useRealtimeData'
import AssetCard from './AssetCard'
import AddFileModal from './AddFileModal'
import AddLinkModal from './AddLinkModal'
import ReplaceAssetModal from './ReplaceAssetModal'
import VersionHistoryDrawer from './VersionHistoryDrawer'

const LV = {
  paper: '#F6F1E8',
  ink: '#0E0E0E',
  inkMid: '#4A4A4A',
  inkLo: '#7A7570',
  inkMute: '#A8A39B',
  line: '#E2DBC9',
  teal: '#00B2A9',
  tealDeep: '#006A65',
  tealSoft: '#D7F0ED',
}

type Modal =
  | { kind: 'add-file' }
  | { kind: 'add-link' }
  | { kind: 'edit-link'; asset: Asset }
  | { kind: 'replace'; asset: Asset }

export default function AssetsClient({ user }: { user: User }) {
  const { assets, loading, insertLink, updateAsset, archiveAsset, removeAsset, getSignedUrl } = useAssets()
  const [modal, setModal] = useState<Modal | null>(null)

  const current = assets.filter(a => a.is_current)
  const archived = assets.filter(a => !a.is_current)

  const currentFiles = current.filter(a => a.category === 'file')
  const currentLinks = current.filter(a => a.category === 'link')

  async function handlePreview(asset: Asset) {
    if (asset.category === 'link' && asset.url) { window.open(asset.url, '_blank'); return }
    if (!asset.storage_path) return
    const url = await getSignedUrl(asset.storage_path)
    if (url) window.open(url, '_blank')
  }

  async function handleDelete(asset: Asset) {
    await fetch(`/api/assets/${asset.id}`, { method: 'DELETE' })
    removeAsset(asset.id)
  }

  async function handleReplaced(oldAsset: Asset, newAsset: Asset) {
    await archiveAsset(oldAsset.id, newAsset.id)
    await updateAsset(newAsset.id, { version: oldAsset.version + 1 })
  }

  async function handleSaveLink(data: { name: string; type: AssetType; url: string; description: string }) {
    if (modal?.kind === 'edit-link') {
      await updateAsset(modal.asset.id, { name: data.name, type: data.type, url: data.url, description: data.description || null })
    } else {
      await insertLink({ ...data, userId: user.id })
    }
  }

  return (
    <div style={{
      fontFamily: "'Inter', -apple-system, sans-serif",
      background: LV.paper,
      minHeight: '100vh',
      color: LV.ink,
      padding: 'clamp(28px, 4vw, 48px) clamp(20px, 5vw, 56px)',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 'clamp(24px, 3vw, 36px)', maxWidth: 720 }}>
        <Link href="/library" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, fontWeight: 700, color: LV.inkLo,
          textDecoration: 'none', letterSpacing: '0.08em',
          textTransform: 'uppercase', marginBottom: 14,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5m5-6-6 6 6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Library
        </Link>

        <h1 style={{
          margin: '0 0 6px',
          fontSize: 'clamp(40px, 6vw, 64px)',
          fontWeight: 700, letterSpacing: 'clamp(-2px, -0.03em, -3px)',
          color: LV.ink, fontStyle: 'italic', lineHeight: 1,
        }}>
          Assets.
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: LV.inkLo }}>
          Finn Almond · Class of 2027 · Recruiting assets
        </p>
      </div>

      {loading && (
        <div style={{ padding: '60px 0', textAlign: 'center', color: LV.inkLo, fontSize: 14 }}>
          Loading…
        </div>
      )}

      {!loading && (
        <div style={{ maxWidth: 720 }}>
          {/* Files section */}
          <Section
            title="Files"
            count={currentFiles.length}
            action={
              <button onClick={() => setModal({ kind: 'add-file' })} style={addBtnStyle(LV)}>
                + Add File
              </button>
            }
          >
            {currentFiles.length === 0 ? (
              <Empty message="No files uploaded yet." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {currentFiles.map(a => (
                  <AssetCard
                    key={a.id}
                    asset={a}
                    onPreview={handlePreview}
                    onReplace={asset => setModal({ kind: 'replace', asset })}
                    onEdit={asset => asset.category === 'link' ? setModal({ kind: 'edit-link', asset }) : undefined}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* Links section */}
          <Section
            title="Links"
            count={currentLinks.length}
            action={
              <button onClick={() => setModal({ kind: 'add-link' })} style={addBtnStyle(LV)}>
                + Add Link
              </button>
            }
          >
            {currentLinks.length === 0 ? (
              <Empty message="No links added yet." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {currentLinks.map(a => (
                  <AssetCard
                    key={a.id}
                    asset={a}
                    onPreview={handlePreview}
                    onReplace={asset => setModal({ kind: 'replace', asset })}
                    onEdit={asset => setModal({ kind: 'edit-link', asset })}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* Version history */}
          <VersionHistoryDrawer archivedAssets={archived} onPreview={handlePreview} />
        </div>
      )}

      {/* Modals */}
      {modal?.kind === 'add-file' && (
        <AddFileModal onClose={() => setModal(null)} onUploaded={() => setModal(null)} />
      )}
      {(modal?.kind === 'add-link' || modal?.kind === 'edit-link') && (
        <AddLinkModal
          existing={modal.kind === 'edit-link' ? modal.asset : undefined}
          onClose={() => setModal(null)}
          onSave={handleSaveLink}
        />
      )}
      {modal?.kind === 'replace' && (
        <ReplaceAssetModal
          asset={modal.asset}
          userId={user.id}
          onClose={() => setModal(null)}
          onReplaced={newAsset => { handleReplaced(modal.asset, newAsset); setModal(null) }}
        />
      )}
    </div>
  )
}

function Section({ title, count, action, children }: {
  title: string; count: number; action: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12, paddingBottom: 10,
        borderBottom: '1px solid #E2DBC9',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.15em',
            textTransform: 'uppercase', color: '#7A7570',
          }}>{title}</span>
          <span style={{
            fontSize: 12, fontWeight: 700, color: '#A8A39B',
          }}>{count}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function Empty({ message }: { message: string }) {
  return (
    <div style={{
      padding: '24px 16px', textAlign: 'center',
      color: '#A8A39B', fontSize: 13,
      background: '#fff', borderRadius: 10,
      border: '1px dashed #E2DBC9',
    }}>
      {message}
    </div>
  )
}

function addBtnStyle(LV: Record<string, string>): React.CSSProperties {
  return {
    padding: '6px 14px', borderRadius: 999,
    border: `1px solid ${LV.line}`,
    background: '#fff',
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit', color: LV.inkMid,
    letterSpacing: '-0.01em',
  }
}

'use client'

import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Asset, AssetType } from '@/lib/types'
import { useAssets } from '@/hooks/useRealtimeData'
import AssetCard from './AssetCard'
import AddFileModal from './AddFileModal'
import AddLinkModal from './AddLinkModal'
import ReplaceAssetModal from './ReplaceAssetModal'
import VersionHistoryDrawer from './VersionHistoryDrawer'

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
    // Archive old, update new with correct version
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
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#fafbfc', minHeight: '100vh', color: '#0f172a' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ padding: '20px 20px 40px', maxWidth: 800, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Asset Library</h1>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#64748b' }}>
              Finn Almond · Class of 2027 · Recruiting assets
            </p>
          </div>
          <a href="/dashboard" style={{ fontSize: 12, color: '#64748b', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6 }}>
            ← Dashboard
          </a>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Loading…</div>}

        {!loading && (
          <>
            {/* Files section */}
            <Section
              title="Files"
              count={currentFiles.length}
              action={<button onClick={() => setModal({ kind: 'add-file' })} style={addBtnStyle}>+ Add File</button>}
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
              action={<button onClick={() => setModal({ kind: 'add-link' })} style={addBtnStyle}>+ Add Link</button>}
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
          </>
        )}
      </div>

      {/* Modals */}
      {modal?.kind === 'add-file' && (
        <AddFileModal
          onClose={() => setModal(null)}
          onUploaded={() => setModal(null)}
        />
      )}
      {(modal?.kind === 'add-link' || modal?.kind === 'edit-link') && (
        <AddLinkModal
          userId={user.id}
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

function Section({ title, count, action, children }: { title: string; count: number; action: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{title}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', borderRadius: 4, padding: '1px 6px' }}>{count}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function Empty({ message }: { message: string }) {
  return (
    <div style={{ padding: '20px 16px', textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 8, border: '1px dashed #e2e8f0', fontSize: 13 }}>
      {message}
    </div>
  )
}

const addBtnStyle: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#475569',
}

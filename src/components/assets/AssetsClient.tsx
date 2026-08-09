'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import type { Asset, AssetType, PlayerScores } from '@/lib/types'
import { useAssets } from '@/hooks/useRealtimeData'
import { createClient } from '@/lib/supabase/client'
import AssetCard from './AssetCard'
import AddFileModal from './AddFileModal'
import AddLinkModal from './AddLinkModal'
import EditAssetModal from './EditAssetModal'
import ReplaceAssetModal from './ReplaceAssetModal'
import VersionHistoryDrawer from './VersionHistoryDrawer'

const LV = {
  paper: '#F6F1E8',
  white: '#fff',
  ink: '#0E0E0E',
  inkMid: '#4A4A4A',
  inkLo: '#7A7570',
  inkMute: '#A8A39B',
  line: '#E2DBC9',
  green: '#2D6A4F',   // Get Ready phase accent (this is a Get Ready sub-page)
  amber: '#D4A017',
  rust: '#B5502F',
}

type Modal =
  | { kind: 'add-file'; defaultType?: AssetType }
  | { kind: 'add-link'; defaultType?: AssetType }
  | { kind: 'edit-link'; asset: Asset }
  | { kind: 'edit'; asset: Asset }
  | { kind: 'replace'; asset: Asset }

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
function ageText(d: number): string {
  if (d <= 0) return 'today'
  if (d === 1) return '1 day ago'
  return `${d} days ago`
}
// Freshness banding: ≤30d green, 31-90d amber, >90d rust (matches Get Ready).
function freshnessColor(d: number): string {
  if (d <= 30) return LV.green
  if (d <= 90) return LV.amber
  return LV.rust
}

const SLOT_TYPES: AssetType[] = ['highlight_reel', 'resume', 'transcript', 'test_scores']

export default function AssetsClient({ user }: { user: User }) {
  const supabase = useMemo(() => createClient(), [])
  const { assets, loading, insertLink, updateAsset, archiveAsset, removeAsset, getSignedUrl } = useAssets()
  const [modal, setModal] = useState<Modal | null>(null)
  const [reparsingId, setReparsingId] = useState<string | null>(null)
  const [playerScores, setPlayerScores] = useState<PlayerScores | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.from('player_profile').select('player_scores').limit(1).maybeSingle().then(({ data }) => {
      if (!cancelled) setPlayerScores((data as { player_scores: PlayerScores | null } | null)?.player_scores ?? null)
    })
    return () => { cancelled = true }
  }, [supabase])

  const current = useMemo(() => assets.filter(a => a.is_current), [assets])
  const archived = useMemo(() => assets.filter(a => !a.is_current), [assets])

  // CURRENT file per slot = newest is_current of its type (assets arrive
  // created_at desc; same rule Get Ready + the reel fetch use).
  const currentByType = (t: AssetType): Asset | null =>
    current.filter(a => a.type === t).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null

  const reel = currentByType('highlight_reel')
  const resume = currentByType('resume')
  const transcript = currentByType('transcript')
  const scoreFiles = current.filter(a => a.type === 'test_scores')

  // The shelf = everything current that isn't a canonical slot (test_scores files
  // live in the scores slot; the three single-file slots claim their newest).
  const slotIds = new Set([reel?.id, resume?.id, transcript?.id].filter(Boolean) as string[])
  const shelf = current.filter(a => a.type !== 'test_scores' && !slotIds.has(a.id))

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
  async function handleReparse(asset: Asset) {
    setReparsingId(asset.id)
    try {
      const res = await fetch('/api/assets/reparse-resume', { method: 'POST' })
      if (!res.ok) console.error('[reparse]', (await res.json().catch(() => ({ error: 'Unknown' }))).error)
    } catch (err) { console.error('[reparse]', err) } finally { setReparsingId(null) }
  }
  async function handleSaveLink(data: { name: string; type: AssetType; url: string; description: string }) {
    if (modal?.kind === 'edit-link') {
      await updateAsset(modal.asset.id, { name: data.name, type: data.type, url: data.url, description: data.description || null })
    } else {
      await insertLink({ ...data, userId: user.id })
    }
  }

  // Slot action helpers
  const replaceAction = (a: Asset) => a.category === 'link'
    ? setModal({ kind: 'edit-link', asset: a })
    : setModal({ kind: 'replace', asset: a })

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: LV.paper, minHeight: '100vh', color: LV.ink, paddingBottom: 80 }}>
      {/* Masthead */}
      <div style={{ padding: '24px clamp(28px, 4vw, 56px) 4px', maxWidth: 900, margin: '0 auto' }}>
        <Link href="/get-ready" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
          color: LV.inkLo, textDecoration: 'none', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5m5-6-6 6 6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Get Ready
        </Link>
        <h1 style={{ margin: 0, fontSize: 'clamp(44px, 6vw, 68px)', fontWeight: 700, letterSpacing: '-0.04em', color: LV.ink, lineHeight: 0.95, fontStyle: 'italic' }}>
          The kit.
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: 15, color: LV.inkLo, fontWeight: 450, letterSpacing: '-0.01em', maxWidth: 600, lineHeight: 1.5 }}>
          The files coaches actually see — your film, your resume, your academics. Kept current, ready to send.
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: LV.inkMute, lineHeight: 1.5, maxWidth: 600, fontStyle: 'italic' }}>
          Every email and questionnaire draws from here — stale files quietly undersell a season of work.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: LV.inkLo, fontSize: 14 }}>Loading your kit…</div>
      ) : (
        <div style={{ padding: '20px clamp(28px, 4vw, 56px)', maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>

          {/* ── The essentials: 2×2 slots ─────────────────────── */}
          <section>
            <SectionHeader title="The essentials." />
            <div className="kit-slot-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>

              {/* Reel */}
              <SlotShell present={!!reel} glyph="▶" glyphColor={LV.green} glyphOpacity={0.1} label="Highlight reel">
                {reel ? (
                  <>
                    <div style={slotName}>{reel.name}</div>
                    <div style={{ marginTop: 'auto', paddingTop: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: freshnessColor(daysSince(reel.created_at)), marginBottom: 10 }}>Updated {ageText(daysSince(reel.created_at))}</div>
                      <SlotActions>
                        <button style={slotBtn} onClick={() => handlePreview(reel)}>View</button>
                        <button style={slotBtn} onClick={() => replaceAction(reel)}>Replace</button>
                      </SlotActions>
                    </div>
                  </>
                ) : (
                  <EmptySlot text="Your highlight reel — the first thing most coaches open. Upload yours." cta="Add reel →" onClick={() => setModal({ kind: 'add-link', defaultType: 'highlight_reel' })} />
                )}
              </SlotShell>

              {/* Test scores */}
              <SlotShell present={!!(playerScores?.sat || (playerScores?.ap?.length) || scoreFiles.length)} glyph="★" glyphColor={LV.green} glyphOpacity={0.08} label="Test scores">
                {(playerScores?.sat || playerScores?.ap?.length || scoreFiles.length) ? (
                  <>
                    {playerScores?.sat && (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 'clamp(28px, 3.6vw, 34px)', fontWeight: 800, color: LV.ink, letterSpacing: '-0.03em', lineHeight: 1 }}>{playerScores.sat.total}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: LV.inkLo }}>SAT · {playerScores.sat.math}M / {playerScores.sat.ebrw}V</span>
                      </div>
                    )}
                    {(playerScores?.ap?.length ?? 0) > 0 && (
                      <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 500, color: LV.inkMid, lineHeight: 1.5 }}>
                        <span style={{ fontWeight: 800, color: LV.inkLo }}>AP</span>{' '}{(playerScores?.ap ?? []).map(a => `${a.subject} ${a.score}`).join('  ·  ')}
                      </div>
                    )}
                    <div style={{ marginTop: 'auto', paddingTop: 12 }}>
                      <SlotActions>
                        {scoreFiles.length > 0 && <button style={slotBtn} onClick={() => handlePreview(scoreFiles[0])}>{scoreFiles.length} report{scoreFiles.length !== 1 ? 's' : ''}</button>}
                        <button style={slotBtn} onClick={() => setModal({ kind: 'add-file', defaultType: 'test_scores' })}>Add report</button>
                      </SlotActions>
                    </div>
                  </>
                ) : (
                  <EmptySlot text="Your test scores — SAT and AP results. Add the numbers and reports." cta="Add scores →" onClick={() => setModal({ kind: 'add-file', defaultType: 'test_scores' })} />
                )}
              </SlotShell>

              {/* Resume */}
              <SlotShell present={!!resume} glyph="▤" glyphColor={LV.green} glyphOpacity={0.08} label="Resume">
                {resume ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 'clamp(24px, 3.2vw, 30px)', fontWeight: 800, color: LV.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>v{resume.version}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: LV.inkLo }}>current</span>
                    </div>
                    <div style={{ marginTop: 'auto', paddingTop: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: freshnessColor(daysSince(resume.created_at)), marginBottom: 10 }}>Updated {ageText(daysSince(resume.created_at))}</div>
                      <SlotActions>
                        <button style={slotBtn} onClick={() => handlePreview(resume)}>View</button>
                        <button style={slotBtn} onClick={() => replaceAction(resume)}>Replace</button>
                      </SlotActions>
                    </div>
                  </>
                ) : (
                  <EmptySlot text="Your resume — one page that says who you are. Upload yours." cta="Add resume →" onClick={() => setModal({ kind: 'add-file', defaultType: 'resume' })} />
                )}
              </SlotShell>

              {/* Transcript */}
              <SlotShell present={!!transcript} glyph="☰" glyphColor={LV.green} glyphOpacity={0.09} label="Transcript">
                {transcript ? (
                  <>
                    <div style={{ fontSize: 'clamp(20px, 2.6vw, 24px)', fontWeight: 800, color: LV.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>Current</div>
                    <div style={{ marginTop: 'auto', paddingTop: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: freshnessColor(daysSince(transcript.created_at)), marginBottom: 10 }}>Updated {ageText(daysSince(transcript.created_at))}</div>
                      <SlotActions>
                        <button style={slotBtn} onClick={() => handlePreview(transcript)}>View</button>
                        <button style={slotBtn} onClick={() => replaceAction(transcript)}>Replace</button>
                      </SlotActions>
                    </div>
                  </>
                ) : (
                  <EmptySlot text="Your transcript — coaches check academics early. Upload yours." cta="Add transcript →" onClick={() => setModal({ kind: 'add-file', defaultType: 'transcript' })} />
                )}
              </SlotShell>

            </div>
          </section>

          {/* ── The shelf: everything else ────────────────────── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
              <SectionHeader title="The shelf." count={shelf.length} inline />
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={addBtn} onClick={() => setModal({ kind: 'add-file', defaultType: 'other' })}>+ File</button>
                <button style={addBtn} onClick={() => setModal({ kind: 'add-link', defaultType: 'link' })}>+ Link</button>
              </div>
            </div>
            {shelf.length === 0 ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', color: LV.inkMute, fontSize: 13, background: LV.white, borderRadius: 10, border: `1px dashed ${LV.line}` }}>
                Anything else worth having on hand — schedules, evaluations, prep docs.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {shelf.map(a => (
                  <AssetCard
                    key={a.id}
                    asset={a}
                    onPreview={handlePreview}
                    onReplace={asset => replaceAction(asset)}
                    onEdit={asset => setModal(asset.category === 'link' ? { kind: 'edit-link', asset } : { kind: 'edit', asset })}
                    onDelete={handleDelete}
                    onReparse={handleReparse}
                    reparsing={reparsingId === a.id}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Version history — older versions of everything */}
          <VersionHistoryDrawer archivedAssets={archived} onPreview={handlePreview} />
        </div>
      )}

      {/* Modals */}
      {modal?.kind === 'add-file' && (
        <AddFileModal onClose={() => setModal(null)} onUploaded={() => setModal(null)} defaultType={modal.defaultType} />
      )}
      {(modal?.kind === 'add-link' || modal?.kind === 'edit-link') && (
        <AddLinkModal
          existing={modal.kind === 'edit-link' ? modal.asset : undefined}
          defaultType={modal.kind === 'add-link' ? modal.defaultType : undefined}
          onClose={() => setModal(null)}
          onSave={handleSaveLink}
        />
      )}
      {modal?.kind === 'edit' && (
        <EditAssetModal asset={modal.asset} onClose={() => setModal(null)} onSave={async (id, updates) => { await updateAsset(id, updates) }} />
      )}
      {modal?.kind === 'replace' && (
        <ReplaceAssetModal asset={modal.asset} userId={user.id} onClose={() => setModal(null)} onReplaced={newAsset => { handleReplaced(modal.asset, newAsset); setModal(null) }} />
      )}
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({ title, count, inline }: { title: string; count?: number; inline?: boolean }) {
  return (
    <h2 style={{ margin: inline ? 0 : '0 0 12px', fontSize: 'clamp(16px, 2.2vw, 20px)', fontWeight: 700, letterSpacing: '-0.02em', color: LV.ink, fontStyle: 'italic' }}>
      {title}
      {count != null && <span style={{ fontSize: 13, fontWeight: 600, color: LV.inkLo, fontStyle: 'normal', marginLeft: 8 }}>{count}</span>}
    </h2>
  )
}

// ── Slot primitives ────────────────────────────────────────────────────────

const SLOT_FRAME: React.CSSProperties = {
  position: 'relative', overflow: 'hidden', borderRadius: 14,
  padding: 'clamp(18px, 2.4vw, 22px)', minHeight: 158, height: '100%',
  display: 'flex', flexDirection: 'column',
}
function SlotShell({ present, glyph, glyphColor, glyphOpacity, label, children }: {
  present: boolean; glyph: string; glyphColor: string; glyphOpacity: number; label: string; children: React.ReactNode
}) {
  return (
    <div style={{ ...SLOT_FRAME, background: present ? LV.white : LV.paper, border: present ? `1px solid ${LV.line}` : `1.5px dashed ${LV.line}` }}>
      <div style={{ position: 'absolute', top: -6, right: 6, fontSize: 92, lineHeight: 1, color: glyphColor, opacity: glyphOpacity, pointerEvents: 'none', userSelect: 'none' }}>{glyph}</div>
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: LV.green, marginBottom: 8 }}>{label}</div>
        {children}
      </div>
    </div>
  )
}
function EmptySlot({ text, cta, onClick }: { text: string; cta: string; onClick: () => void }) {
  return (
    <>
      <div style={{ fontSize: 13, color: LV.inkMid, lineHeight: 1.5 }}>{text}</div>
      <div style={{ marginTop: 'auto', paddingTop: 12 }}>
        <button style={slotPrimary} onClick={onClick}>{cta}</button>
      </div>
    </>
  )
}
function SlotActions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>
}

const slotName: React.CSSProperties = {
  fontSize: 'clamp(15px, 1.9vw, 18px)', fontWeight: 700, color: LV.ink, fontStyle: 'italic',
  letterSpacing: '-0.02em', lineHeight: 1.25, maxWidth: '80%',
  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
}
const slotBtn: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 999, border: `1px solid ${LV.line}`, background: LV.white,
  fontSize: 11, fontWeight: 650, color: LV.inkMid, cursor: 'pointer', fontFamily: 'inherit',
}
const slotPrimary: React.CSSProperties = { ...slotBtn, background: LV.green, color: '#fff', border: 'none' }
const addBtn: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 999, border: `1px solid ${LV.line}`, background: LV.white,
  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: LV.inkMid, letterSpacing: '-0.01em',
}

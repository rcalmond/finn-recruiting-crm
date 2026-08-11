'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { Campaign } from '@/lib/types'
import { CampaignMasthead, CampaignConcept, campaignState, StatePill, cbtn } from './CampaignChrome'

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  paper:   '#F6F1E8',
  white:   '#fff',
  border:  '#E2DBC9',
  ink:     '#0E0E0E',
  inkMid:  '#4A4A4A',
  inkLo:   '#7A7570',
  red:     '#C8102E',
  green:   '#16A34A',
  teal:    '#00B2A9',
  amber:   '#B45309',
}

// ── Types ─────────────────────────────────────────────────────────────────────

type CampaignRow = Campaign & {
  counts: Record<string, number>
}

type ListFilter = 'active' | 'archived' | 'all'

// ── Main component ────────────────────────────────────────────────────────────

export default function CampaignsClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  const filter = (searchParams.get('filter') ?? 'active') as ListFilter
  const setFilter = useCallback((v: ListFilter) => {
    const params = new URLSearchParams(searchParams.toString())
    if (v === 'active') params.delete('filter'); else params.set('filter', v)
    const q = params.toString()
    router.push(q ? `${pathname}?${q}` : pathname)
  }, [router, pathname, searchParams])
  const [menuOpen, setMenuOpen]   = useState<string | null>(null)
  const [menuPos, setMenuPos]     = useState<{ top: number; left: number } | null>(null)
  const kebabRef = useRef<HTMLButtonElement | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CampaignRow | null>(null)
  const [deleteInput, setDeleteInput]   = useState('')
  const [deleting, setDeleting]         = useState(false)

  const openMenu = useCallback((id: string, btn: HTMLButtonElement) => {
    if (menuOpen === id) { setMenuOpen(null); return }
    const rect = btn.getBoundingClientRect()
    const dropdownHeight = 80 // approx height of 2 menu items
    const flipUp = rect.bottom + dropdownHeight > window.innerHeight
    setMenuPos({
      top: flipUp ? rect.top - dropdownHeight : rect.bottom + 4,
      left: rect.right - 140, // align right edge with button
    })
    setMenuOpen(id)
    kebabRef.current = btn
  }, [menuOpen])

  useEffect(() => {
    fetch('/api/campaigns')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setCampaigns(d.campaigns ?? [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = campaigns.filter(c => {
    if (filter === 'active') return !c.archived_at
    if (filter === 'archived') return !!c.archived_at
    return true
  })

  async function handleArchive(id: string, archive: boolean) {
    setMenuOpen(null)
    const res = await fetch(`/api/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: archive ? 'archive' : 'unarchive' }),
    })
    if (res.ok) {
      setCampaigns(prev => prev.map(c =>
        c.id === id ? { ...c, archived_at: archive ? new Date().toISOString() : null } : c
      ))
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await fetch(`/api/campaigns/${deleteTarget.id}`, { method: 'DELETE' })
    if (res.ok) {
      setCampaigns(prev => prev.filter(c => c.id !== deleteTarget.id))
    }
    setDeleteTarget(null)
    setDeleteInput('')
    setDeleting(false)
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px 64px' }}>

      {/* Masthead */}
      <CampaignMasthead
        title="Campaigns."
        subtitle="One message, sent to many coaches at once — personalized for each school. Set one up when you have something worth sending to your whole list."
        right={
          <button onClick={() => router.push('/campaigns/new')} style={cbtn('primary')}>
            + New campaign
          </button>
        }
      />

      {/* What a campaign is */}
      <CampaignConcept />

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {(['active', 'archived', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: filter === f ? C.ink : 'transparent',
              color: filter === f ? '#fff' : C.inkMid,
            }}
          >
            {f === 'active' ? 'Active' : f === 'archived' ? 'Archived' : 'All'}
          </button>
        ))}
      </div>

      {/* States */}
      {loading && (
        <div style={{ fontSize: 13, color: C.inkLo, padding: '40px 0', textAlign: 'center' }}>
          Loading...
        </div>
      )}

      {error && (
        <div style={{
          fontSize: 13, color: C.red, background: '#FEF2F2',
          border: '1px solid #FCA5A5', borderRadius: 7, padding: '10px 14px',
        }}>
          {error}
        </div>
      )}

      {/* Empty state — reuses the Get Seen "Outreach at scale" framing */}
      {!loading && !error && filtered.length === 0 && (
        <div style={{
          background: C.white, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: '48px 28px', textAlign: 'center',
        }}>
          {filter === 'archived' ? (
            <div style={{ fontSize: 14, color: C.inkLo }}>No archived campaigns.</div>
          ) : (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, fontStyle: 'italic', color: C.ink, letterSpacing: -0.3, marginBottom: 8 }}>
                Outreach at scale.
              </div>
              <div style={{ fontSize: 13.5, color: C.inkLo, lineHeight: 1.55, maxWidth: 400, margin: '0 auto 18px' }}>
                Going to a showcase? Email every attending coach — personalized, in one pass. Start your first campaign when you have something to share.
              </div>
              <button onClick={() => router.push('/campaigns/new')} style={cbtn('primary')}>
                + New campaign
              </button>
            </>
          )}
        </div>
      )}

      {/* Campaign table */}
      {!loading && !error && filtered.length > 0 && (
        <div style={{
          background: C.white, border: `1px solid ${C.border}`,
          borderRadius: 8, overflow: 'hidden',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 32px',
            padding: '10px 16px', gap: 12,
            borderBottom: `1px solid ${C.border}`,
            background: C.paper,
          }}>
            {['Campaign', 'State', ''].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.inkLo, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          {filtered.map((c, i) => {
            const created   = new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            const isArchived = !!c.archived_at
            const state = campaignState(c, c.counts)

            return (
              <div
                key={c.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 32px', gap: 12,
                  padding: '13px 16px', alignItems: 'center',
                  borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none',
                  opacity: isArchived ? 0.6 : 1,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = C.paper)}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <div
                  onClick={() => router.push(`/campaigns/${c.id}`)}
                  style={{ cursor: 'pointer', minWidth: 0 }}
                >
                  <div style={{ fontSize: 14, fontWeight: 650, color: C.ink, letterSpacing: -0.2 }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: C.inkLo, marginTop: 2 }}>Created {created}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <StatePill state={state} />
                </div>
                {/* Kebab menu trigger */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button
                    onClick={e => { e.stopPropagation(); openMenu(c.id, e.currentTarget) }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 16, color: C.inkLo, padding: '0 4px', lineHeight: 1,
                    }}
                  >&#8942;</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Portaled kebab dropdown */}
      {menuOpen && menuPos && typeof document !== 'undefined' && createPortal(
        <>
          <div onClick={() => setMenuOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000 }} />
          <div style={{
            position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 1001,
            background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            border: `1px solid ${C.border}`, overflow: 'hidden', minWidth: 140,
          }}>
            {(() => {
              const c = campaigns.find(x => x.id === menuOpen)
              if (!c) return null
              const isArch = !!c.archived_at
              return (
                <>
                  <button
                    onClick={() => handleArchive(c.id, !isArch)}
                    style={{
                      display: 'block', width: '100%', padding: '8px 14px',
                      fontSize: 12, fontWeight: 600, color: C.ink,
                      background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left', fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.paper)}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    {isArch ? 'Unarchive' : 'Archive'}
                  </button>
                  <button
                    onClick={() => { setMenuOpen(null); setDeleteTarget(c); setDeleteInput('') }}
                    style={{
                      display: 'block', width: '100%', padding: '8px 14px',
                      fontSize: 12, fontWeight: 600, color: C.red,
                      background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left', fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    Delete...
                  </button>
                </>
              )
            })()}
          </div>
        </>,
        document.body
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <>
          <div onClick={() => { setDeleteTarget(null); setDeleteInput('') }} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1050,
          }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 420, maxWidth: 'calc(100vw - 32px)', background: '#fff',
            borderRadius: 12, boxShadow: '0 20px 48px rgba(0,0,0,0.18)', zIndex: 1051,
            padding: 24,
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: C.ink }}>
              Delete campaign?
            </h3>
            <p style={{ fontSize: 13, color: C.inkMid, lineHeight: 1.6, margin: '0 0 16px' }}>
              This will permanently delete &ldquo;{deleteTarget.name}&rdquo; and all draft history.
              Sent emails will remain in contact history.
            </p>
            <p style={{ fontSize: 13, color: C.inkMid, margin: '0 0 12px' }}>
              Type <strong>DELETE</strong> to confirm.
            </p>
            <input
              type="text"
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              placeholder="DELETE"
              autoFocus
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 6,
                border: `1px solid ${C.border}`, fontSize: 13,
                fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => { setDeleteTarget(null); setDeleteInput('') }}
                style={{
                  padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                  background: '#f1f5f9', color: '#475569', border: 'none', cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleteInput !== 'DELETE' || deleting}
                style={{
                  padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                  background: C.red, color: '#fff', border: 'none',
                  cursor: deleteInput !== 'DELETE' || deleting ? 'not-allowed' : 'pointer',
                  opacity: deleteInput !== 'DELETE' || deleting ? 0.5 : 1,
                }}
              >{deleting ? 'Deleting...' : 'Delete campaign'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}


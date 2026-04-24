'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Campaign } from '@/lib/types'

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  paper:   '#F6F1E8',
  white:   '#fff',
  border:  '#E2DBC9',
  ink:     '#0E0E0E',
  inkLo:   '#7A7570',
  red:     '#C8102E',
  green:   '#16A34A',
  teal:    '#00B2A9',
  amber:   '#B45309',
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  draft:     { background: '#F3F4F6', color: '#374151' },
  active:    { background: '#DCFCE7', color: '#166534' },
  paused:    { background: '#FEF9C3', color: '#854D0E' },
  completed: { background: '#E0E7FF', color: '#3730A3' },
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft
  return (
    <span style={{
      ...style,
      fontSize: 10, fontWeight: 700, padding: '2px 8px',
      borderRadius: 4, textTransform: 'uppercase', letterSpacing: 0.4,
    }}>
      {status}
    </span>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

type CampaignRow = Campaign & {
  counts: Record<string, number>
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CampaignsClient() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

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

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px 64px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 750, color: C.ink, letterSpacing: -0.5, margin: 0 }}>
          Campaigns
        </h1>
        <button
          onClick={() => router.push('/campaigns/new')}
          style={{
            padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600,
            background: C.ink, color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          + New campaign
        </button>
      </div>

      {/* States */}
      {loading && (
        <div style={{ fontSize: 13, color: C.inkLo, padding: '40px 0', textAlign: 'center' }}>
          Loading…
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

      {/* Empty state */}
      {!loading && !error && campaigns.length === 0 && (
        <div style={{
          background: C.paper, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '48px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: C.inkLo, marginBottom: 16 }}>No campaigns yet.</div>
          <button
            onClick={() => router.push('/campaigns/new')}
            style={{
              padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600,
              background: C.ink, color: '#fff', border: 'none', cursor: 'pointer',
            }}
          >
            Create your first campaign
          </button>
        </div>
      )}

      {/* Campaign table */}
      {!loading && !error && campaigns.length > 0 && (
        <div style={{
          background: C.white, border: `1px solid ${C.border}`,
          borderRadius: 8, overflow: 'hidden',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 90px 56px 56px 56px 100px',
            padding: '10px 16px',
            borderBottom: `1px solid ${C.border}`,
            background: C.paper,
          }}>
            {['Campaign', 'Status', 'Pend.', 'Sent', 'Dimsd.', 'Created'].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.inkLo, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          {campaigns.map((c, i) => {
            const pending   = c.counts['pending']   ?? 0
            const sent      = c.counts['sent']      ?? 0
            const dismissed = c.counts['dismissed'] ?? 0
            const created   = new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

            return (
              <div
                key={c.id}
                onClick={() => router.push(`/campaigns/${c.id}`)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 90px 56px 56px 56px 100px',
                  padding: '13px 16px',
                  borderBottom: i < campaigns.length - 1 ? `1px solid ${C.border}` : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = C.paper)}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{c.name}</div>
                  {c.template?.name && c.template.name !== c.name && (
                    <div style={{ fontSize: 11, color: C.inkLo, marginTop: 2 }}>{c.template.name}</div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <StatusBadge status={c.status} />
                </div>
                <CountCell n={pending}   color={pending > 0 ? C.amber : C.inkLo} />
                <CountCell n={sent}      color={sent > 0 ? C.green : C.inkLo} />
                <CountCell n={dismissed} color={dismissed > 0 ? C.inkLo : C.inkLo} />
                <div style={{ fontSize: 12, color: C.inkLo, display: 'flex', alignItems: 'center' }}>
                  {created}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function CountCell({ n, color }: { n: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <span style={{ fontSize: 13, fontWeight: n > 0 ? 600 : 400, color: n > 0 ? color : C.inkLo }}>
        {n}
      </span>
    </div>
  )
}


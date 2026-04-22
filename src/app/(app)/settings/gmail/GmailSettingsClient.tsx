'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  connected:      boolean
  connectedEmail: string | null
  lastSyncAt:     string | null
  gmailCount:     number
  partialCount:   number
}

type SyncResult = {
  ok:            boolean
  stats?:        { inserted: number; deduped: number; failed: number; partial: number }
  labelResult?:  { labeled: number; skipped: number }
  pagesProcessed?: number
  skipped?:      string   // e.g. 'no_token' | 'auth_error'
  error?:        string
}

export default function GmailSettingsClient({
  connected,
  connectedEmail,
  lastSyncAt,
  gmailCount,
  partialCount,
}: Props) {
  const router   = useRouter()
  const [syncing, setSyncing]               = useState(false)
  const [syncResult, setSyncResult]         = useState<SyncResult | null>(null)
  const [disconnecting, setDisconnecting]   = useState(false)

  // ── Disconnect ─────────────────────────────────────────────────────────────

  async function handleDisconnect() {
    if (!confirm('Disconnect Gmail? Existing contact log entries are kept. You can reconnect any time.')) return
    setDisconnecting(true)
    try {
      await fetch('/api/auth/gmail/disconnect', { method: 'POST' })
      router.refresh()
    } finally {
      setDisconnecting(false)
    }
  }

  // ── Sync Now ───────────────────────────────────────────────────────────────
  //
  // Hits /api/gmail/manual-sync — a session-authenticated proxy to the cron
  // endpoint. Runs an incremental sync from last_sync_at, same as the 15-min
  // cron. Returns a single JSON blob (not streaming).

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)

    try {
      const res  = await fetch('/api/gmail/manual-sync', { method: 'POST' })
      const data = await res.json().catch(() => ({ ok: false, error: res.statusText })) as SyncResult
      setSyncResult(data)
    } finally {
      setSyncing(false)
      router.refresh()
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function formatDate(iso: string | null): string {
    if (!iso) return 'Never'
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 750, color: '#0E0E0E', letterSpacing: -0.5, margin: 0 }}>
          Gmail Integration
        </h1>
        <p style={{ fontSize: 13, color: '#7A7570', marginTop: 4 }}>
          Automatically capture recruiting emails from {connectedEmail ?? 'your Gmail account'}.
        </p>
      </div>

      {/* Connection card */}
      <div style={{
        background: '#fff', border: '1px solid #E2DBC9', borderRadius: 10,
        padding: '20px 20px', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0E0E0E', marginBottom: 4 }}>
              Connection
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: connected ? '#16A34A' : '#D1D5DB',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 13, color: connected ? '#0E0E0E' : '#7A7570' }}>
                {connected ? connectedEmail : 'Not connected'}
              </span>
            </div>
          </div>

          {connected ? (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              style={{
                padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                background: 'transparent', border: '1px solid #E2DBC9',
                color: disconnecting ? '#B5B0A8' : '#7A7570',
                cursor: disconnecting ? 'not-allowed' : 'pointer',
              }}
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          ) : (
            <a
              href="/api/auth/gmail/connect"
              style={{
                padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                background: '#0E0E0E', color: '#fff',
                textDecoration: 'none', display: 'inline-block',
              }}
            >
              Connect Gmail
            </a>
          )}
        </div>
      </div>

      {/* Stats + sync card — only when connected */}
      {connected && (
        <div style={{
          background: '#fff', border: '1px solid #E2DBC9', borderRadius: 10,
          padding: '20px 20px', marginBottom: 16,
        }}>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 32, marginBottom: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#7A7570', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Messages captured
              </div>
              <div style={{ fontSize: 22, fontWeight: 750, color: '#0E0E0E', letterSpacing: -0.5 }}>
                {gmailCount}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#7A7570', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Needs review
              </div>
              <div style={{ fontSize: 22, fontWeight: 750, color: partialCount > 0 ? '#B45309' : '#0E0E0E', letterSpacing: -0.5 }}>
                {partialCount}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#7A7570', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Last sync
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0E0E0E', marginTop: 6 }}>
                {formatDate(lastSyncAt)}
              </div>
            </div>
          </div>

          {/* Sync Now */}
          <div style={{ borderTop: '1px solid #E2DBC9', paddingTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: syncResult ? 12 : 0 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0E0E0E' }}>
                  Sync Now
                </div>
                <div style={{ fontSize: 12, color: '#7A7570', marginTop: 2 }}>
                  Scans last 6 months of Recruiting-labeled email. Safe to run any time — duplicates are skipped.
                </div>
              </div>
              <button
                onClick={handleSync}
                disabled={syncing}
                style={{
                  marginLeft: 16, flexShrink: 0,
                  padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                  background: syncing ? '#E2DBC9' : '#0E0E0E',
                  color: syncing ? '#7A7570' : '#fff',
                  border: 'none', cursor: syncing ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {syncing ? 'Syncing…' : 'Sync Now'}
              </button>
            </div>

            {/* Sync result */}
            {syncResult && (
              <div style={{
                marginTop: 12,
                background: '#F6F1E8', border: '1px solid #E2DBC9', borderRadius: 7,
                padding: '10px 14px', fontSize: 12, lineHeight: 1.6,
              }}>
                <SyncResultDisplay result={syncResult} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cron note */}
      {connected && (
        <div style={{ fontSize: 12, color: '#7A7570', lineHeight: 1.5 }}>
          The cron job syncs automatically every 15 minutes. Use Sync Now only if you need to catch up immediately.
        </div>
      )}
    </div>
  )
}

// ── Sync result display ───────────────────────────────────────────────────────

function SyncResultDisplay({ result }: { result: SyncResult }) {
  if (result.error) {
    return <div style={{ color: '#C8102E', fontWeight: 600 }}>Error: {result.error}</div>
  }
  if (result.skipped === 'no_token') {
    return <div style={{ color: '#B45309' }}>Gmail not connected — complete OAuth first.</div>
  }
  if (result.skipped === 'auth_error') {
    return <div style={{ color: '#B45309' }}>Gmail auth error — try reconnecting.</div>
  }
  if (!result.stats) {
    return <div style={{ color: '#7A7570' }}>Sync completed.</div>
  }

  const { inserted, deduped, failed, partial } = result.stats
  const { labeled } = result.labelResult ?? { labeled: 0 }

  return (
    <div>
      <span style={{ color: '#16A34A', fontWeight: 700 }}>Sync complete</span>
      <span style={{ color: '#4A4A4A' }}>
        {' '}— {inserted} new, {deduped} already captured{failed > 0 ? `, ${failed} failed` : ''}
        {partial > 0 ? `, ${partial} need review` : ''}
        {labeled > 0 ? `, ${labeled} auto-labeled` : ''}
      </span>
    </div>
  )
}

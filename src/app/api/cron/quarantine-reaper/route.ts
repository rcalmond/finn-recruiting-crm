/**
 * /api/cron/quarantine-reaper — 30-day retention on inbound_quarantine.
 *
 * Quarantined payloads hold coach email bodies belonging to people who are not
 * customers. Thirty days is ample for triage, and shipping the reaper with the
 * build keeps the retention promise real instead of filing it as invisible debt.
 *
 * Deletes rows of ANY status once past the window — a resolved row's payload has
 * no reason to outlive an unresolved one.
 */
import { NextRequest, NextResponse } from 'next/server'
import { rawService } from '@/lib/tenant-db'

const RETENTION_DAYS = 30

export async function GET(req: NextRequest) {
  const startedAt = new Date().toISOString()

  // An unset secret REFUSES in every environment — never falls open.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error(`[quarantine-reaper] ${startedAt} — CRON_SECRET is not configured; refusing`)
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    console.warn(`[quarantine-reaper] ${startedAt} — rejected: invalid CRON_SECRET`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString()
  const db = rawService()

  const { data, error } = await db
    .from('inbound_quarantine')
    .delete()
    .lt('received_at', cutoff)
    .select('id')

  if (error) {
    console.error(`[quarantine-reaper] ${startedAt} — delete failed: ${error.message}`)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const deleted = (data ?? []).length
  console.log(`[quarantine-reaper] ${startedAt} — deleted ${deleted} row(s) older than ${RETENTION_DAYS}d`)
  return NextResponse.json({ ok: true, deleted, cutoff })
}

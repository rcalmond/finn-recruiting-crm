/**
 * POST /api/gmail/manual-sync
 *
 * Proxy for /api/cron/gmail-sync, gated on CRON_SECRET ONLY (emergency patch,
 * pre-tenancy): a session gate let ANY authenticated user trigger the global
 * Gmail sync, which is wrong the moment a second family exists. Until this
 * moves to proper admin tooling, callers must present the cron secret — the
 * Settings UI button will get 401, which is the intended state for now.
 */

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  // Cron-secret gate — an unset secret REFUSES (never falls open).
  const cronSecretGate = process.env.CRON_SECRET
  if (!cronSecretGate) {
    return NextResponse.json({ error: 'Sync disabled: CRON_SECRET is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecretGate}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Build the internal URL for the cron endpoint
  const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000'
  const proto = req.headers.get('x-forwarded-proto') ?? 'http'
  const cronUrl = `${proto}://${host}/api/cron/gmail-sync`

  const cronSecret = process.env.CRON_SECRET ?? ''

  let res: Response
  try {
    res = await fetch(cronUrl, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[manual-sync] Failed to reach cron endpoint:', msg)
    return NextResponse.json({ error: `Could not reach sync endpoint: ${msg}` }, { status: 502 })
  }

  const data = await res.json().catch(() => ({ error: 'Invalid response from sync endpoint' }))
  return NextResponse.json(data, { status: res.status })
}

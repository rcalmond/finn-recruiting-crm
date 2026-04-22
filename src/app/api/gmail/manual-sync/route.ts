/**
 * POST /api/gmail/manual-sync
 *
 * Session-authenticated proxy for /api/cron/gmail-sync.
 * Lets the Settings UI trigger an incremental sync without exposing
 * CRON_SECRET to the browser.
 *
 * Flow:
 *   1. Validate Supabase session — 401 if not signed in
 *   2. Call /api/cron/gmail-sync internally with Authorization: Bearer <CRON_SECRET>
 *   3. Forward the JSON response to the client
 *
 * The cron route handles its own Gmail auth, rate limiting, and dedup.
 * This route does nothing except gate on user session and inject the secret.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  // Auth guard — must be a signed-in CRM user
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
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

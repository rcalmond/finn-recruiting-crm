/**
 * POST /api/not-found-log
 *
 * Log-only 404 tracking (no notification). The branded not-found page fires a
 * best-effort beacon here on render; we record path + referrer + (if signed in)
 * user id + user-agent so internal 404s (authed user, internal referrer — the
 * real-bug signal) can later be told apart from bot/typo noise.
 *
 * Fire-and-forget: any failure is swallowed and we still return 204. A failed
 * log write must never surface to the 404 page.
 *
 * Body: { path: string, referrer?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { catalogAdmin } from '@/lib/tenant-db'

export async function POST(req: NextRequest) {
  try {
    const { path, referrer } = (await req.json()) as {
      path?: string
      referrer?: string
    }

    // No path, nothing worth logging.
    if (!path || typeof path !== 'string') {
      return new NextResponse(null, { status: 204 })
    }

    // Best-effort authed user (null for anonymous). Never blocks the write.
    let userId: string | null = null
    try {
      const supabase = await createClient()
      const { data } = await supabase.auth.getUser()
      userId = data.user?.id ?? null
    } catch {
      userId = null
    }

    const userAgent = req.headers.get('user-agent')
    // Same-origin referrers only reach us useful for internal-vs-external triage;
    // store whatever the client sent (may be empty for a typed URL).
    const ref = typeof referrer === 'string' && referrer.length > 0 ? referrer : null

    await catalogAdmin().from('not_found_log').insert({
      path: path.slice(0, 2048),
      referrer: ref?.slice(0, 2048) ?? null,
      user_id: userId,
      user_agent: userAgent?.slice(0, 1024) ?? null,
    })
  } catch {
    // Swallow — logging must never break, and the 404 render doesn't read this.
  }

  return new NextResponse(null, { status: 204 })
}

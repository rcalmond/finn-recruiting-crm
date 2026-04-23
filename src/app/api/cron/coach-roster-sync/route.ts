/**
 * /api/cron/coach-roster-sync
 *
 * Vercel cron job — runs Sun + Wed at 9am Denver (15:00 UTC).
 * Protected by CRON_SECRET (same pattern as /api/cron/gmail-sync).
 *
 * Behavior:
 *   - Normal forward-looking run only (no --initial-seed, no dry-run)
 *   - Scrapes every school that has coach_page_url set
 *   - email_added changes are auto-applied (status='auto')
 *   - All other changes are logged to coach_changes for human review
 *   - 2-second delay between schools to avoid hammering athletics CDNs
 *   - Per-school errors are logged and counted; the run continues
 *
 * Error handling:
 *   - Fetch failure or Haiku JSON error → updates coach_page_last_error,
 *     increments error count, continues to next school
 *   - Any uncaught error → 500 (Vercel will retry; that's OK here)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { scrapeSchool } from '@/lib/coach-scraper'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = ReturnType<typeof createServiceClient<any>>

function serviceClient(): Supabase {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function GET(req: NextRequest) {
  const startedAt = new Date().toISOString()

  // ── 1. CRON_SECRET validation ─────────────────────────────────────────────
  //
  // Vercel sends: Authorization: Bearer <CRON_SECRET>
  // Same auth pattern as /api/cron/gmail-sync.

  const cronSecret = process.env.CRON_SECRET
  const isProd     = process.env.NODE_ENV === 'production'

  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      console.warn(`[coach-roster-sync] ${startedAt} — rejected: invalid CRON_SECRET`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } else if (isProd) {
    console.error(`[coach-roster-sync] ${startedAt} — CRON_SECRET is not configured in production`)
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  } else {
    console.warn(`[coach-roster-sync] ${startedAt} — CRON_SECRET not set; running unauthenticated (dev only)`)
  }

  const admin = serviceClient()

  // ── 2. Fetch all schools with a coach_page_url and scrape enabled ──────────

  const { data: allSchools, error: fetchErr } = await admin
    .from('schools')
    .select('id, name, coach_page_scrape_enabled')
    .not('coach_page_url', 'is', null)
    .order('name')

  if (fetchErr) {
    console.error(`[coach-roster-sync] ${startedAt} — failed to fetch schools: ${fetchErr.message}`)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!allSchools || allSchools.length === 0) {
    console.log(`[coach-roster-sync] ${startedAt} — no schools with coach_page_url; nothing to do`)
    return NextResponse.json({ ok: true, schoolsProcessed: 0 })
  }

  const schools   = allSchools.filter(s => s.coach_page_scrape_enabled !== false)
  const skipped   = allSchools.filter(s => s.coach_page_scrape_enabled === false)

  if (skipped.length > 0) {
    console.log(
      `[coach-roster-sync] ${startedAt} — skipped ${skipped.length} school(s) (scrape_enabled=false): ` +
      skipped.map(s => s.name).join(', ')
    )
  }

  if (schools.length === 0) {
    console.log(`[coach-roster-sync] ${startedAt} — all schools skipped; nothing to do`)
    return NextResponse.json({ ok: true, schoolsProcessed: 0, skipped: skipped.length })
  }

  console.log(`[coach-roster-sync] ${startedAt} — processing ${schools.length} school(s)`)

  // ── 3. Scrape each school ─────────────────────────────────────────────────
  //
  // Options:
  //   dryRun: false      — always write to DB (this is the live cron)
  //   initialSeed: false — normal forward-looking mode; coach_added stays 'manual'

  const options = { dryRun: false, initialSeed: false }

  const stats = {
    schools:   schools.length,
    skipped:   skipped.length,
    errors:    0,
    changes:   0,
    applied:   0,
    noChange:  0,
  }

  for (let i = 0; i < schools.length; i++) {
    if (i > 0) await sleep(2_000)

    const school = schools[i]
    const result = await scrapeSchool(admin, school.id, options)

    if (result.error) {
      stats.errors++
      console.error(
        `[coach-roster-sync] ${startedAt} — ${school.name}: ERROR — ${result.error}`
      )
      continue
    }

    if (result.changes.length === 0) {
      stats.noChange++
      console.log(`[coach-roster-sync] ${startedAt} — ${school.name}: no changes (${result.scrapedCount} scraped, ${result.dbCount} in DB)`)
      continue
    }

    stats.changes  += result.changes.length
    stats.applied  += result.appliedCount

    const summary = result.changes.map(c => `${c.changeType}[${c.wouldStatus}]`).join(', ')
    console.log(
      `[coach-roster-sync] ${startedAt} — ${school.name}: ` +
      `${result.changes.length} change(s) — ${summary} — applied ${result.appliedCount}`
    )
  }

  console.log(
    `[coach-roster-sync] ${startedAt} — done: ` +
    `schools=${stats.schools} changes=${stats.changes} ` +
    `applied=${stats.applied} noChange=${stats.noChange} errors=${stats.errors}`
  )

  return NextResponse.json({ ok: true, stats })
}

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
import { familyAdmin, catalogAdmin } from '@/lib/tenant-db'
import { scrapeSchool } from '@/lib/coach-scraper'
import { startRun, completeRun } from '@/lib/cron-runs'
import { buildFamilyScanSet, distinctTargets } from '@/lib/cron-scan-set'

// The ALMOND_FAMILY_ID pin is GONE. It scraped one family's schools, so a school
// only another family tracked was never scraped and nobody saw an error — a cron
// doing less work than it reports still reports success.
//
// coaches is a FAMILY table, so each school is scraped through the client of the
// family that tracks it: a coach row has to belong to somebody. cron_runs is
// catalog, so the run record goes on catalogAdmin rather than borrowing an
// arbitrary family's client.
function runClient() {
  return catalogAdmin()
}

// The union scan set is (family x school) PAIRS, so removing the family pin
// multiplied this job's wall clock by the family count. Wall clock — not the
// 1000-row cap — is this cron's real ceiling: the per-family reads are each
// scoped to one family and nowhere near 1000 rows, while the loop is seconds
// per pair. Declared explicitly so the limit is a decision rather than a default.
export const maxDuration = 300

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function GET(req: NextRequest) {
  const startedAt = new Date().toISOString()

  // ── 1. CRON_SECRET validation ─────────────────────────────────────────────
  //
  // Vercel sends: Authorization: Bearer <CRON_SECRET>
  // Same auth pattern as /api/cron/gmail-sync.

  // An unset secret REFUSES in every environment — never falls open.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error(`[coach-roster-sync] ${startedAt} — CRON_SECRET is not configured; refusing`)
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    console.warn(`[coach-roster-sync] ${startedAt} — rejected: invalid CRON_SECRET`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runDb = runClient()
  const runId = await startRun(runDb, 'coach-roster-sync')

  // ── 2. THE UNION SCAN SET: every family's scrapeable schools ───────────────
  // Paginated and asserted inside fetchAll. A truncated scan set here is a
  // silent undercount in an unattended job — schools quietly stop being scraped
  // and the run still says success.

  interface ScanSchool { id: string; name: string; coach_page_url: string | null; coach_page_scrape_enabled: boolean | null }
  let scan
  try {
    scan = await buildFamilyScanSet<ScanSchool>(
      'id, name, coach_page_url, coach_page_scrape_enabled',
      q => q.not('coach_page_url', 'is', null).in('category', ['A', 'B', 'C']).neq('status', 'Inactive'),
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load scan set'
    console.error(`[coach-roster-sync] ${startedAt} — scan set failed: ${message}`)
    await completeRun(runDb, runId, 'failed', {}, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const allSchools = scan.entries
  const distinctPages = distinctTargets(allSchools, s => s.coach_page_url)
  console.log(
    `[coach-roster-sync] ${startedAt} — scan set: ${allSchools.length} (family, school) pair(s) ` +
    `across ${scan.families.length} family(ies); ${distinctPages} distinct coach page(s). ` +
    `The gap is duplicated fetching of the same athletics page.`
  )

  if (allSchools.length === 0) {
    console.log(`[coach-roster-sync] ${startedAt} — no schools with coach_page_url; nothing to do`)
    await completeRun(runDb, runId, 'success', { schools_scraped: 0, reason: 'no schools with coach_page_url' })
    return NextResponse.json({ ok: true, schoolsProcessed: 0 })
  }

  const schools   = allSchools.filter(e => e.school.coach_page_scrape_enabled !== false)
  const skipped   = allSchools.filter(e => e.school.coach_page_scrape_enabled === false)

  if (skipped.length > 0) {
    console.log(
      `[coach-roster-sync] ${startedAt} — skipped ${skipped.length} school(s) (scrape_enabled=false): ` +
      skipped.map(e => `${e.school.name} (${e.familyName ?? e.familyId.slice(0, 8)})`).join(', ')
    )
  }

  if (schools.length === 0) {
    console.log(`[coach-roster-sync] ${startedAt} — all schools skipped; nothing to do`)
    await completeRun(runDb, runId, 'success', { schools_scraped: 0, skipped: skipped.length, reason: 'all schools scrape_enabled=false' })
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
  const errorsPerSchool: Array<{ school: string; error: string }> = []

  try {
    for (let i = 0; i < schools.length; i++) {
      if (i > 0) await sleep(2_000)

      const { familyId, familyName, school } = schools[i]
      // Scraped through the tracking family's own client: scrapeSchool writes
      // coaches, which is a family table.
      const result = await scrapeSchool(familyAdmin(familyId), school.id, options)

      if (result.error) {
        stats.errors++
        errorsPerSchool.push({ school: `${school.name} (${familyName ?? familyId.slice(0, 8)})`, error: result.error })
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
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[coach-roster-sync] ${startedAt} — fatal error during scrape loop: ${errMsg}`)
    errorsPerSchool.push({ school: '(fatal)', error: errMsg })
    stats.errors++
  }

  console.log(
    `[coach-roster-sync] ${startedAt} — done: ` +
    `schools=${stats.schools} changes=${stats.changes} ` +
    `applied=${stats.applied} noChange=${stats.noChange} errors=${stats.errors}`
  )

  await completeRun(
    runDb, runId,
    errorsPerSchool.length > 0 ? 'partial' : 'success',
    {
      families_scanned: scan.families.length,
      distinct_coach_pages: distinctPages,
      schools_scraped: stats.schools,
      changes_proposed: stats.changes,
      changes_auto_applied: stats.applied,
      errors_per_school: errorsPerSchool,
      no_change: stats.noChange,
      skipped: stats.skipped,
    }
  )

  return NextResponse.json({ ok: true, stats })
}

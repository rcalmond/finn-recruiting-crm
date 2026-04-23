/**
 * scrape-coach-rosters.ts
 *
 * CLI wrapper around src/lib/coach-scraper.ts
 *
 * Usage:
 *   npx tsx scripts/scrape-coach-rosters.ts --dry-run
 *   npx tsx scripts/scrape-coach-rosters.ts --dry-run --school-id <uuid>
 *   npx tsx scripts/scrape-coach-rosters.ts --initial-seed --dry-run
 *   npx tsx scripts/scrape-coach-rosters.ts --initial-seed
 *
 * Flags:
 *   --dry-run        Fetch + diff, no DB writes (coach_changes not written,
 *                    coaches table not modified, last_scraped_at not stamped)
 *   --initial-seed   Bulk-apply all coach_added + email_added as 'seed' status.
 *                    Safe to combine with --dry-run to preview what would be seeded.
 *   --school-id <id> Scrape exactly one school (by UUID). Skips the 2-second
 *                    inter-school delay. Useful for testing a specific page.
 *
 * Rate limiting:
 *   Without --school-id: 2-second sleep between schools to avoid hammering
 *   athletics sites that share CDNs. The cron route will use the same library
 *   and can run at a lower cadence (e.g. one school per minute).
 *
 * Output format:
 *   Per-school block:
 *     ── School Name (scraped: N  db: N)  url
 *     [change summary lines]
 *     Applied N / N applicable changes
 *   Final summary:
 *     ── SUMMARY ──────────────────
 *     Processed : N schools
 *     Scraped   : N total coaches
 *     Changes   : N (added N, departed N, email N, role N)
 *     Applied   : N (0 in dry-run)
 *     Errors    : N
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { scrapeSchool, type ScrapeResult, type DetectedChange } from '../src/lib/coach-scraper'

// Load .env.local (same pattern as other scripts in this project)
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
}

// ── Supabase service client ───────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
})

// ── Arg parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

const DRY_RUN      = args.includes('--dry-run')
const INITIAL_SEED = args.includes('--initial-seed')

const schoolIdIdx = args.indexOf('--school-id')
const SCHOOL_ID   = schoolIdIdx !== -1 ? args[schoolIdIdx + 1] : null

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function changeLabel(c: DetectedChange): string {
  switch (c.changeType) {
    case 'coach_added': {
      const endowed = c.details.endowed_title ? `  endowed="${c.details.endowed_title}"` : ''
      return `     + coach_added    "${c.coachName}"  role=${c.details.role}  email=${c.details.email ?? 'none'}${endowed}` +
             `  → ${c.wouldApply ? 'WOULD INSERT' : 'needs review'}  [${c.wouldStatus}]`
    }
    case 'coach_departed':
      return `     - coach_departed "${c.coachName}"  role=${c.details.role}  → needs review  [manual]`
    case 'email_added':
      return `     ~ email_added    "${c.coachName}"  ${c.details.email_new}` +
             `  → ${c.wouldApply ? 'WOULD UPDATE' : 'needs review'}  [${c.wouldStatus}]`
    case 'email_changed':
      return `     ~ email_changed  "${c.coachName}"  ${c.details.email_before} → ${c.details.email_after}` +
             `  → needs review  [manual]`
    case 'role_changed':
      return `     ~ role_changed   "${c.coachName}"  "${c.details.role_before}" → "${c.details.role_after}"` +
             `  → needs review  [manual]`
    case 'name_changed':
      return `     ~ name_changed   "${c.details.name_before}" → "${c.details.name_after}"  → needs review  [manual]`
    default:
      return `     ? unknown change type`
  }
}

function printResult(r: ScrapeResult): void {
  const mode = DRY_RUN ? ' [DRY RUN]' : ''
  console.log(`\n── ${r.schoolName}${mode}`)
  console.log(`   URL: ${r.url}`)

  if (r.error) {
    console.log(`   ERROR: ${r.error}`)
    return
  }

  // ── Extracted roster (raw Haiku output) ──────────────────────────────────
  console.log(`\n   Extracted roster (${r.scrapedCoaches.length} coach${r.scrapedCoaches.length !== 1 ? 'es' : ''}):`)
  if (r.scrapedCoaches.length === 0) {
    console.log('     (none)')
  } else {
    r.scrapedCoaches.forEach((c, i) => {
      const email   = c.email ?? 'null'
      const phone   = c.phone ? `  phone=${c.phone}` : ''
      const endowed = c.endowedTitle ? `  [endowed: "${c.endowedTitle}"]` : ''
      console.log(`     ${i + 1}. ${c.name} — ${c.role} — ${email}${phone}${endowed}`)
    })
  }

  // ── Current DB roster ────────────────────────────────────────────────────
  console.log(`\n   Database: ${r.dbCoaches.length} coach${r.dbCoaches.length !== 1 ? 'es' : ''}${r.dbCoaches.length === 0 ? ' (none)' : ''}`)
  for (const c of r.dbCoaches) {
    const email = c.email ?? 'null'
    const primary = c.is_primary ? ' [primary]' : ''
    console.log(`     • ${c.name} — ${c.role} — ${email}${primary}`)
  }

  // ── Diff ─────────────────────────────────────────────────────────────────
  console.log('\n   Diff:')
  if (r.changes.length === 0) {
    console.log('     No changes detected')
  } else {
    for (const c of r.changes) {
      console.log(changeLabel(c))
    }
  }

  const applicable = r.changes.filter(c => c.wouldApply).length
  if (!DRY_RUN) {
    console.log(`\n   Applied ${r.appliedCount} / ${applicable} applicable changes`)
  } else if (applicable > 0) {
    console.log(`\n   Would apply ${applicable} / ${applicable} applicable changes (dry-run)`)
  }
}

// ── Summary counters ──────────────────────────────────────────────────────────

interface Tally {
  schools:      number
  scraped:      number
  added:        number
  departed:     number
  emailDiff:    number   // email_added + email_changed
  roleDiff:     number
  manualItems:  number   // changes with wouldStatus='manual' (queued for review UI)
  applied:      number
  haikuCalls:   number   // schools where fetch succeeded → Haiku was invoked
  errorSchools: { name: string; error: string }[]
}

function sumTally(tally: Tally, r: ScrapeResult): void {
  tally.schools++
  tally.scraped += r.scrapedCount

  if (r.error) {
    // Haiku was called if fetch succeeded but extraction failed
    if (r.error.includes('malformed') || r.error.includes('unparseable')) tally.haikuCalls++
    tally.errorSchools.push({ name: r.schoolName, error: r.error })
    return
  }

  tally.haikuCalls++  // fetch + extraction succeeded

  for (const c of r.changes) {
    if (c.changeType === 'coach_added')                                      tally.added++
    if (c.changeType === 'coach_departed')                                   tally.departed++
    if (c.changeType === 'email_added' || c.changeType === 'email_changed')  tally.emailDiff++
    if (c.changeType === 'role_changed')                                     tally.roleDiff++
    if (c.wouldStatus === 'manual')                                          tally.manualItems++
  }
  tally.applied += r.appliedCount
}

function printSummary(tally: Tally): void {
  const totalChanges = tally.added + tally.departed + tally.emailDiff + tally.roleDiff
  const mode = DRY_RUN ? ' (DRY RUN — nothing written)' : ''
  // Haiku 4.5: ~$0.80/MTok input, ~$4/MTok output. Typical page: ~2500 input + 300 output tokens.
  const estimatedCost = ((tally.haikuCalls * 2500 * 0.80) / 1_000_000) + ((tally.haikuCalls * 300 * 4.00) / 1_000_000)

  console.log('\n' + '─'.repeat(60))
  console.log('── SUMMARY' + mode)
  console.log('─'.repeat(60))
  console.log(`Processed  : ${tally.schools} schools`)
  console.log(`Scraped    : ${tally.scraped} total coaches found on pages`)
  console.log(`Applied    : ${tally.applied} coaches inserted/updated in DB`)
  console.log(`Changes    : ${totalChanges} (added ${tally.added}, departed ${tally.departed}, email ${tally.emailDiff}, role ${tally.roleDiff})`)
  console.log(`Review UI  : ${tally.manualItems} manual item${tally.manualItems !== 1 ? 's' : ''} queued`)
  console.log(`Errors     : ${tally.errorSchools.length}`)
  console.log(`Haiku calls: ${tally.haikuCalls}  (~$${estimatedCost.toFixed(3)} estimated)`)

  if (tally.errorSchools.length > 0) {
    console.log('\n── Schools with errors (coach_page_last_error populated) ───────')
    for (const { name, error } of tally.errorSchools) {
      console.log(`  ${name}`)
      console.log(`    ${error}`)
    }
  }

  if (INITIAL_SEED && !DRY_RUN) {
    console.log('\nInitial seed complete. coach_added + email_added written as status="seed".')
    console.log('Manual changes (departed, role, email_changed) queued in review UI.')
  }
  if (DRY_RUN) {
    console.log('\nTo apply changes, re-run without --dry-run.')
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const options = { dryRun: DRY_RUN, initialSeed: INITIAL_SEED }

  console.log('Coach roster scraper')
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${INITIAL_SEED ? ' + INITIAL SEED' : ''}`)
  if (SCHOOL_ID) console.log(`School filter: ${SCHOOL_ID}`)
  console.log()

  const tally: Tally = {
    schools: 0, scraped: 0, added: 0, departed: 0,
    emailDiff: 0, roleDiff: 0, manualItems: 0,
    applied: 0, haikuCalls: 0, errorSchools: [],
  }

  // ── Single-school mode ────────────────────────────────────────────────────

  if (SCHOOL_ID) {
    const result = await scrapeSchool(admin, SCHOOL_ID, options)
    printResult(result)
    sumTally(tally, result)
    printSummary(tally)
    return
  }

  // ── Multi-school mode: all schools with a coach_page_url ──────────────────

  const { data: allSchools, error: fetchErr } = await admin
    .from('schools')
    .select('id, name, coach_page_scrape_enabled')
    .not('coach_page_url', 'is', null)
    .order('name')

  if (fetchErr) {
    console.error('Failed to fetch schools:', fetchErr.message)
    process.exit(1)
  }

  if (!allSchools || allSchools.length === 0) {
    console.log('No schools have coach_page_url set. Run discover-coach-urls.ts first.')
    return
  }

  const schools = allSchools.filter(s => s.coach_page_scrape_enabled !== false)
  const skipped = allSchools.filter(s => s.coach_page_scrape_enabled === false)

  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} school(s) (scrape_enabled=false): ${skipped.map(s => s.name).join(', ')}`)
  }

  if (schools.length === 0) {
    console.log('All schools are skipped (scrape_enabled=false). Nothing to do.')
    return
  }

  console.log(`Found ${schools.length} school(s) with coach_page_url (${skipped.length} skipped)`)

  for (let i = 0; i < schools.length; i++) {
    if (i > 0) await sleep(2_000)  // rate limit: 2s between schools

    const result = await scrapeSchool(admin, schools[i].id, options)
    printResult(result)
    sumTally(tally, result)
  }

  printSummary(tally)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

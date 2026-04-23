/**
 * reparse-orphan-domains.ts
 *
 * Rescues existing partial contact_log rows that failed school matching
 * because their sender/recipient domain wasn't in our DB at parse time.
 * Now that schools.domains[] has been seeded, those rows can be resolved.
 *
 * Target rows:
 *   - parse_status = 'partial'
 *   - school_id IS NULL
 *   - parse_notes LIKE '%not in DB%'
 *     (captures both "Sender domain X not in DB" and "Recipient domain(s) X not in DB")
 *
 * Per row:
 *   1. Extract domain(s) from parse_notes text
 *   2. Look up domain in schools.domains[]
 *   3. If school found → try coach name match against schools coaches
 *   4. Update school_id, coach_id (if matched), parse_status, parse_notes
 *
 * Safety:
 *   - Never touches parse_status='parsed' rows
 *   - Never touches rows where school_id is already set
 *   - Rows with no domain signal in parse_notes are skipped unchanged
 *
 * Usage:
 *   npx tsx scripts/reparse-orphan-domains.ts --dry-run   ← preview, no writes
 *   npx tsx scripts/reparse-orphan-domains.ts             ← update rows in place
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ─── Env ──────────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const DRY_RUN = process.argv.includes('--dry-run')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Types ────────────────────────────────────────────────────────────────────

type SchoolRow = { id: string; name: string; domains: string[] }
type CoachRow  = { id: string; name: string; school_id: string }

type LogRow = {
  id:           string
  school_id:    string | null
  coach_id:     string | null
  coach_name:   string | null
  parse_status: string
  parse_notes:  string | null
  direction:    string
}

// ─── Domain extraction from parse_notes ───────────────────────────────────────
//
// Two note formats produced by gmail-resolve.ts:
//
//   Inbound:  Sender domain "jhu.edu" not in DB — school unknown; ...
//   Outbound: Recipient domain(s) jhu.edu, tufts.edu not in DB — school unknown; ...
//
// For inbound, the domain is quoted. For outbound, it's a bare comma-separated list.

function extractDomainsFromNotes(notes: string): string[] {
  const domains: string[] = []

  // Inbound format: Sender domain "jhu.edu" not in DB
  const inboundMatch = notes.match(/Sender domain "([^"]+)" not in DB/)
  if (inboundMatch) {
    domains.push(inboundMatch[1].toLowerCase().trim())
    return domains  // inbound has exactly one sender domain
  }

  // Outbound format: Recipient domain(s) jhu.edu, tufts.edu not in DB
  const outboundMatch = notes.match(/Recipient domain\(s\) ([^—–-]+) not in DB/)
  if (outboundMatch) {
    const rawList = outboundMatch[1]
    for (const d of rawList.split(',')) {
      const trimmed = d.trim().toLowerCase()
      if (trimmed) domains.push(trimmed)
    }
  }

  return domains
}

// ─── Coach name matching (mirrors gmail-resolve.ts logic) ─────────────────────
//
// Level 1: exact full-name match (case-insensitive)
// Level 2: last-name match (requires last token length > 1)
// Level 3: dropped (false positives — see gmail-resolve.ts comment)

function matchCoachByName(
  name:    string,
  coaches: CoachRow[],
): { coach: CoachRow; exact: boolean } | null {
  if (!name || coaches.length === 0) return null
  const lower      = name.toLowerCase().trim()
  const parsedLast = lower.split(/\s+/).at(-1) ?? ''

  const exact = coaches.find(c => c.name.toLowerCase() === lower)
  if (exact) return { coach: exact, exact: true }

  if (parsedLast.length > 1) {
    const lastMatch = coaches.find(
      c => c.name.toLowerCase().split(/\s+/).at(-1) === parsedLast
    )
    if (lastMatch) return { coach: lastMatch, exact: false }
  }

  return null
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nreparse-orphan-domains ${DRY_RUN ? '(DRY RUN — no writes)' : '(LIVE)'}`)
  console.log('='.repeat(60))

  // ── Fetch reference data ──────────────────────────────────────────────────

  const { data: schoolRows, error: schoolErr } = await supabase
    .from('schools')
    .select('id, name, domains')
  if (schoolErr) { console.error('Failed to fetch schools:', schoolErr.message); process.exit(1) }
  const schools = (schoolRows ?? []) as SchoolRow[]

  const { data: coachRows, error: coachErr } = await supabase
    .from('coaches')
    .select('id, name, school_id')
  if (coachErr) { console.error('Failed to fetch coaches:', coachErr.message); process.exit(1) }
  const coaches = (coachRows ?? []) as CoachRow[]

  // ── Fetch target rows ─────────────────────────────────────────────────────

  const { data: logRows, error: logErr } = await supabase
    .from('contact_log')
    .select('id, school_id, coach_id, coach_name, parse_status, parse_notes, direction')
    .eq('parse_status', 'partial')
    .is('school_id', null)
    .like('parse_notes', '%not in DB%')
    .order('created_at', { ascending: true })
  if (logErr) { console.error('Failed to fetch contact_log:', logErr.message); process.exit(1) }

  const rows = (logRows ?? []) as LogRow[]
  console.log(`\nFound ${rows.length} target rows (partial, school_id null, "not in DB" in notes)\n`)

  if (rows.length === 0) {
    console.log('Nothing to reparse.')
    return
  }

  // ── Per-row resolution ────────────────────────────────────────────────────

  const summary = { scanned: 0, schoolResolved: 0, upgradedToParsed: 0, unchanged: 0, errors: 0 }

  for (const row of rows) {
    summary.scanned++
    const shortId = row.id.slice(0, 8) + '…'

    // Extract domain(s) from parse_notes
    const domains = extractDomainsFromNotes(row.parse_notes ?? '')
    if (domains.length === 0) {
      console.log(`SKIP  ${shortId}`)
      console.log(`      No domain signal found in notes`)
      console.log(`      notes: ${(row.parse_notes ?? '').slice(0, 100)}`)
      console.log()
      summary.unchanged++
      continue
    }

    // Find matching school via schools.domains[]
    let matchedSchool: SchoolRow | null = null
    let matchedDomain: string | null    = null
    for (const domain of domains) {
      const school = schools.find(s => (s.domains ?? []).includes(domain))
      if (school) { matchedSchool = school; matchedDomain = domain; break }
    }

    if (!matchedSchool) {
      console.log(`SKIP  ${shortId}`)
      console.log(`      Domains [${domains.join(', ')}] not in schools.domains[] — no change`)
      console.log(`      notes: ${(row.parse_notes ?? '').slice(0, 100)}`)
      console.log()
      summary.unchanged++
      continue
    }

    // Attempt coach match using stored coach_name
    const schoolCoaches = coaches.filter(c => c.school_id === matchedSchool!.id)
    let newCoachId:   string | null = row.coach_id
    let coachNote:    string | null = null
    let coachMatched                = false

    if (row.coach_name && !row.coach_id) {
      const result = matchCoachByName(row.coach_name, schoolCoaches)
      if (result) {
        newCoachId   = result.coach.id
        coachNote    = `Coach "${row.coach_name}" matched to "${result.coach.name}" (${result.exact ? 'exact' : 'last-name'})`
        coachMatched = true
      } else {
        coachNote = `Coach "${row.coach_name}" still unmatched at ${matchedSchool.name} — manual review`
      }
    } else if (row.coach_id) {
      coachMatched = true  // coach was already resolved at parse time
    }

    // Determine new parse_status
    // 'parsed' requires school resolved (now yes) AND coach resolved
    const newStatus: 'parsed' | 'partial' = coachMatched ? 'parsed' : 'partial'

    // Compose new parse_notes — append resolution record
    const appendNote = [
      `Re-parsed via schools.domains[]: school resolved to "${matchedSchool.name}" (domain: ${matchedDomain})`,
      coachNote,
    ].filter(Boolean).join('; ')
    const newNotes = row.parse_notes
      ? row.parse_notes + '; ' + appendNote
      : appendNote

    // ── Print per-row diff ────────────────────────────────────────────────────

    const statusArrow = newStatus !== row.parse_status
      ? `${row.parse_status} → ${newStatus}`
      : row.parse_status

    console.log(`${newStatus === 'parsed' ? 'PARSED' : 'SCHOOL'} ${shortId}`)
    console.log(`      dir:    ${row.direction}`)
    console.log(`      domain: ${matchedDomain} → ${matchedSchool.name}`)
    console.log(`      coach:  ${row.coach_name ?? '(none)'} → coach_id ${newCoachId ? newCoachId.slice(0, 8) + '…' : 'null'}`)
    console.log(`      status: ${statusArrow}`)
    console.log(`      notes+: ${appendNote}`)
    console.log()

    if (!DRY_RUN) {
      const { error: updateErr } = await supabase
        .from('contact_log')
        .update({
          school_id:    matchedSchool.id,
          coach_id:     newCoachId,
          parse_status: newStatus,
          parse_notes:  newNotes,
        })
        .eq('id', row.id)

      if (updateErr) {
        console.error(`      ERROR: ${updateErr.message}`)
        summary.errors++
        continue
      }
    }

    summary.schoolResolved++
    if (newStatus === 'parsed') summary.upgradedToParsed++
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log('='.repeat(60))
  console.log(`Rows scanned:              ${summary.scanned}`)
  console.log(`Schools resolved:          ${summary.schoolResolved}`)
  console.log(`Upgraded to 'parsed':      ${summary.upgradedToParsed}`)
  console.log(`Unchanged (no domain hit): ${summary.unchanged}`)
  if (summary.errors > 0) console.log(`Errors:                    ${summary.errors}`)
  if (DRY_RUN && summary.schoolResolved > 0) console.log('\nRun without --dry-run to apply.')
}

main().catch(err => { console.error(err); process.exit(1) })

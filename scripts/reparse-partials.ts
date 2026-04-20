/**
 * reparse-partials.ts
 *
 * Fixes partial contact_log rows after school aliases are added (migration 016).
 * Does NOT re-parse raw_source. Instead, reads the school name that the original
 * webhook already extracted (stored in parse_notes as: No school match for
 * parsed name "...") and retries the DB match with the updated aliases.
 *
 * Usage:
 *   npx tsx scripts/reparse-partials.ts --dry-run   ← preview only, no writes
 *   npx tsx scripts/reparse-partials.ts             ← update rows in place
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ─── Load .env.local ──────────────────────────────────────────────────────────

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

// ─── School matching (mirrors webhook logic including aliases) ────────────────

type SchoolRow = { id: string; name: string; short_name: string | null; aliases: string[] }
type CoachRow  = { id: string; name: string }

let _schools: SchoolRow[] | null = null

async function getAllSchools(): Promise<SchoolRow[]> {
  if (_schools) return _schools
  const { data } = await supabase.from('schools').select('id, name, short_name, aliases')
  _schools = (data ?? []) as SchoolRow[]
  return _schools
}

async function matchSchool(parsedName: string): Promise<{ school: SchoolRow | null; matchType: string }> {
  const schools = await getAllSchools()
  const lower = parsedName.toLowerCase().trim()

  const exact = schools.find(s => s.name.toLowerCase() === lower)
  if (exact) return { school: exact, matchType: 'exact' }

  const shortExact = schools.find(s => s.short_name?.toLowerCase() === lower)
  if (shortExact) return { school: shortExact, matchType: 'short_name_exact' }

  const aliasMatch = schools.find(s => (s.aliases ?? []).some(a => a.toLowerCase() === lower))
  if (aliasMatch) return { school: aliasMatch, matchType: 'alias' }

  const nameContains = schools.find(s => s.name.toLowerCase().includes(lower))
  if (nameContains) return { school: nameContains, matchType: 'name_contains_parsed' }

  const parsedContainsName = schools.find(s => lower.includes(s.name.toLowerCase()))
  if (parsedContainsName) return { school: parsedContainsName, matchType: 'parsed_contains_name' }

  return { school: null, matchType: 'none' }
}

async function matchCoach(schoolId: string, coachName: string): Promise<{ coachId: string | null; matchType: string }> {
  const { data } = await supabase.from('coaches').select('id, name').eq('school_id', schoolId)
  const coaches = (data ?? []) as CoachRow[]
  if (coaches.length === 0) return { coachId: null, matchType: 'no_coaches_for_school' }

  const lower = coachName.toLowerCase().trim()
  const parsedLast = lower.split(/\s+/).at(-1) ?? ''

  const exact = coaches.find(c => c.name.toLowerCase() === lower)
  if (exact) return { coachId: exact.id, matchType: 'exact' }

  if (parsedLast.length > 1) {
    const lastMatch = coaches.find(c => c.name.toLowerCase().split(/\s+/).at(-1) === parsedLast)
    if (lastMatch) return { coachId: lastMatch.id, matchType: 'last_name' }
  }

  const contains = coaches.find(c => c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase()))
  if (contains) return { coachId: contains.id, matchType: 'contains' }

  return { coachId: null, matchType: 'none' }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nReparse partials ${DRY_RUN ? '(DRY RUN — no writes)' : '(LIVE)'}`)
  console.log('─'.repeat(60))

  const { data: partials, error } = await supabase
    .from('contact_log')
    .select('id, parse_notes, coach_name, source_thread_id')
    .eq('parse_status', 'partial')
    .order('created_at', { ascending: true })

  if (error) { console.error('Fetch error:', error.message); process.exit(1) }
  if (!partials || partials.length === 0) { console.log('No partial rows found.'); return }

  console.log(`Found ${partials.length} partial rows.\n`)

  let improved = 0
  let skipped  = 0

  for (const row of partials) {
    const parseNotes = row.parse_notes as string | null
    const coachName  = row.coach_name  as string | null

    // Extract the school name the original webhook already parsed.
    // parse_notes format: 'No school match for parsed name "University of California, Los Angeles"'
    const nameMatch = parseNotes?.match(/parsed name "([^"]+)"/)
    const parsedSchoolName = nameMatch?.[1] ?? null

    if (!parsedSchoolName) {
      console.log(`⏭️  Row ${(row.id as string).slice(0, 8)}… | thread=${row.source_thread_id ?? 'n/a'}`)
      console.log(`   Skipping — no extractable school name in parse_notes`)
      console.log(`   parse_notes: ${parseNotes ?? '(null)'}`)
      console.log()
      skipped++
      continue
    }

    const { school, matchType } = await matchSchool(parsedSchoolName)

    if (!school) {
      console.log(`⏭️  Row ${(row.id as string).slice(0, 8)}… | thread=${row.source_thread_id ?? 'n/a'}`)
      console.log(`   No match for "${parsedSchoolName}" — still partial`)
      console.log()
      skipped++
      continue
    }

    // Try to match coach using the name the original parser stored on the row
    let coachId: string | null = null
    let coachMatchNote: string | null = null
    if (coachName) {
      const { coachId: matched, matchType: cmt } = await matchCoach(school.id, coachName)
      coachId = matched
      if (matched && cmt !== 'exact') coachMatchNote = `Coach matched via ${cmt}: "${coachName}"`
      if (!matched) coachMatchNote = `No coach match for "${coachName}" — new coach, review later`
    }

    const newNotes: string[] = []
    if (matchType !== 'exact') newNotes.push(`School matched via ${matchType}: "${parsedSchoolName}" → "${school.name}"`)
    if (coachMatchNote) newNotes.push(coachMatchNote)

    console.log(`✅  Row ${(row.id as string).slice(0, 8)}… | thread=${row.source_thread_id ?? 'n/a'}`)
    console.log(`   "${parsedSchoolName}" → ${school.name} (${matchType})`)
    console.log(`   Coach: "${coachName ?? 'n/a'}" → ${coachId ? coachId.slice(0, 8) + '…' : 'null (new coach)'}`)
    if (newNotes.length) console.log(`   Notes: ${newNotes.join('; ')}`)
    console.log()

    if (!DRY_RUN) {
      const { error: updateError } = await supabase
        .from('contact_log')
        .update({
          school_id:    school.id,
          coach_id:     coachId,
          parse_status: 'parsed',
          parse_notes:  newNotes.length > 0 ? newNotes.join('; ') : null,
        })
        .eq('id', row.id)

      if (updateError) {
        console.error(`   ❌ Update failed: ${updateError.message}`)
        skipped++
        continue
      }
    }

    improved++
  }

  console.log('─'.repeat(60))
  console.log(`${DRY_RUN ? 'Would improve' : 'Improved'}: ${improved} rows`)
  console.log(`Skipped (no match or no extractable name): ${skipped} rows`)
  if (DRY_RUN && improved > 0) console.log('\nRun without --dry-run to apply.')
}

main().catch(err => { console.error(err); process.exit(1) })

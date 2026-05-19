/**
 * backfill-last-contact.ts
 *
 * Sets schools.last_contact = MAX(contact_log.date) for each school,
 * excluding orphan and non_coach rows. Only updates if the computed
 * date is newer than the existing last_contact.
 *
 * Usage:
 *   npx tsx scripts/backfill-last-contact.ts --dry-run
 *   npx tsx scripts/backfill-last-contact.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
}

const dryRun = process.argv.includes('--dry-run')

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch all contact_log rows grouped by school — we need MAX(date) per school
  const { data: rows, error } = await db
    .from('contact_log')
    .select('school_id, date')
    .not('school_id', 'is', null)
    .not('parse_status', 'in', '("orphan","non_coach")')
    .order('date', { ascending: false })

  if (error) { console.error('Query error:', error.message); process.exit(1) }

  // Group by school — keep max date per school
  const maxDates = new Map<string, string>()
  for (const row of rows ?? []) {
    if (!row.school_id || !row.date) continue
    if (!maxDates.has(row.school_id) || row.date > maxDates.get(row.school_id)!) {
      maxDates.set(row.school_id, row.date)
    }
  }

  // Fetch current schools state
  const { data: schools } = await db
    .from('schools')
    .select('id, name, last_contact')

  const schoolMap = new Map((schools ?? []).map(s => [s.id, s]))

  let updated = 0
  let skipped = 0

  for (const [schoolId, maxDate] of maxDates) {
    const school = schoolMap.get(schoolId)
    if (!school) continue

    const current = school.last_contact
    if (current && current >= maxDate) {
      skipped++
      continue
    }

    console.log(`  ${school.name}: ${current ?? 'null'} → ${maxDate}`)

    if (!dryRun) {
      const { error: updateErr } = await db
        .from('schools')
        .update({ last_contact: maxDate })
        .eq('id', schoolId)

      if (updateErr) {
        console.error(`    ERROR: ${updateErr.message}`)
      } else {
        updated++
      }
    } else {
      updated++
    }
  }

  // Count schools without any contact_log
  const noContact = (schools ?? []).filter(s => !maxDates.has(s.id)).length

  if (dryRun) {
    console.log(`\nDRY RUN — ${updated} would be updated, ${skipped} already current, ${noContact} have no contact_log rows.`)
  } else {
    console.log(`\nDone. Updated ${updated}, skipped ${skipped} (already current), ${noContact} have no contact_log rows.`)
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })

/**
 * backfill-reparse-partials.ts
 *
 * One-time backfill: for every school that has gmail partial rows, attempt
 * to re-link them to coaches now in the DB (added by the scraper since the
 * emails were originally parsed).
 *
 * Usage:
 *   npx tsx scripts/backfill-reparse-partials.ts --dry-run
 *   npx tsx scripts/backfill-reparse-partials.ts
 *
 * Flags:
 *   --dry-run   Show what would be rescued without writing to DB
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { reparsePartialsForSchool, type CoachRow } from '../src/lib/gmail-resolve'

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  console.log(`Gmail partials re-parse backfill${DRY_RUN ? ' [DRY RUN]' : ''}`)
  console.log()

  // Find all schools that have gmail partial rows
  const { data: partialRows, error: fetchErr } = await admin
    .from('contact_log')
    .select('school_id')
    .eq('parse_status', 'partial')
    .not('gmail_message_id', 'is', null)
    .not('school_id', 'is', null)

  if (fetchErr) {
    console.error('Failed to fetch partials:', fetchErr.message)
    process.exit(1)
  }

  const schoolIds = Array.from(new Set((partialRows ?? []).map(r => r.school_id as string)))
  console.log(`Found ${partialRows?.length ?? 0} gmail partial rows across ${schoolIds.length} school(s)`)
  console.log()

  if (schoolIds.length === 0) {
    console.log('Nothing to backfill.')
    return
  }

  // Fetch school names for display
  const { data: schools } = await admin
    .from('schools')
    .select('id, name')
    .in('id', schoolIds)

  const schoolNames: Record<string, string> = {}
  for (const s of schools ?? []) schoolNames[s.id] = s.name

  if (DRY_RUN) {
    // In dry-run: show what would be rescued without writing
    console.log('DRY RUN — showing matchable partials without writing to DB:')
    console.log()

    let totalChecked = 0
    let totalWouldRescue = 0

    for (const schoolId of schoolIds) {
      const { data: partials } = await admin
        .from('contact_log')
        .select('id, coach_name, direction')
        .eq('school_id', schoolId)
        .eq('parse_status', 'partial')
        .not('gmail_message_id', 'is', null)

      const { data: coaches } = await admin
        .from('coaches')
        .select('id, name, email, school_id')
        .eq('school_id', schoolId)

      const schoolCoaches = (coaches ?? []) as CoachRow[]
      const rows = partials ?? []
      totalChecked += rows.length

      let wouldRescue = 0
      for (const row of rows) {
        if (row.direction !== 'Inbound' || !row.coach_name) continue
        // Simple name match check
        const lower = row.coach_name.toLowerCase().trim()
        const last  = lower.split(/\s+/).at(-1) ?? ''
        const match = schoolCoaches.find(c =>
          c.name.toLowerCase() === lower ||
          (last.length > 1 && c.name.toLowerCase().split(/\s+/).at(-1) === last)
        )
        if (match) {
          wouldRescue++
          console.log(`  WOULD RESCUE: [${schoolNames[schoolId]}] "${row.coach_name}" → "${match.name}"`)
        }
      }
      totalWouldRescue += wouldRescue

      if (rows.length > 0) {
        console.log(`  ${schoolNames[schoolId]}: ${rows.length} partial(s), ${wouldRescue} matchable`)
      }
    }

    console.log()
    console.log(`Summary: checked ${totalChecked}, would rescue ${totalWouldRescue}`)
    console.log('Re-run without --dry-run to apply.')
    return
  }

  // Live run
  let totalChecked  = 0
  let totalRescued  = 0
  let schoolsWithRescues = 0

  for (const schoolId of schoolIds) {
    const { rescued, checked } = await reparsePartialsForSchool(admin, schoolId)
    totalChecked += checked
    totalRescued += rescued
    if (rescued > 0) schoolsWithRescues++

    const name = schoolNames[schoolId] ?? schoolId
    console.log(
      `  ${name}: checked ${checked}, rescued ${rescued}` +
      (rescued > 0 ? ' ✓' : '')
    )
  }

  console.log()
  console.log('─'.repeat(50))
  console.log(`Schools processed : ${schoolIds.length}`)
  console.log(`Schools with rescues: ${schoolsWithRescues}`)
  console.log(`Total checked    : ${totalChecked}`)
  console.log(`Total rescued    : ${totalRescued}`)
  console.log(`Remaining partials: ${totalChecked - totalRescued}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

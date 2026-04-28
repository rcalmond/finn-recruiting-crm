/**
 * verify-sent-at-backfill.ts
 *
 * Post-migration verification for 026_contact_log_sent_at.
 * Confirms backfill correctness and Stevens ordering fix.
 *
 * Usage: npx tsx scripts/verify-sent-at-backfill.ts
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

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Count of rows backfilled (sent_at NOT NULL)
  const { count: backfilled } = await db
    .from('contact_log')
    .select('*', { count: 'exact', head: true })
    .not('sent_at', 'is', null)

  const { count: nullRows } = await db
    .from('contact_log')
    .select('*', { count: 'exact', head: true })
    .is('sent_at', null)

  console.log('=== BACKFILL SUMMARY ===')
  console.log(`Rows with sent_at populated: ${backfilled}`)
  console.log(`Rows with sent_at still NULL: ${nullRows}`)
  console.log()

  // 2. Stevens Apr 22 — find the school
  const { data: stevens } = await db
    .from('schools')
    .select('id, name')
    .ilike('name', '%Stevens%')
    .limit(1)
    .single()

  if (stevens) {
    console.log('=== STEVENS APR 22 ORDERING ===')
    console.log(`School: ${stevens.name} (${stevens.id})`)

    const { data: stevensRows } = await db
      .from('contact_log')
      .select('id, date, direction, coach_name, created_at, sent_at, summary')
      .eq('school_id', stevens.id)
      .eq('date', '2026-04-22')
      .order('sent_at', { ascending: true })

    if (stevensRows && stevensRows.length > 0) {
      for (const row of stevensRows) {
        const preview = (row.summary ?? '').slice(0, 60).replace(/\n/g, ' ')
        console.log(`  [${row.direction}] date=${row.date} created_at=${row.created_at} sent_at=${row.sent_at}`)
        console.log(`    ${preview}...`)
        console.log()
      }
      // Check ordering: first row should be inbound
      const firstDir = stevensRows[0].direction
      console.log(`  First by sent_at: ${firstDir} — ${firstDir === 'Inbound' ? 'CORRECT (inbound before outbound)' : 'WRONG (outbound before inbound)'}`)
    } else {
      console.log('  No Apr 22 rows found for Stevens')
    }
  } else {
    console.log('Stevens not found — skipping specific verification')
  }
  console.log()

  // 3. Random 5 rows showing date / created_at / sent_at side by side
  console.log('=== SAMPLE ROWS (5 random) ===')
  const { data: sample } = await db
    .from('contact_log')
    .select('date, created_at, sent_at, direction, school_id')
    .not('sent_at', 'is', null)
    .limit(5)

  if (sample) {
    for (const row of sample) {
      console.log(`  date=${row.date}  created_at=${row.created_at}  sent_at=${row.sent_at}  dir=${row.direction}`)
    }
  }
  console.log()

  // 4. Any date boundary anomalies? Rows where sent_at's date (in Denver) != the date column
  console.log('=== DATE BOUNDARY CHECK ===')
  console.log('(Checking if any sent_at dates in Mountain time differ from the date column)')
  const { data: allRows } = await db
    .from('contact_log')
    .select('id, date, sent_at')
    .not('sent_at', 'is', null)

  let mismatches = 0
  if (allRows) {
    for (const row of allRows) {
      if (!row.sent_at) continue
      // Convert sent_at to Mountain time date
      const sentDate = new Date(row.sent_at)
      const mtDate = sentDate.toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
      if (mtDate !== row.date) {
        mismatches++
        if (mismatches <= 3) {
          console.log(`  MISMATCH: id=${row.id} date=${row.date} sent_at_mt=${mtDate} sent_at_utc=${row.sent_at}`)
        }
      }
    }
  }
  console.log(`  Total mismatches: ${mismatches} (expected: 0 or very few edge cases near midnight)`)

  console.log('\nDone.')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })

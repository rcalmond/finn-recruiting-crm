/**
 * reclassify-camp-proposals.ts
 *
 * One-time backfill: reclassifies pending "update existing camp" proposals
 * using the new materiality classifier. Material proposals get an
 * update_summary; immaterial ones get rejected.
 *
 * Usage:
 *   npx tsx scripts/reclassify-camp-proposals.ts --dry-run
 *   npx tsx scripts/reclassify-camp-proposals.ts
 */

import { createClient } from '@supabase/supabase-js'
import { classifyCampUpdate } from '../src/lib/camp-extractor'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const dryRun = process.argv.includes('--dry-run')

interface ProposalRow {
  id: string
  host_school_id: string
  matched_camp_id: string
  proposed_data: {
    name: string
    start_date: string
    attendee_school_ids: string[]
  }
}

async function run() {
  console.log(dryRun ? '=== DRY RUN ===' : '=== LIVE RUN ===')
  console.log()

  // Fetch all pending proposals with a matched camp
  const { data: proposals, error } = await supabase
    .from('camp_proposals')
    .select('id, host_school_id, matched_camp_id, proposed_data')
    .eq('status', 'pending')
    .not('matched_camp_id', 'is', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Failed to fetch proposals:', error.message)
    process.exit(1)
  }

  const rows = (proposals ?? []) as ProposalRow[]
  console.log(`Found ${rows.length} pending proposals with matched_camp_id`)
  console.log()

  // Fetch host school names for display
  const hostIds = [...new Set(rows.map(r => r.host_school_id))]
  const { data: hostSchools } = await supabase
    .from('schools')
    .select('id, name, short_name')
    .in('id', hostIds)

  const schoolNames = new Map(
    ((hostSchools ?? []) as Array<{ id: string; name: string; short_name: string | null }>)
      .map(s => [s.id, s.short_name || s.name])
  )

  const material: Array<{ id: string; host: string; campName: string; summary: string }> = []
  const immaterial: Array<{ id: string; host: string; campName: string }> = []

  for (const row of rows) {
    const result = await classifyCampUpdate(
      supabase,
      row.matched_camp_id,
      { attendee_school_ids: row.proposed_data.attendee_school_ids ?? [] },
      row.host_school_id,
    )

    const hostName = schoolNames.get(row.host_school_id) ?? row.host_school_id
    const campName = row.proposed_data.name ?? '(unnamed)'

    if (result.material) {
      material.push({ id: row.id, host: hostName, campName, summary: result.updateSummary! })
    } else {
      immaterial.push({ id: row.id, host: hostName, campName })
    }
  }

  // Print summary
  console.log(`--- Material (keep pending, add update_summary): ${material.length} ---`)
  for (const m of material) {
    console.log(`  ${m.id}  ${m.host} — ${m.campName}`)
    console.log(`    update_summary: "${m.summary}"`)
  }
  if (material.length === 0) console.log('  (none)')

  console.log()
  console.log(`--- Immaterial (reject): ${immaterial.length} ---`)
  for (const m of immaterial) {
    console.log(`  ${m.id}  ${m.host} — ${m.campName}`)
  }
  if (immaterial.length === 0) console.log('  (none)')

  console.log()
  console.log(`Total: ${material.length} material + ${immaterial.length} immaterial = ${rows.length}`)

  if (dryRun) {
    console.log()
    console.log('Dry run complete. No changes written.')
    return
  }

  // Apply changes
  let updated = 0
  let rejected = 0

  for (const m of material) {
    const { error: err } = await supabase
      .from('camp_proposals')
      .update({ update_summary: m.summary })
      .eq('id', m.id)

    if (err) {
      console.error(`  Failed to update ${m.id}:`, err.message)
    } else {
      updated++
    }
  }

  for (const m of immaterial) {
    const { error: err } = await supabase
      .from('camp_proposals')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', m.id)

    if (err) {
      console.error(`  Failed to reject ${m.id}:`, err.message)
    } else {
      rejected++
    }
  }

  console.log()
  console.log(`Done: ${updated} updated with summary, ${rejected} rejected.`)
}

run().catch(err => {
  console.error('Script failed:', err)
  process.exit(1)
})

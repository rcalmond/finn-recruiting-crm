/**
 * backfill-recruiting-stage.ts
 *
 * One-time backfill: compute stage floors for all schools, apply manual seeds
 * where higher than floor, seed milestones for known cases.
 *
 * Usage:
 *   npx tsx scripts/backfill-recruiting-stage.ts              # dry run
 *   npx tsx scripts/backfill-recruiting-stage.ts --apply       # write to DB
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const admin = createClient(supabaseUrl, supabaseServiceKey)

const dryRun = !process.argv.includes('--apply')

// Manual seeds: schools that should be at stage 4+ (coach evaluation evidence)
const MANUAL_SEEDS: Record<string, { stage: number; reason: string }> = {
  'Illinois Institute of Technology (Illinois Tech)': {
    stage: 4,
    reason: 'Camp evaluation + pre-read initiated by Coach Milkent',
  },
  'University of Rochester': {
    stage: 4,
    reason: 'Camp attended, written evaluation from Streb, board placement statements',
  },
  'CO School of Mines': {
    stage: 4,
    reason: 'Full evaluation at ID camp (Feb 2026, striker era), decline letter with assessment',
  },
}

// Milestone seeds
const MILESTONE_SEEDS: Array<{
  schoolName: string
  milestone: string
  occurred_on: string
  note: string
}> = [
  {
    schoolName: 'University of Rochester',
    milestone: 'seen_live',
    occurred_on: '2026-06-20',
    note: 'Rochester prospect clinic — Streb, Cross, Crawford all watched',
  },
  {
    schoolName: 'University of Rochester',
    milestone: 'written_evaluation',
    occurred_on: '2026-06-29',
    note: 'Written eval from Streb via SR: strong defender, confident in 1v1s, timing of tackles, aerial presence area to improve',
  },
  {
    schoolName: 'Illinois Institute of Technology (Illinois Tech)',
    milestone: 'pre_read_requested',
    occurred_on: '2026-07-12',
    note: 'Coach Milkent sent application link and asked Finn to submit — pre-read process initiated',
  },
]

async function main() {
  console.log(dryRun ? '🔍  DRY RUN — no writes\n' : '✏️  APPLY MODE — writing to DB\n')

  // Fetch all schools
  const { data: schools, error: schoolsErr } = await admin
    .from('schools')
    .select('id, name, category, status, recruiting_stage')
    .order('category')
    .order('name')

  if (schoolsErr || !schools) {
    console.error('Failed to fetch schools:', schoolsErr)
    process.exit(1)
  }

  const results: Array<{ name: string; category: string; current: number; floor: number; final: number; reason: string }> = []

  for (const school of schools) {
    const current = school.recruiting_stage ?? 1

    // Compute floor from contact_log
    const { count: inboundCount } = await admin
      .from('contact_log')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', school.id)
      .eq('direction', 'Inbound')
      .in('parse_status', ['full', 'partial'])
      .in('authored_by', ['coach_personal', 'coach_via_platform'])
      .limit(1)

    const { count: outboundCount } = await admin
      .from('contact_log')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', school.id)
      .eq('direction', 'Outbound')
      .in('parse_status', ['full', 'partial'])
      .limit(1)

    let floor = 1
    if (inboundCount && inboundCount > 0) floor = 3
    else if (outboundCount && outboundCount > 0) floor = 2

    // Apply manual seed if higher
    const seed = MANUAL_SEEDS[school.name]
    const manualStage = seed ? seed.stage : 0
    const final = Math.max(floor, manualStage, current)

    results.push({
      name: school.name,
      category: school.category,
      current,
      floor,
      final,
      reason: seed ? seed.reason : (floor > current ? 'auto-floor' : 'no change'),
    })

    if (!dryRun && final !== current) {
      const { error } = await admin
        .from('schools')
        .update({ recruiting_stage: final })
        .eq('id', school.id)
      if (error) console.error(`  ❌ Failed to update ${school.name}:`, error.message)
    }
  }

  // Print results table
  console.log('School'.padEnd(50) + 'Tier  Cur  Floor  Final  Reason')
  console.log('─'.repeat(100))
  for (const r of results) {
    const changed = r.final !== r.current
    const marker = changed ? ' ←' : ''
    console.log(
      r.name.slice(0, 48).padEnd(50) +
      r.category.padEnd(6) +
      String(r.current).padEnd(5) +
      String(r.floor).padEnd(7) +
      String(r.final).padEnd(7) +
      r.reason + marker
    )
  }

  const changedCount = results.filter(r => r.final !== r.current).length
  console.log(`\n${changedCount} school(s) ${dryRun ? 'would change' : 'updated'}`)

  // Seed milestones
  if (MILESTONE_SEEDS.length > 0) {
    console.log(`\n── Milestones ──`)
    for (const seed of MILESTONE_SEEDS) {
      // Look up school_id
      const { data: sch } = await admin
        .from('schools')
        .select('id')
        .eq('name', seed.schoolName)
        .single()

      if (!sch) {
        console.log(`  ⚠️  School not found: ${seed.schoolName}`)
        continue
      }

      console.log(`  ${seed.schoolName}: ${seed.milestone} (${seed.occurred_on})`)

      if (!dryRun) {
        const { error } = await admin
          .from('school_milestones')
          .upsert(
            {
              school_id: sch.id,
              milestone: seed.milestone,
              occurred_on: seed.occurred_on,
              note: seed.note,
            },
            { onConflict: 'school_id,milestone' }
          )
        if (error) console.error(`    ❌ Failed:`, error.message)
        else console.log(`    ✅ Upserted`)
      }
    }
  }

  console.log(dryRun ? '\nRe-run with --apply to write.' : '\n✅ Done.')
}

main().catch(console.error)

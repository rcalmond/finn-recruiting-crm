/**
 * cleanup-duplicate-proposals.ts
 *
 * Finds and removes duplicate pending (status='manual') coach_changes proposals.
 * For each set of rows sharing the same (school_id, change_type, coach_id, details signature),
 * keeps the OLDEST row and deletes the rest.
 *
 * Also reports Nope-tier school pending proposals for Issue 3 cleanup.
 *
 * Usage:
 *   npx tsx scripts/cleanup-duplicate-proposals.ts          # dry run (default)
 *   npx tsx scripts/cleanup-duplicate-proposals.ts --apply   # delete duplicates
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

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

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const apply = process.argv.includes('--apply')

interface CoachChange {
  id: string
  school_id: string
  change_type: string
  coach_id: string | null
  details: Record<string, unknown>
  status: string
  created_at: string
}

function signatureKey(row: CoachChange): string {
  const d = row.details
  switch (row.change_type) {
    case 'coach_departed':
      return `${row.school_id}|${row.change_type}|${row.coach_id}`
    case 'email_changed':
      return `${row.school_id}|${row.change_type}|${row.coach_id}|${d.email_before}→${d.email_after}`
    case 'email_added':
      return `${row.school_id}|${row.change_type}|${row.coach_id}|${d.email_new}`
    case 'role_changed':
      return `${row.school_id}|${row.change_type}|${row.coach_id}|${d.role_before}→${d.role_after}`
    case 'name_changed':
      return `${row.school_id}|${row.change_type}|${row.coach_id}|${d.name_before}→${d.name_after}`
    case 'coach_added':
      return `${row.school_id}|${row.change_type}|${d.name}|${d.role}`
    default:
      return `${row.school_id}|${row.change_type}|${row.coach_id}|${JSON.stringify(d)}`
  }
}

async function main() {
  console.log(apply ? '🔴 APPLY MODE — will delete duplicates\n' : '🟡 DRY RUN — showing what would be deleted\n')

  // 1. Fetch all pending proposals
  const { data: pending, error } = await admin
    .from('coach_changes')
    .select('id, school_id, change_type, coach_id, details, status, created_at')
    .eq('status', 'manual')
    .order('created_at', { ascending: true })

  if (error) { console.error('Failed to fetch:', error.message); return }
  if (!pending || pending.length === 0) { console.log('No pending proposals found.'); return }

  console.log(`Total pending proposals: ${pending.length}\n`)

  // 2. Group by signature
  const groups = new Map<string, CoachChange[]>()
  for (const row of pending as CoachChange[]) {
    const key = signatureKey(row)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  // 3. Find duplicates (groups with > 1 row)
  const toDelete: string[] = []
  let dupGroupCount = 0

  for (const [key, rows] of groups) {
    if (rows.length <= 1) continue
    dupGroupCount++
    const keep = rows[0] // oldest
    const dupes = rows.slice(1)
    console.log(`  DUP GROUP: ${key}`)
    console.log(`    Keep: ${keep.id} (${keep.created_at})`)
    for (const d of dupes) {
      console.log(`    Delete: ${d.id} (${d.created_at})`)
      toDelete.push(d.id)
    }
    console.log()
  }

  console.log(`\nDuplicate groups: ${dupGroupCount}`)
  console.log(`Rows to delete: ${toDelete.length}`)
  console.log(`Rows to keep: ${pending.length - toDelete.length}\n`)

  // 4. Check Nope-tier school proposals
  const { data: schools } = await admin
    .from('schools')
    .select('id, name, category, status')

  const schoolMap = new Map((schools ?? []).map((s: { id: string; name: string; category: string; status: string }) => [s.id, s]))

  const nopeProposals: CoachChange[] = []
  const inactiveProposals: CoachChange[] = []
  for (const row of pending as CoachChange[]) {
    const school = schoolMap.get(row.school_id)
    if (!school) continue
    if (school.category === 'Nope') nopeProposals.push(row)
    else if (school.status === 'Inactive') inactiveProposals.push(row)
  }

  if (nopeProposals.length > 0) {
    console.log(`\n--- Nope-tier school pending proposals (${nopeProposals.length}): ---`)
    for (const r of nopeProposals) {
      const school = schoolMap.get(r.school_id)
      const alreadyInDeleteList = toDelete.includes(r.id)
      console.log(`  ${r.id} | ${school?.name} | ${r.change_type} | ${(r.details as Record<string, unknown>).name ?? r.coach_id}${alreadyInDeleteList ? ' (already dup)' : ''}`)
    }
    // Add non-duplicate Nope proposals to delete list
    for (const r of nopeProposals) {
      if (!toDelete.includes(r.id)) toDelete.push(r.id)
    }
  }

  if (inactiveProposals.length > 0) {
    console.log(`\n--- Inactive school pending proposals (${inactiveProposals.length}): ---`)
    for (const r of inactiveProposals) {
      const school = schoolMap.get(r.school_id)
      console.log(`  ${r.id} | ${school?.name} | ${r.change_type} | ${(r.details as Record<string, unknown>).name ?? r.coach_id}`)
    }
    for (const r of inactiveProposals) {
      if (!toDelete.includes(r.id)) toDelete.push(r.id)
    }
  }

  console.log(`\nFinal delete count: ${toDelete.length}`)

  // 5. Karl Schroeder investigation
  console.log('\n--- Karl Schroeder investigation ---')
  const { data: karlCoach } = await admin
    .from('coaches')
    .select('id, name, role, is_active, needs_review, school_id')
    .ilike('name', '%schroeder%')

  if (karlCoach && karlCoach.length > 0) {
    for (const k of karlCoach) {
      const school = schoolMap.get(k.school_id)
      console.log(`  Coach record: ${k.id} | ${k.name} | role=${k.role} | is_active=${k.is_active} | needs_review=${k.needs_review} | school=${school?.name}`)
    }
  } else {
    console.log('  No coach record found matching "schroeder"')
  }

  const { data: karlChanges } = await admin
    .from('coach_changes')
    .select('id, change_type, details, status, created_at')
    .or('details->>name.ilike.%schroeder%,details->>name.ilike.%Schroeder%')
    .order('created_at', { ascending: true })

  if (karlChanges && karlChanges.length > 0) {
    console.log(`  Proposals (${karlChanges.length}):`)
    for (const c of karlChanges) {
      console.log(`    ${c.id} | ${c.change_type} | ${c.status} | ${c.created_at} | ${JSON.stringify(c.details)}`)
    }
  }

  // 6. Delete if --apply
  if (apply && toDelete.length > 0) {
    console.log(`\nDeleting ${toDelete.length} rows...`)
    // Batch in groups of 50
    for (let i = 0; i < toDelete.length; i += 50) {
      const batch = toDelete.slice(i, i + 50)
      const { error: delErr } = await admin
        .from('coach_changes')
        .delete()
        .in('id', batch)
      if (delErr) {
        console.error(`  Delete batch ${i} failed:`, delErr.message)
      } else {
        console.log(`  Deleted batch ${i + 1}-${i + batch.length}`)
      }
    }
    console.log('Done.')
  } else if (!apply && toDelete.length > 0) {
    console.log('\nRun with --apply to delete.')
  }
}

main().catch(console.error)

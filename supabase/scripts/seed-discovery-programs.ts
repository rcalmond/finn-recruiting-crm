/**
 * seed-discovery-programs.ts (one-shot, 2026-08-08)
 *
 * Populates discovery_schools.programs (migration 062) using the shared
 * deterministic rules in program-tags.ts. Best-effort; absence = unknown.
 *
 * Idempotent: recomputes and writes `programs` for every row from its current
 * facets. Re-runnable. Reports per-program counts + spot-checks at the end.
 *
 * Run: npx tsx supabase/scripts/seed-discovery-programs.ts
 */
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { programTags } from './program-tags'

const envPath = path.resolve(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue
  const i = t.indexOf('='); if (i === -1) continue
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim()
  if (!process.env[k]) process.env[k] = v
}

const PROGRAMS = ['engineering', 'business', 'computer_science', 'premed_health', 'nursing', 'education']

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Page through all rows (PostgREST caps at 1000/req).
  const all: { id: string; name: string; enrollment_band: string | null; academic_band: string | null; has_engineering: boolean }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from('discovery_schools')
      .select('id, name, enrollment_band, academic_band, has_engineering')
      .order('id').range(from, from + 999)
    if (error) { console.error(error.message); process.exit(1) }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
  }
  console.log(`Tagging ${all.length} schools…`)

  const counts: Record<string, number> = Object.fromEntries(PROGRAMS.map(p => [p, 0]))
  let updated = 0
  for (const r of all) {
    const tags = programTags(r.name, r.enrollment_band, r.academic_band, r.has_engineering)
    for (const t of tags) counts[t]++
    const { error } = await admin.from('discovery_schools').update({ programs: tags }).eq('id', r.id)
    if (error) { console.error(`update ${r.name}:`, error.message); continue }
    updated++
  }

  console.log(`\nUpdated ${updated}/${all.length}. Per-program tag counts:`)
  for (const p of PROGRAMS) console.log(`  ${p.padEnd(18)} ${counts[p]}  (${Math.round(counts[p] / all.length * 100)}%)`)

  // Spot-checks
  console.log('\nSpot-checks:')
  const checks = ['Clark', 'Babson', 'Northeastern', 'Williams', 'Amherst', 'Colby']
  for (const name of checks) {
    const { data } = await admin.from('discovery_schools').select('name, programs').ilike('name', `%${name}%`).limit(2)
    for (const row of data ?? []) console.log(`  ${row.name}: [${(row.programs ?? []).join(', ')}]`)
  }
}
main()

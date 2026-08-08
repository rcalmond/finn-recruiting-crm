/**
 * fix-colorado-mines-name.ts  (one-shot, 2026-08-08)
 *
 * Fixes the "Find more like your list" exclusion miss on Colorado School of Mines.
 *
 * Root cause: the working row was stored as "CO School of Mines", which the
 * discovery name-matcher normalizes to the token set {co, school, mines}. The
 * universe row is "Colorado School of Mines" → {colorado, school, mines}. The
 * two differ only by co↔colorado, so the working name neither exact-matched nor
 * resolved to the universe id — so the LLM's "Colorado School of Mines" proposal
 * was never excluded.
 *
 * Fix (data level): rename the working row to its canonical name so it
 * normalizes to the same token set as the universe row (id-bridge + exact-name
 * both now exclude it), and give it a distinct short_name from South Dakota
 * Mines. No normalizer change is required once the names align.
 *
 * Run once:  npx tsx supabase/scripts/fix-colorado-mines-name.ts
 */
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const envPath = path.resolve(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue
  const i = t.indexOf('='); if (i === -1) continue
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim()
  if (!process.env[k]) process.env[k] = v
}

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: row } = await admin
    .from('schools')
    .select('id, name, short_name')
    .eq('name', 'CO School of Mines')
    .maybeSingle()

  if (!row) {
    console.log('No "CO School of Mines" row found — already renamed or absent. Nothing to do.')
    return
  }

  const { error } = await admin
    .from('schools')
    .update({ name: 'Colorado School of Mines', short_name: 'Colorado Mines' })
    .eq('id', row.id)

  if (error) { console.error('Update failed:', error.message); process.exit(1) }
  console.log(`Renamed ${row.id}: "${row.name}" (short "${row.short_name}") → "Colorado School of Mines" (short "Colorado Mines")`)
}
main()

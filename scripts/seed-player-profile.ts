/**
 * seed-player-profile.ts
 *
 * One-shot script to parse the current resume asset and populate the
 * player_profile singleton row. Run once after migration 025 is applied.
 *
 * Usage:
 *   npx tsx scripts/seed-player-profile.ts
 *   npx tsx scripts/seed-player-profile.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ── Load .env.local ───────────────────────────────────────────────────────────
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

  // Find current resume asset
  const { data: resume, error: resumeErr } = await db
    .from('assets')
    .select('id, name, storage_path, file_name')
    .eq('type', 'resume')
    .eq('is_current', true)
    .limit(1)
    .single()

  if (resumeErr || !resume) {
    console.error('No current resume asset found. Upload a resume first.')
    process.exit(1)
  }

  console.log(`Found resume: "${resume.name}" (${resume.file_name})`)
  console.log(`  storage_path: ${resume.storage_path}`)
  console.log(`  asset id: ${resume.id}`)

  // Always parse — dry-run inspects output, live run upserts it
  const { parseResume } = await import('../src/lib/asset-parsers')

  console.log('\nParsing resume with Haiku...')
  const result = await parseResume(resume.storage_path)

  console.log('\nParsed result:')
  console.log(JSON.stringify(result, null, 2))

  if (dryRun) {
    console.log('\nDRY RUN — no DB changes made. Re-run without --dry-run to upsert.')
    process.exit(0)
  }

  // Upsert into player_profile
  const { data: existing } = await db
    .from('player_profile')
    .select('id')
    .limit(1)
    .single()

  if (existing) {
    const { error } = await db
      .from('player_profile')
      .update({
        current_stats: result.current_stats,
        upcoming_schedule: result.upcoming_schedule,
        highlights: result.highlights,
        academic_summary: result.academic_summary,
        source_asset_id: resume.id,
        last_parsed_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

    if (error) throw error
    console.log('\nUpdated existing player_profile row.')
  } else {
    const { error } = await db
      .from('player_profile')
      .insert({
        current_stats: result.current_stats,
        upcoming_schedule: result.upcoming_schedule,
        highlights: result.highlights,
        academic_summary: result.academic_summary,
        source_asset_id: resume.id,
        last_parsed_at: new Date().toISOString(),
      })

    if (error) throw error
    console.log('\nInserted new player_profile row.')
  }

  console.log('Done.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

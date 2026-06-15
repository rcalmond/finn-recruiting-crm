/**
 * backfill-conversation-summaries.ts
 *
 * Generate initial conversation summaries for all active A/B/C schools
 * so the ConversationSummaryCard isn't blank on first visit.
 *
 * Usage:
 *   npx tsx scripts/backfill-conversation-summaries.ts              # real run
 *   npx tsx scripts/backfill-conversation-summaries.ts --dry-run    # print without writing
 *   npx tsx scripts/backfill-conversation-summaries.ts --school "University of Rochester"
 *   npx tsx scripts/backfill-conversation-summaries.ts --school "94d63466-..."
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { generateConversationSummary } from '../src/lib/school-conversation-summary-generator'

// ── Load .env.local ───────────────────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Parse args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const schoolIdx = args.indexOf('--school')
const schoolFilter = schoolIdx >= 0 ? args[schoolIdx + 1] : null

async function main() {
  // Fetch eligible schools
  let query = admin.from('schools')
    .select('id, name, short_name, category, status')
    .in('category', ['A', 'B', 'C'])
    .neq('status', 'Inactive')
    .order('category')
    .order('name')

  if (schoolFilter) {
    // Try as UUID first, then as name match
    if (schoolFilter.match(/^[0-9a-f]{8}-/)) {
      query = query.eq('id', schoolFilter)
    } else {
      query = query.ilike('name', `%${schoolFilter}%`)
    }
  }

  const { data: schools, error } = await query
  if (error) {
    console.error('Failed to fetch schools:', error.message)
    process.exit(1)
  }

  if (!schools || schools.length === 0) {
    console.log('No eligible schools found.')
    return
  }

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Processing ${schools.length} schools...\n`)

  let generated = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < schools.length; i++) {
    const school = schools[i]
    const label = `[${i + 1}/${schools.length}] ${school.category} · ${school.name}`

    try {
      const result = await generateConversationSummary(admin, school.id)

      if (!result) {
        console.log(`${label} — SKIPPED (generator returned null)`)
        skipped++
        continue
      }

      console.log(`\n${label}`)
      console.log(`  Summary: ${result.summary}`)
      console.log(`  Action:  [${result.recommended_action.category}] ${result.recommended_action.description}`)
      console.log(`  Reason:  ${result.recommended_action.rationale}`)
      if (result.recommended_action.source_message_ids?.length) {
        console.log(`  Sources: ${result.recommended_action.source_message_ids.join(', ')}`)
      }
      console.log(`  Tokens:  ${result.input_tokens} in / ${result.output_tokens} out`)

      if (!dryRun) {
        // Find most recent contact_log id
        const { data: latestRow } = await admin
          .from('contact_log')
          .select('id')
          .eq('school_id', school.id)
          .not('parse_status', 'in', '("orphan","non_coach")')
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const { error: upsertErr } = await admin
          .from('school_conversation_summary')
          .upsert({
            school_id: school.id,
            summary: result.summary,
            recommended_action: result.recommended_action,
            last_contact_log_id: latestRow?.id ?? null,
            generated_at: new Date().toISOString(),
            model_used: 'claude-opus-4-7',
            input_tokens: result.input_tokens,
            output_tokens: result.output_tokens,
          }, { onConflict: 'school_id' })

        if (upsertErr) {
          console.log(`  ❌ UPSERT FAILED: ${upsertErr.message}`)
          failed++
          continue
        }
        console.log(`  ✓ Stored`)
      }

      generated++
    } catch (err) {
      console.log(`${label} — ❌ ERROR: ${err instanceof Error ? err.message : String(err)}`)
      failed++
    }

    // Rate limit: 1 call/sec
    if (i < schools.length - 1) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Done. Generated: ${generated} | Skipped: ${skipped} | Failed: ${failed}`)
  if (dryRun) console.log('(DRY RUN — nothing written to database)')
}

main().catch(console.error)

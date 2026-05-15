/**
 * backfill-message-coverage.ts
 *
 * Processes all existing outbound contact_log rows through the message
 * coverage detector and inserts matches into school_message_log.
 *
 * Usage:
 *   npx tsx scripts/backfill-message-coverage.ts --dry-run
 *   npx tsx scripts/backfill-message-coverage.ts
 *
 * Rate-limited to 1 call/sec to avoid Anthropic rate limits.
 * Expected cost: ~$0.01/row (Sonnet 4.6 pricing).
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { detectMessageCoverage, fetchActiveMessages } from '../src/lib/message-coverage-detector'
import type { Message } from '../src/lib/types'

// ── Load .env.local ───────────────────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
}

const dryRun = process.argv.includes('--dry-run')

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  console.log(`Message coverage backfill${dryRun ? ' (DRY RUN)' : ''}`)
  console.log('')

  // Fetch active messages once
  const activeMessages = await fetchActiveMessages(admin)
  console.log(`Active messages in inventory: ${activeMessages.length}`)
  if (activeMessages.length === 0) {
    console.log('No active messages — nothing to detect against.')
    return
  }

  // Fetch all outbound rows with school_id and substantial body
  const { data: rows, error } = await admin
    .from('contact_log')
    .select('id, school_id, summary, date, schools(name, short_name)')
    .eq('direction', 'Outbound')
    .not('school_id', 'is', null)
    .not('summary', 'is', null)
    .order('date', { ascending: true })

  if (error) {
    console.error('Query error:', error.message)
    process.exit(1)
  }

  // Filter to rows with >= 50 chars summary
  const eligible = (rows ?? []).filter((r: Record<string, unknown>) =>
    typeof r.summary === 'string' && (r.summary as string).length >= 50
  )

  console.log(`Eligible outbound rows: ${eligible.length}`)
  console.log('')

  let totalMatches = 0
  let processed = 0

  for (const row of eligible) {
    processed++
    const school = row.schools as { name: string; short_name: string | null } | null
    const schoolName = school?.name ?? 'Unknown'
    const schoolShortName = school?.short_name ?? null

    if (processed % 5 === 0 || processed === 1) {
      console.log(`Processing ${processed}/${eligible.length} rows, ${totalMatches} matches so far...`)
    }

    const detected = await detectMessageCoverage({
      sentBody: row.summary as string,
      school: { id: row.school_id as string, name: schoolName, short_name: schoolShortName },
      activeMessages: activeMessages as Message[],
    })

    if (detected.matchedMessageIds.length > 0) {
      totalMatches += detected.matchedMessageIds.length
      const matchTitles = detected.matchedMessageIds.map(id => {
        const msg = (activeMessages as Message[]).find(m => m.id === id)
        return msg?.title ?? id.slice(0, 8)
      })
      console.log(`  [${row.date}] ${schoolName}: ${matchTitles.join(', ')}`)

      if (!dryRun) {
        for (const messageId of detected.matchedMessageIds) {
          const { error: upsertErr } = await admin.from('school_message_log').upsert({
            message_id: messageId,
            school_id: row.school_id as string,
            contact_log_id: row.id as string,
            detection_source: 'auto',
            notes: detected.reasoning.substring(0, 500),
          }, { onConflict: 'message_id,school_id,contact_log_id' })
          if (upsertErr) console.error(`    Upsert failed: ${upsertErr.message}`)
        }
      }
    }

    // Rate limit: 1 second between calls
    await new Promise(r => setTimeout(r, 1000))
  }

  console.log('')
  console.log(`Done. Processed ${processed} rows, found ${totalMatches} total message matches.`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

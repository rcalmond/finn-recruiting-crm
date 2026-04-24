/**
 * backfill-inbound-classification.ts
 *
 * Classifies all unclassified inbound contact_log rows using Haiku.
 * Idempotent: only touches rows where classified_at IS NULL unless
 * --reclassify-all is passed.
 *
 * Usage:
 *   npx tsx scripts/backfill-inbound-classification.ts --dry-run
 *   npx tsx scripts/backfill-inbound-classification.ts
 *   npx tsx scripts/backfill-inbound-classification.ts --reclassify-all
 *
 * Cost target: <$0.10 for ~100 rows (Haiku pricing ~$0.00025/1K input tokens).
 * Throttles to 5 calls/sec to avoid Anthropic rate limits.
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { classifyInbound, type Classification } from '../src/lib/classify-inbound'

// ── Load .env.local ───────────────────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
const anthropicKey = process.env.ANTHROPIC_API_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!anthropicKey) {
  console.error('Missing ANTHROPIC_API_KEY')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

const DRY_RUN        = process.argv.includes('--dry-run')
const RECLASSIFY_ALL = process.argv.includes('--reclassify-all')
const RATE_LIMIT_MS  = 200   // 5 calls/sec
const BODY_TRUNCATE  = 1500  // chars — already enforced in classifier, belt+suspenders

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// Rough token estimate: 1 token ≈ 4 chars. System prompt ~600 tokens, input ~400.
const TOKEN_ESTIMATE_PER_CALL = 1050  // input tokens (system + user)
const OUTPUT_TOKENS_PER_CALL  = 80
// Haiku pricing: $0.80/M input, $4.00/M output
const COST_PER_CALL = (TOKEN_ESTIMATE_PER_CALL * 0.80 + OUTPUT_TOKENS_PER_CALL * 4.00) / 1_000_000

async function main() {
  console.log(`Inbound classification backfill${DRY_RUN ? ' [DRY RUN]' : ''}${RECLASSIFY_ALL ? ' [RECLASSIFY ALL]' : ''}`)
  console.log()

  // Fetch rows to classify
  let query = admin
    .from('contact_log')
    .select('id, school_id, coach_name, summary, raw_source, channel')
    .eq('direction', 'Inbound')

  if (!RECLASSIFY_ALL) {
    query = query.is('classified_at', null)
  }

  const { data: rows, error: fetchErr } = await query.order('date', { ascending: false })

  if (fetchErr) {
    console.error('Failed to fetch rows:', fetchErr.message)
    process.exit(1)
  }

  // Fetch school names for context
  const schoolIds = Array.from(new Set((rows ?? []).map((r: { school_id: string }) => r.school_id).filter(Boolean)))
  const { data: schools } = schoolIds.length > 0
    ? await admin.from('schools').select('id, name').in('id', schoolIds)
    : { data: [] }
  const schoolNames: Record<string, string> = {}
  for (const s of schools ?? []) schoolNames[s.id] = s.name

  const total = (rows ?? []).length
  console.log(`Rows to classify: ${total}`)
  console.log(`Estimated cost:   $${(total * COST_PER_CALL).toFixed(4)}`)
  console.log()

  if (total === 0) { console.log('Nothing to classify.'); return }

  if (DRY_RUN) {
    console.log('DRY RUN — would classify the following rows:')
    for (const r of (rows ?? []).slice(0, 10)) {
      console.log(`  id=${r.id} coach_name="${r.coach_name ?? ''}" summary="${((r.summary ?? '') as string).slice(0, 80)}…"`)
    }
    if (total > 10) console.log(`  …and ${total - 10} more`)
    console.log()
    console.log('Re-run without --dry-run to apply.')
    return
  }

  // Classification distribution
  const dist: Record<string, Record<string, number>> = {}
  let classified = 0
  let errors     = 0
  let lowConf    = 0

  for (const row of (rows ?? [])) {
    const input = {
      summary:     ((row.summary ?? '') as string).slice(0, BODY_TRUNCATE),
      coach_name:  (row.coach_name ?? null) as string | null,
      school_name: schoolNames[(row.school_id as string)] ?? null,
      raw_source:  ((row.raw_source ?? null) as string | null)?.slice(0, 2000) ?? null,
      channel:     (row.channel ?? null) as string | null,
    }

    const result: Classification = await classifyInbound(input)

    const authoredBy = result.authored_by
    const intent     = result.intent

    if (!dist[authoredBy]) dist[authoredBy] = {}
    dist[authoredBy][intent] = (dist[authoredBy][intent] ?? 0) + 1

    if (result.confidence === 'low') lowConf++

    const { error: updateErr } = await admin
      .from('contact_log')
      .update({
        authored_by:               result.authored_by,
        intent:                    result.intent,
        classification_confidence: result.confidence,
        classification_notes:      result.notes,
        classified_at:             new Date().toISOString(),
      })
      .eq('id', row.id)

    if (updateErr) {
      console.error(`  ERROR updating ${row.id}: ${updateErr.message}`)
      errors++
    } else {
      classified++
      console.log(
        `  [${classified}/${total}] ${authoredBy} × ${intent} (${result.confidence})` +
        ` | "${result.notes.slice(0, 60)}"` +
        ` | school=${schoolNames[(row.school_id as string)] ?? '?'}`
      )
    }

    // Rate limit: 5 calls/sec
    await sleep(RATE_LIMIT_MS)
  }

  // Summary
  console.log()
  console.log('─'.repeat(60))
  console.log(`Classified: ${classified} / ${total}`)
  console.log(`Errors:     ${errors}`)
  console.log(`Low-conf:   ${lowConf} (${Math.round(lowConf / total * 100)}%)`)
  console.log(`Cost est:   $${(classified * COST_PER_CALL).toFixed(4)}`)
  console.log()
  console.log('Distribution (authored_by × intent):')
  for (const [authored, intents] of Object.entries(dist).sort()) {
    for (const [intent, count] of Object.entries(intents).sort()) {
      console.log(`  ${authored.padEnd(22)} × ${intent.padEnd(16)} = ${count}`)
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

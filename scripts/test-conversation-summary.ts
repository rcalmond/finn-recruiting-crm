/**
 * Test script: generate conversation summaries for specific schools and print output.
 *
 * Usage:
 *   npx tsx scripts/test-conversation-summary.ts
 *   npx tsx scripts/test-conversation-summary.ts "University of Rochester"
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

const DEFAULT_SCHOOLS = ['University of Rochester', 'CO School of Mines', 'RIT']

async function main() {
  const schoolNames = process.argv.length > 2
    ? [process.argv.slice(2).join(' ')]
    : DEFAULT_SCHOOLS

  for (const name of schoolNames) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`SCHOOL: ${name}`)
    console.log('='.repeat(60))

    const { data: school } = await admin
      .from('schools')
      .select('id, name, category')
      .ilike('name', `%${name}%`)
      .limit(1)
      .maybeSingle()

    if (!school) {
      console.log(`  ❌ Not found in database`)
      continue
    }

    console.log(`  ID: ${school.id} | Tier: ${school.category}`)

    try {
      const result = await generateConversationSummary(admin, school.id)
      if (!result) {
        console.log(`  ⚠ Generator returned null (non-target tier or missing data)`)
        continue
      }

      console.log(`\n  SUMMARY:`)
      console.log(`  ${result.summary}`)
      console.log(`\n  RECOMMENDED ACTION:`)
      console.log(`  Category: ${result.recommended_action.category}`)
      console.log(`  Description: ${result.recommended_action.description}`)
      console.log(`  Rationale: ${result.recommended_action.rationale}`)
      if (result.recommended_action.source_message_ids?.length) {
        console.log(`  Source message IDs: ${result.recommended_action.source_message_ids.join(', ')}`)
      }
      console.log(`\n  Tokens: ${result.input_tokens} in / ${result.output_tokens} out`)
    } catch (err) {
      console.error(`  ❌ Error:`, err)
    }

    // Rate limit between schools
    if (schoolNames.indexOf(name) < schoolNames.length - 1) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }
}

main().catch(console.error)

/**
 * Reproduce the Washington University generation failure.
 * Calls buildEmailDraftPrompt + Anthropic API and dumps raw output.
 */

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'

const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
}

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Find Washington University
  const { data: school } = await admin
    .from('schools').select('id, name').ilike('name', '%Washington%').limit(1).single()

  if (!school) { console.error('Washington University not found'); process.exit(1) }
  console.log(`School: ${school.name} (${school.id})`)

  // Find primary coach
  const { data: coaches } = await admin
    .from('coaches').select('id, name, role, is_primary')
    .eq('school_id', school.id).order('sort_order')

  const coach = (coaches ?? []).find((c: any) => c.is_primary) ?? (coaches ?? [])[0]
  console.log(`Coach: ${coach?.name ?? 'none'} (${coach?.id ?? 'none'})`)

  const { buildEmailDraftPrompt } = await import('../src/lib/prompts')

  const { system, user } = await buildEmailDraftPrompt(admin, {
    schoolId: school.id,
    coachId: coach?.id ?? null,
    context: 'individual',
    // No brief or topic — same as the Going Cold "Draft check-in" flow
  })

  console.log('\n--- Calling Haiku ---\n')

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: user }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''

  console.log('STOP REASON:', message.stop_reason)
  console.log('OUTPUT TOKENS:', message.usage.output_tokens)
  console.log('\nRAW MODEL OUTPUT (char count:', raw.length, '):\n')
  console.log('---BEGIN---')
  console.log(raw)
  console.log('---END---')

  // Attempt parse
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  console.log('\nCLEANED (char count:', cleaned.length, '):\n')
  console.log('---BEGIN---')
  console.log(cleaned)
  console.log('---END---')

  try {
    const parsed = JSON.parse(cleaned)
    console.log('\nPARSE: SUCCESS')
    console.log('subject:', parsed.subject)
    console.log('body length:', parsed.body?.length)
  } catch (e) {
    console.log('\nPARSE: FAILED')
    console.log('Error:', (e as Error).message)

    // Show the character around the parse failure
    const match = (e as Error).message.match(/position (\d+)/)
    if (match) {
      const pos = parseInt(match[1])
      console.log(`\nContext around position ${pos}:`)
      console.log(`  ...${cleaned.slice(Math.max(0, pos - 40), pos)}<<<HERE>>>${cleaned.slice(pos, pos + 40)}...`)
    }
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })

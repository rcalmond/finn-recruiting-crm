/**
 * Test generation: calls buildEmailDraftPrompt + Anthropic API
 * for Lafayette fresh mode with the wingback/ID camp brief.
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

  const { data: school } = await admin
    .from('schools').select('id').ilike('name', '%Lafayette%').limit(1).single()
  const { data: coach } = await admin
    .from('coaches').select('id').eq('school_id', school!.id).ilike('name', '%Robinson%').limit(1).single()

  const { buildEmailDraftPrompt } = await import('../src/lib/prompts')

  const { system, user } = await buildEmailDraftPrompt(admin, {
    schoolId: school!.id,
    coachId: coach!.id,
    brief: 'Learn about how they use wingbacks to determine if an ID camp makes sense',
    context: 'individual',
  })

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: user }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()

  try {
    const parsed = JSON.parse(cleaned)
    console.log('SUBJECT:', parsed.subject)
    console.log('\nBODY:')
    console.log(parsed.body)
  } catch {
    console.log('RAW OUTPUT:')
    console.log(cleaned)
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })

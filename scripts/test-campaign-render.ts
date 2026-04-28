/**
 * Quick render of buildEmailDraftPrompt with context='campaign' to verify
 * the output format section says body-only, not JSON.
 */

import { createClient } from '@supabase/supabase-js'
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

  const { data: school } = await admin
    .from('schools')
    .select('id')
    .ilike('name', '%Lafayette%')
    .limit(1)
    .single()

  const { data: coach } = await admin
    .from('coaches')
    .select('id')
    .eq('school_id', school!.id)
    .ilike('name', '%Robinson%')
    .limit(1)
    .single()

  const { buildEmailDraftPrompt } = await import('../src/lib/prompts')

  const fakeTemplate = `Coach {{coach_last_name}},

I'm Finn Almond, a 2027 left wingback with Albion SC Boulder County – MLS NEXT Academy U19. [Finn: add school-specific note about why this program interests you]

[Finn: add current stats, highlights, or recent results]

Here's my highlight reel: https://www.youtube.com/watch?v=Va_Z09OYcs0

Are you recruiting left wingbacks for 2027?

Thank you,
Finn Almond
finnalmond08@gmail.com
(720) 687-8982`

  const { system, user } = await buildEmailDraftPrompt(admin, {
    schoolId: school!.id,
    coachId: coach!.id,
    context: 'campaign',
    campaignTemplate: fakeTemplate,
  })

  // Print only the OUTPUT FORMAT section from system prompt
  const outputIdx = system.indexOf('OUTPUT FORMAT:')
  if (outputIdx >= 0) {
    console.log('=== SYSTEM PROMPT — OUTPUT FORMAT SECTION ===\n')
    console.log(system.slice(outputIdx))
  } else {
    console.log('OUTPUT FORMAT section not found in system prompt!')
    console.log('\n=== FULL SYSTEM PROMPT (last 500 chars) ===\n')
    console.log(system.slice(-500))
  }

  // Print the campaign template section from user prompt
  console.log('\n=== USER PROMPT — CAMPAIGN TEMPLATE SECTION ===\n')
  const templateIdx = user.indexOf('Campaign template')
  if (templateIdx >= 0) {
    console.log(user.slice(templateIdx))
  } else {
    console.log('Campaign template section not found. Full user prompt:\n')
    console.log(user)
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })

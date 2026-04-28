/**
 * test-prompt-render.ts
 *
 * Renders the v2 prompt builder output for Lafayette and dumps
 * system/user prompts + voice references to stdout.
 *
 * Bootstraps migration 025 (player_profile table + get_voice_references
 * function) via service role if not already applied, then seeds the
 * profile from the current resume.
 *
 * Usage: npx tsx scripts/test-prompt-render.ts
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

/** Run raw SQL via Supabase's postgres REST endpoint (service role). */
async function runSQL(sql: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const res = await fetch(`${url}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
    // This won't work — rpc needs an existing function name.
    // Fall back to pg-meta SQL endpoint.
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`SQL exec failed: ${res.status} ${await res.text()}`)
}

async function ensureMigration(admin: ReturnType<typeof createClient>): Promise<void> {
  // Check if player_profile table exists by attempting a select
  const { error: checkErr } = await admin
    .from('player_profile')
    .select('id')
    .limit(1)

  if (!checkErr) {
    console.log('[bootstrap] player_profile table exists')
  } else {
    console.log('[bootstrap] player_profile table missing — creating via pg-meta...')
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

    // Use Supabase pg-meta SQL endpoint
    const migrationSQL = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/025_player_profile.sql'),
      'utf8'
    )

    const res = await fetch(`${url}/pg/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ query: migrationSQL }),
    })

    if (!res.ok) {
      const body = await res.text()
      // If pg/query doesn't exist, try the older endpoint
      console.log(`[bootstrap] pg/query failed (${res.status}), trying alternative...`)

      // Alternative: use supabase-js to call a helper function
      // Since we can't run DDL easily, fall back to just checking if the
      // function exists via rpc
      const { error: rpcErr } = await admin.rpc('get_voice_references')
      if (rpcErr?.message?.includes('Could not find')) {
        console.log('[bootstrap] get_voice_references function also missing.')
        console.log('[bootstrap] Cannot apply migration programmatically.')
        console.log('[bootstrap] Will use inline queries as fallback.\n')
        return
      }
    } else {
      console.log('[bootstrap] Migration 025 applied successfully')
    }
  }

  // Also check if get_voice_references exists
  const { error: rpcErr } = await admin.rpc('get_voice_references')
  if (rpcErr?.message?.includes('Could not find')) {
    console.log('[bootstrap] get_voice_references function missing (table may exist but function not)')
  } else {
    console.log('[bootstrap] get_voice_references function exists')
  }
}

async function seedProfile(admin: ReturnType<typeof createClient>): Promise<boolean> {
  // Check if already seeded
  const { data: existing } = await admin
    .from('player_profile')
    .select('id, last_parsed_at')
    .limit(1)
    .single()

  if (existing?.last_parsed_at) {
    console.log('[seed] player_profile already populated, skipping parse')
    return true
  }

  // Find current resume
  const { data: resume } = await admin
    .from('assets')
    .select('id, storage_path')
    .eq('type', 'resume')
    .eq('is_current', true)
    .limit(1)
    .single()

  if (!resume?.storage_path) {
    console.log('[seed] No current resume found — profile will be empty')
    return false
  }

  console.log('[seed] Parsing resume...')
  const { parseResume } = await import('../src/lib/asset-parsers')
  const result = await parseResume(resume.storage_path)

  if (existing) {
    await admin.from('player_profile').update({
      current_stats: result.current_stats,
      upcoming_schedule: result.upcoming_schedule,
      highlights: result.highlights,
      academic_summary: result.academic_summary,
      source_asset_id: resume.id,
      last_parsed_at: new Date().toISOString(),
    }).eq('id', existing.id)
  } else {
    await admin.from('player_profile').insert({
      current_stats: result.current_stats,
      upcoming_schedule: result.upcoming_schedule,
      highlights: result.highlights,
      academic_summary: result.academic_summary,
      source_asset_id: resume.id,
      last_parsed_at: new Date().toISOString(),
    })
  }

  console.log('[seed] player_profile populated')
  return true
}

/** Fallback: fetch voice references directly if the RPC function doesn't exist. */
async function getVoiceRefsDirect(admin: ReturnType<typeof createClient>) {
  const { data } = await admin
    .from('contact_log')
    .select('summary, date, school_id')
    .eq('direction', 'Outbound')
    .gte('date', '2025-11-01')
    .eq('parse_status', 'full')
    .not('summary', 'is', null)
    .order('date', { ascending: false })
    .limit(50) // fetch more, filter by length in JS

  if (!data) return []

  // Filter by length > 100 (can't do length() in supabase-js easily)
  const filtered = data.filter(r => (r.summary?.length ?? 0) > 100).slice(0, 15)

  // Resolve school names
  const schoolIds = [...new Set(filtered.map(r => r.school_id).filter(Boolean))]
  const { data: schools } = await admin
    .from('schools')
    .select('id, name')
    .in('id', schoolIds)

  const schoolMap = new Map((schools ?? []).map(s => [s.id, s.name]))

  return filtered.map(r => ({
    summary: r.summary,
    date: r.date,
    school_name: schoolMap.get(r.school_id) ?? 'Unknown',
    coach_name: null as string | null, // direct query doesn't join coaches
  }))
}

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  await ensureMigration(admin)

  // Check if table exists now
  const { error: tableCheck } = await admin.from('player_profile').select('id').limit(1)
  const tableExists = !tableCheck
  let profileSeeded = false

  if (tableExists) {
    profileSeeded = await seedProfile(admin)
  } else {
    console.log('[bootstrap] player_profile table not available — will render with empty profile')
  }

  // Check if RPC works
  const { data: rpcData, error: rpcErr } = await admin.rpc('get_voice_references')
  const rpcWorks = !rpcErr
  console.log(`[bootstrap] RPC works: ${rpcWorks}`)
  console.log()

  // ── Find Lafayette + Coach Robinson ───────────────────────────────────────
  const { data: school } = await admin
    .from('schools')
    .select('id, name, short_name, category, division, conference, location, notes, status')
    .ilike('name', '%Lafayette%')
    .limit(1)
    .single()

  if (!school) { console.error('Lafayette not found'); process.exit(1) }

  const { data: coaches } = await admin
    .from('coaches')
    .select('id, name, role, email, is_primary, needs_review')
    .eq('school_id', school.id)
    .order('sort_order')

  const coach = (coaches ?? []).find(c => c.name.includes('Robinson'))
    ?? (coaches ?? []).find(c => c.is_primary)
    ?? (coaches ?? [])[0]

  if (!coach) { console.error('No coach found'); process.exit(1) }

  console.log(`School: ${school.name} (${school.id})`)
  console.log(`Coach: ${coach.name} (${coach.role}) — needs_review=${coach.needs_review}`)
  for (const c of coaches ?? []) {
    console.log(`  ${c.name} — ${c.role}${c.is_primary ? ' [primary]' : ''} needs_review=${c.needs_review}`)
  }

  // ── Decide rendering strategy ─────────────────────────────────────────────
  // If RPC and table work, use buildEmailDraftPrompt directly.
  // Otherwise, manually assemble the prompt using the same logic.

  if (rpcWorks && profileSeeded) {
    // Happy path — use the real prompt builder
    console.log('\n--- Using buildEmailDraftPrompt directly ---\n')
    const { buildEmailDraftPrompt, buildTopicSuggestPrompt } = await import('../src/lib/prompts')

    const { system, user } = await buildEmailDraftPrompt(admin, {
      schoolId: school.id,
      coachId: coach.id,
      brief: undefined,
      selectedTopic: undefined,
      context: 'individual',
    })

    printSection('SECTION 1: buildEmailDraftPrompt — SYSTEM PROMPT', system)
    printSection('SECTION 2: buildEmailDraftPrompt — USER PROMPT', user)

    // Token estimate
    const totalChars = system.length + user.length
    const estTokens = Math.ceil(totalChars / 4)
    console.log('='.repeat(80))
    console.log('TOKEN ESTIMATE')
    console.log('='.repeat(80))
    console.log(`System prompt: ${system.length} chars`)
    console.log(`User prompt: ${user.length} chars`)
    console.log(`Total: ${totalChars} chars ≈ ${estTokens} tokens (at 4 chars/token)`)
    console.log()

    // Topic suggest
    const { system: tSys, user: tUsr } = await buildTopicSuggestPrompt(admin, school.id, coach.id)
    printSection('SECTION 3: buildTopicSuggestPrompt — SYSTEM PROMPT', tSys)
    printSection('SECTION 3b: buildTopicSuggestPrompt — USER PROMPT', tUsr)

  } else {
    // Fallback — manually assemble using direct queries
    console.log('\n--- RPC or profile not available; assembling manually ---\n')

    // Fetch profile (may be null)
    const { data: profile } = tableExists
      ? await admin.from('player_profile').select('*').limit(1).single()
      : { data: null }

    // Fetch voice refs via direct query
    const voiceRefs = await getVoiceRefsDirect(admin)
    console.log(`[data] ${voiceRefs.length} voice references fetched via direct query`)

    // Fetch contact log
    const { data: contactRows } = await admin
      .from('contact_log')
      .select('date, direction, channel, coach_name, summary, authored_by, intent')
      .eq('school_id', school.id)
      .not('parse_status', 'in', '("orphan","non_coach")')
      .order('date', { ascending: false })
      .limit(5)

    // ── Assemble system prompt (same logic as buildEmailDraftPrompt) ───────
    const sys: string[] = []
    sys.push(`You are drafting an email from Finn Almond, a 2027 left wingback at Albion SC Colorado MLS NEXT Academy U19, to a college soccer coach.`)
    sys.push('')

    if (voiceRefs.length > 0) {
      sys.push(`STYLE REFERENCE — Finn's recent writing voice (use these to match tone, structure, phrasing patterns):`)
      for (const ref of voiceRefs) {
        sys.push(`--- [${ref.date}] to ${ref.school_name}${ref.coach_name ? ` (${ref.coach_name})` : ''} ---`)
        sys.push(stripSig(ref.summary))
        sys.push('')
      }
    }

    sys.push(`PLAYER PROFILE — the ONLY authoritative source for stats, schedule, and academic claims:`)
    if (profile) {
      sys.push(`Current stats: ${profile.current_stats ?? '[not available — use [TODO: stats] if needed]'}`)
      sys.push(`Upcoming schedule: ${profile.upcoming_schedule ?? '[not available — use [TODO: schedule] if needed]'}`)
      sys.push(`Highlights: ${profile.highlights ?? '[not available — use [TODO: highlights] if needed]'}`)
      sys.push(`Academic: ${profile.academic_summary ?? '[not available — use [TODO: academic info] if needed]'}`)
    } else {
      sys.push(`[No player profile parsed yet. Use [TODO: <description>] for any stats, schedule, or academic claims.]`)
    }
    sys.push('')

    sys.push(`HARD RULES:
- Never state a stat, schedule item, or academic detail not present in the player profile above. If you'd need to reference something that isn't in the profile, write [TODO: <description>] instead.
- Never quote or paraphrase the coach's prior message back to them.
- Never assert future commitments (camp attendance, visits, calls) unless explicitly stated in the brief or selected topic.
- Keep under 200 words.
- Match the voice references — short paragraphs, direct tone, no chest-thumping, no marketing language.
- No bullet points in the email body — short paragraphs only.
- No more than one exclamation point per email.
- Never open with "I hope this email finds you well" or any filler.
- Always include highlight reel link: https://www.youtube.com/watch?v=Va_Z09OYcs0
- Always include position (Left Wingback), grad year (2027), club (Albion SC Colorado MLS NEXT Academy).
- Never include game film unless the coach specifically asked for it.
- Ignore markdown link syntax artifacts (e.g. [text](url)) that appear in voice reference emails — produce clean text with plain URLs.
- Sign off: Thank you, Finn Almond, finnalmond08@gmail.com, (720) 687-8982, Sports Recruits: https://my.sportsrecruits.com/athlete/finn_almond`)
    sys.push('')

    sys.push(`STALENESS HANDLING:
- Recent (<=30 days): Continue the conversation naturally. Reference last contact if relevant.
- Cooling (31-90 days): Acknowledge gap briefly. Lead with what's new since last contact.
- Stale (>90 days): Reintroduce. Don't assume coach remembers specifics. Reference position transition (striker to wingback, Nov 2025) since that's a meaningful change since most stale threads.
- No prior inbound: This is a cold or follow-up outreach. Lead with who Finn is and why this school.`)
    sys.push('')

    sys.push(`COACH HEDGING:
- If the coach has needs_review=true, use a generic professional salutation ("Coach,") rather than confidently addressing them by name — they may have departed.`)
    sys.push('')

    sys.push(`OUTPUT FORMAT:
Respond ONLY with valid JSON. No preamble, no markdown fences.
{ "subject": "Finn Almond | Left Wingback | Class of 2027 | [School Name]", "body": "..." }
Exception: if this is a reply (brief or topic indicates replying), match the existing thread subject.
Body uses plain line breaks between paragraphs, no HTML.`)

    const systemPrompt = sys.join('\n')

    // ── Assemble user prompt ──────────────────────────────────────────────
    const usr: string[] = []
    usr.push(`Drafting an email to:`)
    usr.push(`School: ${school.name} (Tier ${school.category}, ${school.division}${school.conference ? ` — ${school.conference}` : ''}, ${school.location ?? 'location unknown'})`)
    if (school.notes) usr.push(`School notes: ${school.notes}`)
    usr.push(`Coach: ${coach.name} (${coach.role ?? 'role unknown'})${coach.needs_review ? ' — needs_review=true, may have departed' : ''}`)
    usr.push('')

    const history = contactRows ?? []
    if (history.length > 0) {
      usr.push(`Recent conversation (${history.length} entries, most recent first):`)
      for (const row of history) {
        const summary = stripSig(row.summary ?? '')
        usr.push(`  [${row.date}] ${row.direction} via ${row.channel}${row.coach_name ? ` — ${row.coach_name}` : ''}:`)
        usr.push(`    ${summary.slice(0, 300)}`)
      }
      usr.push('')
    }

    // Classification
    const classifiedInbound = history.find(
      (r: any) => r.direction === 'Inbound' && r.authored_by
    )
    if (classifiedInbound) {
      usr.push(`Most recent inbound classification:`)
      usr.push(`  authored_by: ${classifiedInbound.authored_by ?? 'unknown'}`)
      usr.push(`  intent: ${classifiedInbound.intent ?? 'unknown'}`)
      usr.push('')
    }

    // Staleness
    const recentInbound = history.find(
      (r: any) => r.direction === 'Inbound' &&
        r.authored_by !== 'team_automated' &&
        r.authored_by !== 'staff_non_coach'
    )
    if (recentInbound) {
      const days = Math.floor(
        (Date.now() - new Date(recentInbound.date).getTime()) / (1000 * 60 * 60 * 24)
      )
      const label = days <= 30 ? 'Recent' : days <= 90 ? 'Cooling' : 'Stale'
      usr.push(`Conversation staleness: ${label} (${days} days since last meaningful inbound)`)
    } else {
      usr.push(`Conversation staleness: No prior inbound`)
    }
    usr.push('')
    usr.push(`Generate the email. Return only the JSON. Use [TODO: x] for any content that requires Finn input not in the profile.`)

    const userPrompt = usr.join('\n')

    printSection('SECTION 1: SYSTEM PROMPT (manually assembled, matches buildEmailDraftPrompt logic)', systemPrompt)
    printSection('SECTION 2: USER PROMPT', userPrompt)

    // Token estimate
    const totalChars = systemPrompt.length + userPrompt.length
    const estTokens = Math.ceil(totalChars / 4)
    console.log('='.repeat(80))
    console.log('TOKEN ESTIMATE')
    console.log('='.repeat(80))
    console.log(`System prompt: ${systemPrompt.length} chars`)
    console.log(`User prompt: ${userPrompt.length} chars`)
    console.log(`Total: ${totalChars} chars ≈ ${estTokens} tokens (at 4 chars/token)`)
    console.log()
  }

  // ── Section 4: Voice references ───────────────────────────────────────────
  const voiceRefs = rpcWorks
    ? ((rpcData ?? []) as Array<{ summary: string; date: string; school_name: string; coach_name: string | null }>)
    : await getVoiceRefsDirect(admin)

  printSection('SECTION 4: Voice reference emails (15 entries)', '')
  for (const ref of voiceRefs) {
    const preview = ref.summary.slice(0, 200)
    console.log(`[${ref.date}] ${ref.school_name}${ref.coach_name ? ` (${ref.coach_name})` : ''}`)
    console.log(`  ${preview}`)
    console.log()
  }
  console.log(`Total voice references: ${voiceRefs.length}`)
  console.log('\nDone.')
}

function printSection(title: string, content: string) {
  console.log('\n' + '='.repeat(80))
  console.log(title)
  console.log('='.repeat(80) + '\n')
  console.log(content)
}

/** Strip coach signature blocks — same logic as prompts.ts */
function stripSig(summary: string): string {
  const lines = summary.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (/^(?:Head|Interim Head|Associate Head|Assistant|Interim Assistant)\s+(?:Men['']?s\s+)?(?:Soccer\s+)?Coach/i.test(trimmed)) {
      const cutAt = i > 0 && /^[A-Z][a-z]+ [A-Z]/.test(lines[i - 1].trim()) && lines[i - 1].trim().split(' ').length <= 4 ? i - 1 : i
      return lines.slice(0, cutAt).join('\n').trim()
    }
  }
  return summary
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

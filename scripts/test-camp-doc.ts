/**
 * test-camp-doc.ts — Phase 5 acceptance diagnostic. Persists current research for
 * the camp's host school (if absent), then generates the camp doc from the confirmed
 * draft and writes prep_docs.content. Prints the raw content JSON.
 *
 *   npx tsx --env-file=.env.local scripts/test-camp-doc.ts
 */
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { fetchSchoolContext } from '../src/lib/school-context'
import { getCurrentResearch, runSchoolResearch, validateResearch, type ResearchSeed } from '../src/lib/school-research'
import { extractJsonObject } from '../src/lib/agentic-research'
import { CAMP_DOC_MODEL, buildCampDocSystemPrompt, buildCampDocUserPrompt, extractDeclaredFacts, type DocPlayerProfile, type DocSchoolListItem } from '../src/lib/camp-doc'
import type { CampExtraction, CampPrepInputs } from '../src/lib/camp-prep'

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const { data: school } = await db.from('schools').select('id, name, division, conference, location, head_coach, coach_page_url').ilike('name', '%middlebury%').single()
  const schoolId = school!.id
  const { data: profileRow } = await db.from('player_profile').select('current_stats, upcoming_schedule, highlights, academic_summary, position, grad_year, home_timezone, preparation_notes').limit(1).maybeSingle()

  // The Aug 15-16 camp draft
  const { data: camp } = await db.from('camps').select('id').eq('host_school_id', schoolId).eq('start_date', '2026-08-15').single()
  const { data: draft } = await db.from('prep_docs').select('id, school_id, camp_name_snapshot, camp_dates_snapshot, inputs, extracted_schedule').eq('camp_id', camp!.id).eq('doc_type', 'camp').single()
  console.error('draft:', draft!.id, '| hasExtraction:', !!draft!.extracted_schedule)

  // 1. Ensure current research (persist if absent)
  let research = await getCurrentResearch(db, schoolId)
  if (!research) {
    console.error('No research — running + persisting…')
    const seed: ResearchSeed = { schoolId, name: school!.name, division: school!.division, conference: school!.conference, location: school!.location, headCoach: school!.head_coach, coachPageUrl: school!.coach_page_url, gradYear: (profileRow?.grad_year as number) ?? null }
    const raw = await runSchoolResearch({ seed, onProgress: m => console.error('  R:', m) })
    const val = validateResearch(raw.rawSnapshot, raw.rawSources, raw.fetchedUrls)
    await db.from('school_research').insert({ school_id: schoolId, status: val.status, model: raw.model, tool_call_count: raw.toolCallCount, snapshot: val.snapshot, sources: val.sources, fetched_urls: raw.fetchedUrls, is_current: true })
    research = await getCurrentResearch(db, schoolId)
    console.error('research persisted:', research?.id, research?.status)
  } else {
    console.error('research on file:', research.id, research.status)
  }

  // 2. Assemble + generate
  const sctx = await fetchSchoolContext(db, schoolId)
  const { data: allSchools } = await db.from('schools').select('id, name, category, recruiting_stage, status').neq('category', 'Nope').neq('status', 'Inactive')
  const { data: allOffers } = await db.from('school_offers').select('school_id')
  const offerSet = new Set((allOffers ?? []).map(o => o.school_id))
  const schoolList: DocSchoolListItem[] = (allSchools ?? []).map(s => ({ name: s.name, tier: s.category, stage: s.recruiting_stage, status: s.status, has_offer: offerSet.has(s.id) }))

  const player: DocPlayerProfile = {
    name: 'Finn Almond',
    position: (profileRow?.position as string) ?? null, grad_year: (profileRow?.grad_year as number) ?? null,
    home_timezone: (profileRow?.home_timezone as string)?.trim() || 'America/Denver',
    preparation_notes: (profileRow?.preparation_notes as string) ?? null,
    current_stats: (profileRow?.current_stats as string) ?? null, upcoming_schedule: (profileRow?.upcoming_schedule as string) ?? null,
    highlights: (profileRow?.highlights as string) ?? null, academic_summary: (profileRow?.academic_summary as string) ?? null,
  }

  const digest = await extractDeclaredFacts(db, anthropic, player.home_timezone)
  console.error(`declared-facts digest: status=${digest.status} / ${digest.facts.length} facts / ${digest.candidateCount} candidates / ~${digest.inputTokens} tokens`)
  console.error('generating doc (Opus)…')
  const userPrompt = buildCampDocUserPrompt({
    today: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: player.home_timezone }),
    player, camp: { name: draft!.camp_name_snapshot ?? '', dates: draft!.camp_dates_snapshot ?? '' },
    extraction: draft!.extracted_schedule as CampExtraction, inputs: (draft!.inputs as CampPrepInputs),
    contactLog: sctx.contactLog, coaches: sctx.coaches, offers: sctx.offers,
    research: research?.snapshot ?? null, researchStatus: research?.status ?? null,
    schoolName: sctx.school!.name, schoolList, declaredFacts: digest,
  })
  const message = await anthropic.messages.create({ model: CAMP_DOC_MODEL, max_tokens: 16000, system: buildCampDocSystemPrompt(), messages: [{ role: 'user', content: userPrompt }] })
  const rawText = message.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
  const doc = extractJsonObject(rawText)
  await db.from('prep_docs').update({ content: doc, research_id: research?.id ?? null }).eq('id', draft!.id)
  console.error('tokens in/out:', message.usage.input_tokens, message.usage.output_tokens, '| written to prep_docs.content')
  console.log(JSON.stringify(doc, null, 2))
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })

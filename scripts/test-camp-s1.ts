/**
 * test-camp-s1.ts — Phase 5.1 regression gate. Generates the doc for a school with
 * a minimal extraction stub (section 1 depends only on the thread) and prints
 * where_you_stand + the mission calibration, for Middlebury and Colby.
 *
 *   npx tsx --env-file=.env.local scripts/test-camp-s1.ts
 */
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { fetchSchoolContext } from '../src/lib/school-context'
import { getCurrentResearch } from '../src/lib/school-research'
import { extractJsonObject } from '../src/lib/agentic-research'
import { CAMP_DOC_MODEL, buildCampDocSystemPrompt, buildCampDocUserPrompt, extractDeclaredFacts, type DocPlayerProfile, type DocSchoolListItem, type DeclaredFact } from '../src/lib/camp-doc'
import type { CampExtraction } from '../src/lib/camp-prep'

async function runOne(db: any, anthropic: Anthropic, schoolQuery: string, player: DocPlayerProfile, schoolList: DocSchoolListItem[], declaredFacts: DeclaredFact[]) {
  const { data: school } = await db.from('schools').select('id, name').ilike('name', `%${schoolQuery}%`).limit(1).single()
  const sctx = await fetchSchoolContext(db, school.id)
  const research = await getCurrentResearch(db, school.id)
  const stub: CampExtraction = { venue: null, surface: null, days: [], hard_constraints: [], travel: { segments: [], lodging: null, lodging_breakfast_window: null, meal_windows: [], competing_commitments: [], who_traveling: null }, timezone: { home_tz: player.home_timezone, venue_tz: null, delta: null } }
  const userPrompt = buildCampDocUserPrompt({
    today: 'Wednesday, August 13, 2026', player,
    camp: { name: `${school.name} ID camp`, dates: 'TBD' }, extraction: stub, inputs: { camp_email_raw: '(section-1 gate — plan not under test)', travel_prose: '', extra_notes: '' },
    contactLog: sctx.contactLog, coaches: sctx.coaches, offers: sctx.offers,
    research: research?.snapshot ?? null, researchStatus: research?.status ?? null, schoolName: school.name, schoolList, declaredFacts,
  })
  const msg = await anthropic.messages.create({ model: CAMP_DOC_MODEL, max_tokens: 16000, system: buildCampDocSystemPrompt(), messages: [{ role: 'user', content: userPrompt }] })
  const doc: any = extractJsonObject(msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(''))
  console.log(`\n################ ${school.name} — WHERE YOU STAND ################`)
  console.log('read:', doc.where_you_stand.read)
  console.log('\nrelationship_opened_by:', doc.where_you_stand.relationship_opened_by)
  console.log('advancement:', doc.where_you_stand.advancement)
  console.log('\ncoach_touchpoints:')
  for (const t of doc.where_you_stand.coach_touchpoints ?? []) console.log(`  [${t.date}] ${t.classification.toUpperCase()} — quote=${t.quote ? `"${t.quote}"` : 'null'} — ${t.what}`)
  console.log('\nnot_yet:', doc.where_you_stand.not_yet)
  console.log('verdict:', doc.where_you_stand.verdict)
  console.log('\n-- MISSION calibration:', doc.the_mission.calibration)
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const { data: pr } = await db.from('player_profile').select('current_stats, highlights, academic_summary, position, grad_year, home_timezone, preparation_notes, upcoming_schedule').limit(1).maybeSingle()
  const player: DocPlayerProfile = { name: 'Finn Almond', position: pr?.position ?? null, grad_year: pr?.grad_year ?? null, home_timezone: (pr?.home_timezone ?? 'America/Denver'), preparation_notes: pr?.preparation_notes ?? null, current_stats: pr?.current_stats ?? null, upcoming_schedule: pr?.upcoming_schedule ?? null, highlights: pr?.highlights ?? null, academic_summary: pr?.academic_summary ?? null }
  const { data: allSchools } = await db.from('schools').select('id, name, category, recruiting_stage, status').neq('category', 'Nope').neq('status', 'Inactive')
  const { data: allOffers } = await db.from('school_offers').select('school_id')
  const offerSet = new Set((allOffers ?? []).map((o: any) => o.school_id))
  const schoolList: DocSchoolListItem[] = (allSchools ?? []).map((s: any) => ({ name: s.name, tier: s.category, stage: s.recruiting_stage, status: s.status, has_offer: offerSet.has(s.id) }))

  const digest = await extractDeclaredFacts(db, anthropic, player.home_timezone)
  console.log(`\n=== CROSS-THREAD DIGEST: ${digest.facts.length} facts from ${digest.candidateCount} candidates (~${digest.inputTokens} extraction input tokens) ===`)
  for (const f of digest.facts) console.log(`  [${f.school} | ${f.date}] (${f.kind}) "${f.quote}"`)

  await runOne(db, anthropic, 'middlebury', player, schoolList, digest.facts)
  await runOne(db, anthropic, 'colby', player, schoolList, digest.facts)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })

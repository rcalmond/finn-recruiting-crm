/**
 * test-school-research.ts — local diagnostic. Runs the research pipeline against a
 * school (default Middlebury) directly (no HTTP, no DB write) and prints the raw
 * ledger, validated snapshot, sources, and drops.
 *
 *   npx tsx --env-file=.env.local scripts/test-school-research.ts [school-name]
 */
import { createClient } from '@supabase/supabase-js'
import { runSchoolResearch, validateResearch, type ResearchSeed } from '../src/lib/school-research'

async function main() {
  const nameQuery = process.argv[2] ?? 'middlebury'
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: school, error } = await db
    .from('schools')
    .select('id, name, division, conference, location, head_coach, coach_page_url')
    .ilike('name', `%${nameQuery}%`)
    .limit(1)
    .single()
  if (error || !school) { console.error('School not found for', nameQuery, error?.message); process.exit(1) }

  const { data: profile } = await db.from('player_profile').select('grad_year').limit(1).maybeSingle()

  const seed: ResearchSeed = {
    schoolId: school.id,
    name: school.name,
    division: school.division,
    conference: school.conference,
    location: school.location,
    headCoach: school.head_coach,
    coachPageUrl: school.coach_page_url,
    gradYear: (profile?.grad_year as number | null) ?? null,
  }
  console.error('SEED:', JSON.stringify(seed))
  console.error('--- running loop (progress on stderr) ---')

  const raw = await runSchoolResearch({ seed, onProgress: m => console.error('  ...', m) })
  const val = validateResearch(raw.rawSnapshot, raw.rawSources, raw.fetchedUrls)

  console.log('\n================ FETCHED URLS (server ledger) ================')
  console.log(JSON.stringify(raw.fetchedUrls, null, 2))
  console.log('\n================ VALIDATED SNAPSHOT ================')
  console.log(JSON.stringify(val.snapshot, null, 2))
  console.log('\n================ SOURCES (survived validation) ================')
  console.log(JSON.stringify(val.sources, null, 2))
  console.log('\n================ DROPS (unsourced, removed) ================')
  console.log(JSON.stringify(val.drops, null, 2))
  console.log('\n================ SUMMARY ================')
  console.log(JSON.stringify({
    status: val.status,
    toolCalls: raw.toolCallCount,
    tokensIn: raw.totalInputTokens,
    tokensOut: raw.totalOutputTokens,
    counts: {
      staff: val.snapshot.staff.length,
      attrition: val.snapshot.attrition_next_two_cycles.length,
      commits: val.snapshot.published_commits_for_class.commits.length,
      sources: val.sources.length,
      fetchedUrls: raw.fetchedUrls.length,
      dropped: val.drops.length,
    },
  }, null, 2))
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })

/**
 * camp-doc-harness.ts — the fixture-based regression harness for camp-doc generation.
 *
 * Replaces the old click-through-the-UI-and-read-JSON loop. Two modes:
 *
 *   npx tsx --env-file=.env.local scripts/camp-doc-harness.ts --record [middlebury]
 *       Pulls the named school's live context from the DB (draft extraction + thread
 *       + coaches + offers + list + the family's recruiting_preferences) and writes it
 *       to a fixture on disk. This is the ONLY mode that touches the DB.
 *
 *   npx tsx --env-file=.env.local scripts/camp-doc-harness.ts [middlebury]
 *       DB-FREE. Loads the fixture, runs generation (Opus), writes the output JSON,
 *       and diffs it against the previous run section by section. No auth, no UI,
 *       no DB writes. This is the regression loop.
 *
 * The fixture is EXACTLY the buildCampDocUserPrompt input, so a run reproduces the
 * document from disk without any live dependency.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { fetchSchoolContext } from '../src/lib/school-context'
import { extractJsonObject } from '../src/lib/agentic-research'
import { CAMP_DOC_MODEL, buildCampDocSystemPrompt, buildCampDocUserPrompt, buildOutboundQuoteCorpus, finalizeCampDoc, isoAddDays, type CampDoc, type DocPlayerProfile, type DocSchoolListItem, type PreferencesRead } from '../src/lib/camp-doc'
import { validateCampDoc } from '../src/lib/camp-doc-validate'
import type { CampExtraction, CampPrepInputs } from '../src/lib/camp-prep'
import type { ContactLogRow, CoachRow, OfferRow } from '../src/lib/school-context'
import { ALMOND_FAMILY_ID } from '../src/lib/tenant-db'

const FIX_DIR = path.join(__dirname, 'fixtures')

// The full buildCampDocUserPrompt input, serialized. `today` is captured at record
// time so a replay is deterministic w.r.t. the prompt (only the model varies).
interface CampDocFixture {
  today: string
  referenceDate: string
  campDates: string[]
  player: DocPlayerProfile
  camp: { name: string; dates: string }
  extraction: CampExtraction
  inputs: CampPrepInputs
  contactLog: ContactLogRow[]
  coaches: CoachRow[]
  offers: OfferRow[]
  schoolName: string
  schoolList: DocSchoolListItem[]
  preferences: PreferencesRead
}

async function record(schoolQuery: string, fixturePath: string) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: school } = await db.from('schools').select('id, name').ilike('name', `%${schoolQuery}%`).limit(1).single()
  if (!school) throw new Error(`No school matching "${schoolQuery}"`)

  const sctx = await fetchSchoolContext(db, school.id)
  // Find the confirmed camp draft directly (a school can have several camps; only the
  // one with an extraction is generatable). Newest confirmed draft wins.
  const { data: draft } = await db.from('prep_docs')
    .select('camp_id, camp_name_snapshot, camp_dates_snapshot, inputs, extracted_schedule')
    .eq('school_id', school.id).eq('doc_type', 'camp').not('extracted_schedule', 'is', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  // Camp calendar dates (ISO) — the plan-date anchor (Phase 6.1).
  const campDates: string[] = []
  if (draft?.camp_id) {
    const { data: campRow } = await db.from('camps').select('start_date, end_date').eq('id', draft.camp_id).maybeSingle()
    if (campRow?.start_date && campRow?.end_date) {
      for (let dt = campRow.start_date as string; dt <= (campRow.end_date as string); dt = isoAddDays(dt, 1)) campDates.push(dt)
    }
  }

  // Thread-only fallback: a school with no camp draft still needs to run through the
  // harness for the §1/§2 verdict gate (classification + calibration depend only on
  // the thread). A minimal stub extraction makes the plan empty but §1/§2 intact.
  const homeTz = (await db.from('players').select('home_timezone').eq('family_id', ALMOND_FAMILY_ID).order('created_at', { ascending: true }).limit(1).maybeSingle()).data?.home_timezone as string | undefined
  const STUB: CampExtraction = { venue: null, surface: null, days: [], hard_constraints: [], travel: { segments: [], lodging: null, lodging_breakfast_window: null, meal_windows: [], competing_commitments: [], who_traveling: null }, timezone: { home_tz: homeTz?.trim() || 'America/Denver', venue_tz: null, delta: null } }
  const usingStub = !draft?.extracted_schedule
  if (usingStub) console.warn(`  ⚠ no camp draft for ${school.name} — recording a THREAD-ONLY stub fixture (plan empty; §1/§2 verdict gate only)`)

  const { data: pp } = await db.from('players').select('current_stats, upcoming_schedule, highlights, academic_summary, position, grad_year, home_timezone, preparation_notes, name').eq('family_id', ALMOND_FAMILY_ID).order('created_at', { ascending: true }).limit(1).maybeSingle()
  // recruiting_preferences is isolated in its own select so a pre-Migration-7 DB can
  // still record a usable fixture (the endpoint reads the column directly; this is a
  // dev-tool concession). A genuinely missing column records as empty with a warning.
  const { data: prefRow, error: prefErr } = await db.from('players').select('recruiting_preferences').eq('family_id', ALMOND_FAMILY_ID).order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (prefErr) console.warn(`  ⚠ recruiting_preferences unreadable (${prefErr.message}) — recording prefs=empty; re-record after Migration 7`)
  const prefsRaw = (prefRow?.recruiting_preferences as string | null)?.trim() || ''
  const preferences: PreferencesRead = prefsRaw ? { status: 'ok', value: prefsRaw } : { status: 'empty', value: null }

  const player: DocPlayerProfile = {
    name: (pp?.name as string) ?? 'the player',
    position: (pp?.position as string) ?? null, grad_year: (pp?.grad_year as number) ?? null,
    home_timezone: (pp?.home_timezone as string)?.trim() || 'America/Denver',
    preparation_notes: (pp?.preparation_notes as string) ?? null,
    current_stats: (pp?.current_stats as string) ?? null, upcoming_schedule: (pp?.upcoming_schedule as string) ?? null,
    highlights: (pp?.highlights as string) ?? null, academic_summary: (pp?.academic_summary as string) ?? null,
  }

  const { data: allSchools } = await db.from('schools').select('id, name, category, recruiting_stage, status').neq('category', 'Nope').neq('status', 'Inactive')
  const { data: allOffers } = await db.from('school_offers').select('school_id')
  const offerSet = new Set((allOffers ?? []).map(o => o.school_id))
  const schoolList: DocSchoolListItem[] = (allSchools ?? []).map(s => ({ name: s.name, tier: s.category, stage: s.recruiting_stage, status: s.status, has_offer: offerSet.has(s.id) }))

  const fixture: CampDocFixture = {
    today: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: player.home_timezone }),
    referenceDate: new Date().toLocaleDateString('en-CA', { timeZone: player.home_timezone }),
    campDates,
    player, camp: { name: draft?.camp_name_snapshot ?? `${school.name} ID camp`, dates: draft?.camp_dates_snapshot ?? 'TBD' },
    extraction: usingStub ? STUB : (draft!.extracted_schedule as CampExtraction),
    inputs: (draft?.inputs as CampPrepInputs) ?? { camp_email_raw: '(thread-only stub — plan not under test)', travel_prose: '', extra_notes: '' },
    contactLog: sctx.contactLog, coaches: sctx.coaches, offers: sctx.offers,
    schoolName: sctx.school!.name, schoolList, preferences,
  }
  fs.mkdirSync(FIX_DIR, { recursive: true })
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2))
  console.log(`recorded fixture → ${fixturePath}`)
  console.log(`  thread=${fixture.contactLog.length} coaches=${fixture.coaches.length} offers=${fixture.offers.length} list=${fixture.schoolList.length} prefs=${preferences.status} campDates=[${campDates.join(', ') || 'none'}] ref=${fixture.referenceDate}`)
}

// Section-by-section diff: for each top-level section, report CHANGED/same, and for
// object sections name which sub-fields differ. Enough to see "calibration moved,
// plan held" without eyeballing two 500-line blobs.
function diffDocs(prev: Record<string, unknown>, cur: Record<string, unknown>) {
  const keys = Array.from(new Set([...Object.keys(prev), ...Object.keys(cur)]))
  for (const k of keys) {
    const a = JSON.stringify(prev[k]), b = JSON.stringify(cur[k])
    if (a === b) { console.log(`  = ${k}`); continue }
    if (a === undefined) { console.log(`  + ${k} (new section)`); continue }
    if (b === undefined) { console.log(`  - ${k} (removed section)`); continue }
    const av = prev[k], bv = cur[k]
    if (av && bv && typeof av === 'object' && typeof bv === 'object' && !Array.isArray(av) && !Array.isArray(bv)) {
      const sub = Array.from(new Set([...Object.keys(av), ...Object.keys(bv)]))
        .filter(sk => JSON.stringify((av as Record<string, unknown>)[sk]) !== JSON.stringify((bv as Record<string, unknown>)[sk]))
      console.log(`  ~ ${k} — changed: ${sub.join(', ')}`)
    } else {
      console.log(`  ~ ${k} (changed)`)
    }
  }
}

async function generate(schoolQuery: string, fixturePath: string) {
  if (!fs.existsSync(fixturePath)) throw new Error(`No fixture at ${fixturePath} — run with --record ${schoolQuery} first`)
  const fx = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as CampDocFixture
  console.log(`fixture: ${fx.schoolName} · thread=${fx.contactLog.length} · prefs=${fx.preferences.status} · campDates=[${(fx.campDates ?? []).join(', ') || 'none'}]`)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Same guards as the endpoint: validate shape + span + quote evidence BEFORE
  // accepting the run — one automatic retry, then hard-fail without writing the out
  // file (a malformed doc saved as the new baseline would poison every later diff).
  const commitmentDates = (fx.extraction.travel?.competing_commitments ?? []).map(c => c.date).filter((d): d is string => !!d)
  const planDateSpan = (fx.campDates ?? []).length
    ? { min: [fx.referenceDate, ...commitmentDates].sort()[0], max: isoAddDays(fx.campDates[fx.campDates.length - 1], 1) }
    : undefined
  const outboundQuotes = buildOutboundQuoteCorpus(fx.contactLog, fx.player.home_timezone)
  const t0 = Date.now()
  const genOnce = async () => {
    const msg = await anthropic.messages.create({
      model: CAMP_DOC_MODEL, max_tokens: 16000,
      system: buildCampDocSystemPrompt(),
      messages: [{ role: 'user', content: buildCampDocUserPrompt(fx) }],
    })
    const parsed = extractJsonObject(msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')) as CampDoc
    return { msg, parsed, errors: validateCampDoc(parsed, { ...(planDateSpan ? { planDateSpan } : {}), outboundQuotes }) }
  }
  let attempt = await genOnce()
  if (attempt.errors.length) {
    console.warn(`  ⚠ shape validation failed (attempt 1): ${attempt.errors.join('; ')} — retrying once`)
    attempt = await genOnce()
  }
  if (attempt.errors.length) {
    console.error(`  ✗ shape validation failed (attempt 2): ${attempt.errors.join('; ')} — NOT writing output`)
    process.exit(1)
  }
  const message = attempt.msg
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  const doc = finalizeCampDoc(attempt.parsed, fx.player.home_timezone) as unknown as Record<string, unknown>

  const tps = (doc as unknown as CampDoc).where_you_stand?.coach_touchpoints ?? []
  const unpromptedCount = tps.filter(t => t.classification === 'unprompted').length
  console.log(`\ncomputed classification: ${unpromptedCount} unprompted / ${tps.length} touchpoints`)
  for (const t of tps) console.log(`  [${t.date}] ${(t.classification ?? '?').toUpperCase()} — evidence: ${t.preceding_outbound_quote === 'NO_PRIOR_MENTION' ? 'NO_PRIOR_MENTION' : `"${(t.preceding_outbound_quote || '').slice(0, 60)}" (${t.preceding_outbound_date})`}`)

  const outPath = fixturePath.replace(/\.json$/, '.out.json')
  const prevPath = fixturePath.replace(/\.json$/, '.prev.json')
  if (fs.existsSync(outPath)) fs.copyFileSync(outPath, prevPath)
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2))

  console.log(`\ngenerated in ${secs}s · tokens in/out ${message.usage.input_tokens}/${message.usage.output_tokens} → ${outPath}`)
  console.log('\n=== SECTION DIFF vs previous run ===')
  if (fs.existsSync(prevPath)) diffDocs(JSON.parse(fs.readFileSync(prevPath, 'utf8')), doc)
  else console.log('  (no previous run — this is the baseline)')
}

async function main() {
  const args = process.argv.slice(2)
  const isRecord = args.includes('--record')
  const school = args.find(a => !a.startsWith('--')) ?? 'middlebury'
  const fixturePath = path.join(FIX_DIR, `camp-doc.${school}.json`)
  if (isRecord) await record(school, fixturePath)
  else await generate(school, fixturePath)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })

/**
 * school-research.ts
 *
 * The shared per-school research asset (table: school_research). A Sonnet-driven
 * agentic loop retrieves staff, program results, roster shape, position-attrition,
 * geography, and class commits from the live web, then a GROUNDING VALIDATOR drops
 * any claim whose source URL was not actually retrieved this run.
 *
 * Model: claude-sonnet-4-6. This stage is retrieval + structured extraction; the
 * judgment lives downstream in the doc generator.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgenticLoop, extractJsonObject, normalizeUrl } from './agentic-research'

export const RESEARCH_MODEL = 'claude-sonnet-4-6'
export const RESEARCH_MAX_ITERATIONS = 20
export const STALE_DAYS = 30
/** A pending row younger than this is treated as an in-flight run (concurrency guard). */
export const PENDING_TIMEOUT_MS = 6 * 60 * 1000 // 6 min > the 300s function budget

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResearchSeed {
  schoolId: string
  name: string
  division: string | null
  conference: string | null
  location: string | null
  headCoach: string | null
  coachPageUrl: string | null
  gradYear: number | null
}

/** Every atomic claim object carries a claim_key that must resolve to a source. */
interface Claim { claim_key: string }
type Text = { text: string } & Claim
type Value = { value: string } & Claim

export interface ResearchStaff extends Claim {
  name: string
  role: string
  alma_mater?: string | null
  tenure?: string | null
  record?: string | null
  background?: string | null
}
export interface AttritionEntry extends Claim {
  cycle: string       // e.g. "graduating 2026" / "graduating 2027"
  position: string    // e.g. "Center Back"
  players: string[]   // named where published
}

// ─── HARD RULE FOR ALL CONSUMERS OF THIS SNAPSHOT (added 5.5) ────────────────────
// A prose field that EXPLAINS AN ABSENCE — not_found_reason, and anything like it —
// is an explanation, NOT a data source. No generator may parse it for entities
// (names, records, dates). "No published commit list found; the program is D3 and
// rarely publishes one" explains why `commits` is empty; it does not mean a program
// named "D3" exists. Read entities ONLY from the STRUCTURED fields (commits[].name,
// staff[].name, attrition[].players). This is the failure mode that got THE FIT cut
// from the camp doc in 5.5; the rule protects the pipeline wherever it's consumed next.
export interface ResearchSnapshot {
  staff: ResearchStaff[]
  program_results: {
    recent_records: Text[]
    conference_finishes: Text[]
    tournament_runs: Text[]
  }
  roster_summary: {
    roster_season?: string | null   // the established current season, e.g. "2025"
    size?: Value | null
    class_breakdown?: Value | null
    position_breakdown?: Value | null
  }
  attrition_next_two_cycles: AttritionEntry[]
  geographic_profile: {
    states_represented: Text[]
    regions: string[]   // interpretive synthesis of the sourced states
    gaps: string[]      // interpretive
  }
  published_commits_for_class: {
    class_year: number | null
    commits: Array<{ name: string } & Claim>
    not_found_reason?: string | null
  }
}

export interface ResearchSource {
  claim_key: string
  url: string
  fetched_at: string
  supporting_excerpt: string
  season?: string | null   // for roster-derived claims: the roster season this cites
}

export interface ClaimDrop {
  claim_key: string
  label: string
  reason: string
  offending_urls: string[]
}

export type ResearchStatus = 'pending' | 'complete' | 'partial' | 'failed'

export interface RunResearchResult {
  rawSnapshot: ResearchSnapshot
  rawSources: ResearchSource[]
  fetchedUrls: string[]
  toolCallCount: number
  totalInputTokens: number
  totalOutputTokens: number
  model: string
}

// ─── Prompt builders ───────────────────────────────────────────────────────────

export function buildResearchSystemPrompt(): string {
  return `You are a college soccer program researcher. Your job is RETRIEVAL and STRUCTURED EXTRACTION — gather verifiable PUBLIC facts about a men's soccer program from the live web and return them as JSON. You are NOT writing prose or giving opinions; a downstream system does the judgment.

You have web_search and web_fetch tools. Use them extensively. Every fact you output MUST come from a page you actually fetched or a search result you actually saw THIS SESSION. Do not use your training knowledge for any factual claim.

SCOPE — PUBLIC FACTS ONLY. Do NOT try to determine which coach is the recruit's primary contact, who "runs recruiting" for the program, or anything about the relationship between this recruit and the program. That is private data held elsewhere and is not your job. Just gather the public staff list with their public credentials.

═══════════════════════════════════════════════════════════════════
RESEARCH SEQUENCE
═══════════════════════════════════════════════════════════════════
STEP 1 (DO THIS FIRST): Establish the CURRENT roster season. Find the men's soccer roster and determine which season it is (the most recent published season — e.g. "2025"). Athletics sites often keep old roster pages live at /roster/2024 etc.; make sure you are reading the CURRENT one. Record this as roster_summary.roster_season. Every roster-derived claim below must be read off THIS season's roster, and its source entry must carry "season": "<that season>".

STEP 2: FETCH the current roster page fully (names, class year, position, hometown).
STEP 3: FETCH the coaching STAFF page and each coach's BIO page (public credentials, playing/coaching background, record, tenure).
STEP 4: Search + fetch the most recent completed SEASON record, conference finish, and any postseason/tournament run.

STEP 5 — ATTRITION (the highest-value output; derive it, do NOT search for it):
  The recruit arrives fall of ARRIVAL_YEAR (given below). The ONLY two cycles in scope:
    cycle_1 = players graduating spring of ARRIVAL_YEAR
    cycle_2 = players graduating spring of (ARRIVAL_YEAR - 1)
  Any cohort graduating earlier than cycle_2 is OUT OF SCOPE and must NOT be stored, even if it is well sourced.
  Derive future graduates from CLASS STANDING on the CURRENT roster — NOT from a published list of future graduates, and NEVER off an older roster page:
    - Let S = the current roster season year (from STEP 1).
    - Seniors on the current roster graduate spring (S + 1).
    - Juniors graduate spring (S + 2). Sophomores spring (S + 3). First-years spring (S + 4).
    - Keep only the class(es) whose graduation spring equals ARRIVAL_YEAR or (ARRIVAL_YEAR - 1). Group them BY POSITION and name the players.
  If you CANNOT establish which roster season is current, OMIT attrition entirely (empty array) and say so — do NOT compute off an arbitrary roster page.

STEP 6 — GEOGRAPHY: from the CURRENT roster's hometowns, list states represented (with counts) and the gaps. Every geographic claim is roster-derived: it must cite the current roster URL and carry the season, exactly like any other roster claim.

STEP 7 — PUBLISHED COMMITS for the recruit's graduating class: search for a published list. Many programs (especially D3) do not publish these — if you cannot find and verify one, that is a valid result: record a not_found_reason, do NOT guess.

Prefer OFFICIAL athletics domains (the school's .edu / official athletics site) over aggregators. When a claim rests only on a secondary/aggregator source, still cite it but prefer to corroborate from the official site.

═══════════════════════════════════════════════════════════════════
GROUNDING — THIS IS THE ENTIRE POINT
═══════════════════════════════════════════════════════════════════
- Every atomic factual object in "snapshot" carries a "claim_key" (a short unique slug you choose, e.g. "staff_head_coach", "record_2025", "attrition_2027_cb", "geo_ny").
- For EVERY claim_key, add one or more entries to "sources" with: the exact "url" you retrieved it from, a short verbatim "supporting_excerpt" (UNDER 240 characters) copied from that page, and the same "claim_key".
- For any ROSTER-DERIVED claim (roster_summary size/class/position, every attrition entry, every geographic claim), the source entry MUST also include "season": "<the current roster season>". A roster-derived claim whose source cites a different season, or omits the season, will be DROPPED downstream.
- Be concise — short excerpts, no repetition. The whole JSON must fit in one response; do not pad.
- NEVER cite a URL you did not actually fetch or see in search results this session. Inventing sources is the worst failure mode; such claims are dropped.
- NOT-FOUND IS VALID AND USEFUL. If you cannot source something, omit that claim and fill a not_found_reason honestly where the schema has one. Partial, honest results beat complete, invented ones — families make real decisions on this.

═══════════════════════════════════════════════════════════════════
OUTPUT — return ONLY this JSON, no markdown fences, no commentary:
═══════════════════════════════════════════════════════════════════
{
  "snapshot": {
    "staff": [ { "name": "...", "role": "...", "alma_mater": "... or null", "tenure": "... or null", "record": "... or null", "background": "... or null", "claim_key": "..." } ],
    "program_results": {
      "recent_records": [ { "text": "e.g. 2025: 12-4-2 overall", "claim_key": "..." } ],
      "conference_finishes": [ { "text": "...", "claim_key": "..." } ],
      "tournament_runs": [ { "text": "...", "claim_key": "..." } ]
    },
    "roster_summary": {
      "roster_season": "e.g. 2025",
      "size": { "value": "e.g. 28 players", "claim_key": "..." },
      "class_breakdown": { "value": "e.g. 8 Sr / 7 Jr / 6 So / 7 Fr", "claim_key": "..." },
      "position_breakdown": { "value": "e.g. 4 GK / 9 D / 8 M / 7 F", "claim_key": "..." }
    },
    "attrition_next_two_cycles": [ { "cycle": "graduating spring 2027", "position": "Center Back", "players": ["..."], "claim_key": "..." } ],
    "geographic_profile": {
      "states_represented": [ { "text": "e.g. NY (6 players)", "claim_key": "..." } ],
      "regions": ["Northeast", "..."],
      "gaps": ["No West Coast presence", "..."]
    },
    "published_commits_for_class": {
      "class_year": <the recruit's grad year as an int, or null>,
      "commits": [ { "name": "...", "claim_key": "..." } ],
      "not_found_reason": "... or null"
    }
  },
  "sources": [ { "claim_key": "...", "url": "https://...", "fetched_at": "unused - server stamps this", "supporting_excerpt": "verbatim quote", "season": "<current roster season, for roster-derived claims; omit otherwise>" } ]
}

Return ONLY the JSON object.`
}

export function buildResearchUserPrompt(seed: ResearchSeed): string {
  const lines: string[] = []
  lines.push('Research this men\'s soccer program and return the grounded JSON.')
  lines.push('')
  lines.push('=== PROGRAM ===')
  lines.push(`School: ${seed.name}`)
  lines.push(`Division: ${seed.division ?? 'unknown'}${seed.conference ? ` — ${seed.conference}` : ''}`)
  lines.push(`Location: ${seed.location ?? 'unknown'}`)
  if (seed.headCoach) lines.push(`Head coach (on file, may be stale — verify): ${seed.headCoach}`)
  if (seed.coachPageUrl) lines.push(`Known coaching-staff page (start here, then find the roster page yourself): ${seed.coachPageUrl}`)
  lines.push('')
  lines.push('=== RECRUIT ===')
  if (seed.gradYear) {
    lines.push(`Graduating class / ARRIVAL_YEAR: ${seed.gradYear} — the recruit arrives on campus fall ${seed.gradYear}.`)
    lines.push(`In-scope attrition cycles — store ONLY these two: players graduating spring ${seed.gradYear} (cycle_1) and spring ${seed.gradYear - 1} (cycle_2). Derive them from CLASS STANDING on the CURRENT roster per the sequence; do NOT store any cohort graduating earlier than spring ${seed.gradYear - 1}.`)
    lines.push(`Also search for published commits for the ${seed.gradYear} class.`)
  } else {
    lines.push('Graduating class: unknown — skip the commits lookup and the attrition computation, and set the relevant not_found_reason / empty attrition accordingly.')
  }
  return lines.join('\n')
}

// ─── The run ────────────────────────────────────────────────────────────────────

export async function runSchoolResearch(params: {
  seed: ResearchSeed
  onProgress?: (message: string) => void
}): Promise<RunResearchResult> {
  const { seed, onProgress } = params

  const { finalText, toolCallCount, totalInputTokens, totalOutputTokens, fetchedUrls } =
    await runAgenticLoop({
      systemPrompt: buildResearchSystemPrompt(),
      userPrompt: buildResearchUserPrompt(seed),
      model: RESEARCH_MODEL,
      maxIterations: RESEARCH_MAX_ITERATIONS,
      maxTokens: 16000,
      onProgress,
    })

  const parsed = extractJsonObject(finalText) as { snapshot?: ResearchSnapshot; sources?: ResearchSource[] }
  const rawSnapshot = normalizeSnapshotShape(parsed.snapshot)
  const rawSources = Array.isArray(parsed.sources) ? parsed.sources : []

  return {
    rawSnapshot,
    rawSources,
    fetchedUrls,
    toolCallCount,
    totalInputTokens,
    totalOutputTokens,
    model: RESEARCH_MODEL,
  }
}

/** Defensive shape-fill so the validator + UI never hit undefined arrays. */
function normalizeSnapshotShape(s?: Partial<ResearchSnapshot>): ResearchSnapshot {
  return {
    staff: s?.staff ?? [],
    program_results: {
      recent_records: s?.program_results?.recent_records ?? [],
      conference_finishes: s?.program_results?.conference_finishes ?? [],
      tournament_runs: s?.program_results?.tournament_runs ?? [],
    },
    roster_summary: {
      roster_season: s?.roster_summary?.roster_season ?? null,
      size: s?.roster_summary?.size ?? null,
      class_breakdown: s?.roster_summary?.class_breakdown ?? null,
      position_breakdown: s?.roster_summary?.position_breakdown ?? null,
    },
    attrition_next_two_cycles: s?.attrition_next_two_cycles ?? [],
    geographic_profile: {
      states_represented: s?.geographic_profile?.states_represented ?? [],
      regions: s?.geographic_profile?.regions ?? [],
      gaps: s?.geographic_profile?.gaps ?? [],
    },
    published_commits_for_class: {
      class_year: s?.published_commits_for_class?.class_year ?? null,
      commits: s?.published_commits_for_class?.commits ?? [],
      not_found_reason: s?.published_commits_for_class?.not_found_reason ?? null,
    },
  }
}

// ─── Grounding validator ─────────────────────────────────────────────────────────

export interface ValidationResult {
  snapshot: ResearchSnapshot
  sources: ResearchSource[]
  drops: ClaimDrop[]
  status: 'complete' | 'partial' | 'failed'
}

/**
 * Drop every claim whose sources[] entry does not cite a URL that is actually in
 * the fetched-URL ledger. Records each drop. Returns pruned snapshot + the sources
 * that survived, and a status: complete (no drops, has content), partial (drops or
 * thin), failed (nothing survived).
 */
export function validateResearch(
  rawSnapshot: ResearchSnapshot,
  rawSources: ResearchSource[],
  fetchedUrls: string[],
): ValidationResult {
  const ledger = new Set(fetchedUrls.map(normalizeUrl))
  const currentSeason = (rawSnapshot.roster_summary.roster_season ?? '').trim()

  // Per claim_key: is it grounded (a source URL in the ledger)? and separately, is
  // it grounded BY A SOURCE THAT CITES THE CURRENT ROSTER SEASON? (roster-derived).
  const groundedKeys = new Set<string>()
  const rosterGroundedKeys = new Set<string>()
  const offendersByKey = new Map<string, string[]>()      // cited urls NOT in ledger
  const seasonMissByKey = new Map<string, string[]>()      // in-ledger but wrong/absent season
  for (const src of rawSources) {
    if (!src || typeof src.claim_key !== 'string' || typeof src.url !== 'string') continue
    if (ledger.has(normalizeUrl(src.url))) {
      groundedKeys.add(src.claim_key)
      const srcSeason = String(src.season ?? '').trim()
      if (currentSeason && srcSeason === currentSeason) {
        rosterGroundedKeys.add(src.claim_key)
      } else {
        const arr = seasonMissByKey.get(src.claim_key) ?? []
        arr.push(`${src.url}${srcSeason ? ` (season ${srcSeason})` : ' (no season)'}`)
        seasonMissByKey.set(src.claim_key, arr)
      }
    } else {
      const arr = offendersByKey.get(src.claim_key) ?? []
      arr.push(src.url)
      offendersByKey.set(src.claim_key, arr)
    }
  }

  const drops: ClaimDrop[] = []
  // Basic grounding: any source URL in the ledger. For staff, program results, commits.
  const keepBasic = (obj: { claim_key?: string } | null | undefined, label: string): boolean => {
    if (!obj || typeof obj.claim_key !== 'string') { if (obj) drops.push({ claim_key: '(none)', label, reason: 'no claim_key', offending_urls: [] }); return false }
    if (groundedKeys.has(obj.claim_key)) return true
    drops.push({ claim_key: obj.claim_key, label, reason: 'unsourced (no cited URL was fetched)', offending_urls: offendersByKey.get(obj.claim_key) ?? [] })
    return false
  }
  // Roster grounding: grounded AND the source cites the CURRENT roster season.
  // For roster_summary, attrition, geography.
  const keepRoster = (obj: { claim_key?: string } | null | undefined, label: string): boolean => {
    if (!obj || typeof obj.claim_key !== 'string') { if (obj) drops.push({ claim_key: '(none)', label, reason: 'no claim_key', offending_urls: [] }); return false }
    if (rosterGroundedKeys.has(obj.claim_key)) return true
    const reason = !currentSeason
      ? 'no current roster season established — roster-derived claim omitted'
      : groundedKeys.has(obj.claim_key)
        ? `roster-derived claim not tied to the current season (${currentSeason})`
        : 'unsourced (no cited URL was fetched)'
    drops.push({ claim_key: obj.claim_key, label, reason, offending_urls: seasonMissByKey.get(obj.claim_key) ?? offendersByKey.get(obj.claim_key) ?? [] })
    return false
  }

  const snapshot: ResearchSnapshot = {
    staff: rawSnapshot.staff.filter(s => keepBasic(s, `staff: ${s.name ?? '?'}`)),
    program_results: {
      recent_records: rawSnapshot.program_results.recent_records.filter(r => keepBasic(r, `record: ${r.text ?? '?'}`)),
      conference_finishes: rawSnapshot.program_results.conference_finishes.filter(r => keepBasic(r, `conference: ${r.text ?? '?'}`)),
      tournament_runs: rawSnapshot.program_results.tournament_runs.filter(r => keepBasic(r, `tournament: ${r.text ?? '?'}`)),
    },
    roster_summary: {
      roster_season: rawSnapshot.roster_summary.roster_season ?? null,
      size: rawSnapshot.roster_summary.size && keepRoster(rawSnapshot.roster_summary.size, 'roster size') ? rawSnapshot.roster_summary.size : null,
      class_breakdown: rawSnapshot.roster_summary.class_breakdown && keepRoster(rawSnapshot.roster_summary.class_breakdown, 'class breakdown') ? rawSnapshot.roster_summary.class_breakdown : null,
      position_breakdown: rawSnapshot.roster_summary.position_breakdown && keepRoster(rawSnapshot.roster_summary.position_breakdown, 'position breakdown') ? rawSnapshot.roster_summary.position_breakdown : null,
    },
    attrition_next_two_cycles: rawSnapshot.attrition_next_two_cycles.filter(a => keepRoster(a, `attrition: ${a.position ?? '?'} ${a.cycle ?? ''}`)),
    geographic_profile: {
      states_represented: rawSnapshot.geographic_profile.states_represented.filter(g => keepRoster(g, `geo: ${g.text ?? '?'}`)),
      regions: rawSnapshot.geographic_profile.regions,  // interpretive synthesis of the sourced states
      gaps: rawSnapshot.geographic_profile.gaps,        // interpretive
    },
    published_commits_for_class: {
      class_year: rawSnapshot.published_commits_for_class.class_year,
      commits: rawSnapshot.published_commits_for_class.commits.filter(c => keepBasic(c, `commit: ${c.name ?? '?'}`)),
      not_found_reason: rawSnapshot.published_commits_for_class.not_found_reason ?? null,
    },
  }

  // Sources that survive = those whose URL is in the ledger.
  const sources = rawSources.filter(s => s && typeof s.url === 'string' && ledger.has(normalizeUrl(s.url)))

  const hasContent =
    snapshot.staff.length > 0 ||
    snapshot.program_results.recent_records.length > 0 ||
    snapshot.attrition_next_two_cycles.length > 0 ||
    snapshot.roster_summary.size != null ||
    snapshot.geographic_profile.states_represented.length > 0 ||
    snapshot.published_commits_for_class.commits.length > 0

  const status: ValidationResult['status'] =
    !hasContent ? 'failed' : drops.length > 0 ? 'partial' : 'complete'

  return { snapshot, sources, drops, status }
}

// ─── Read accessor (call prep can adopt this later; running-list #10) ───────────

export interface CurrentResearchRow {
  id: string
  school_id: string
  generated_at: string
  status: ResearchStatus
  model: string | null
  tool_call_count: number | null
  error: string | null
  is_current: boolean
  snapshot: ResearchSnapshot | null
  sources: ResearchSource[] | null
  fetched_urls: string[] | null
}

/** Returns the current research row for a school, or null. */
export async function getCurrentResearch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  schoolId: string,
): Promise<CurrentResearchRow | null> {
  const { data } = await admin
    .from('school_research')
    .select('id, school_id, generated_at, status, model, tool_call_count, error, is_current, snapshot, sources, fetched_urls')
    .eq('school_id', schoolId)
    .eq('is_current', true)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as CurrentResearchRow | null) ?? null
}

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

export function isStale(iso: string): boolean {
  return daysSince(iso) > STALE_DAYS
}

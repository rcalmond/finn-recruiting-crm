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

export interface ResearchSnapshot {
  staff: ResearchStaff[]
  program_results: {
    recent_records: Text[]
    conference_finishes: Text[]
    tournament_runs: Text[]
  }
  roster_summary: {
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
}

export interface ClaimDrop {
  claim_key: string
  label: string
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
  return `You are a college soccer program researcher. Your job is RETRIEVAL and STRUCTURED EXTRACTION — gather verifiable facts about a men's soccer program from the live web and return them as JSON. You are NOT writing prose or giving opinions; a downstream system does the judgment.

You have web_search and web_fetch tools. Use them extensively. Every fact you output MUST come from a page you actually fetched or a search result you actually saw THIS SESSION. Do not use your training knowledge for any factual claim.

═══════════════════════════════════════════════════════════════════
RESEARCH SEQUENCE
═══════════════════════════════════════════════════════════════════
1. Find and FETCH the men's soccer ROSTER page (names, class year, position, hometown). This is the single most valuable page — most outputs depend on it.
2. Find and FETCH the men's soccer COACHING STAFF page, then each coach's BIO page.
3. Search + fetch the most recent completed SEASON record, conference finish, and any postseason/tournament run.
4. From the roster, determine ATTRITION: which players graduate in each of the two class years BEFORE the recruit's arrival year, BY POSITION, named. (If the recruit arrives fall of class year Y, the two cycles before are the seniors graduating in Y-1 and Y-2 relative to arrival — use the roster's class years to identify who leaves.)
5. Determine the roster's GEOGRAPHIC profile (states/regions from hometowns) and the gaps.
6. Search for PUBLISHED COMMITS for the recruit's graduating class. Many programs (especially D3) do not publish these — if you cannot find a published list, that is a valid result: record a not_found_reason, do NOT guess.

Prefer OFFICIAL athletics domains (the school's .edu / official athletics site) over aggregators. When a claim rests only on a secondary/aggregator source, still cite it but prefer to corroborate from the official site.

═══════════════════════════════════════════════════════════════════
GROUNDING — THIS IS THE ENTIRE POINT
═══════════════════════════════════════════════════════════════════
- Every atomic factual object in "snapshot" carries a "claim_key" (a short unique slug you choose, e.g. "staff_head_coach", "record_2025", "attrition_2026_cb", "commit_1").
- For EVERY claim_key, add one or more entries to "sources" with: the exact "url" you retrieved it from, a short verbatim "supporting_excerpt" copied from that page (keep it UNDER 240 characters), and the same "claim_key".
- Be concise throughout — short excerpts, no repetition. The whole JSON must fit in one response; do not pad.
- NEVER cite a URL you did not actually fetch or see in search results this session. A claim whose source was not really retrieved will be DROPPED downstream, and inventing sources is the worst failure mode.
- NOT-FOUND IS VALID AND USEFUL. If you cannot source something, omit that claim (leave the array empty or the field null) and, where the schema has a not_found_reason, fill it honestly (e.g. "No published commit list found; D3 programs typically do not publish commits"). Partial, honest results beat complete, invented ones — families make real decisions on this.

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
      "size": { "value": "e.g. 28 players", "claim_key": "..." },
      "class_breakdown": { "value": "e.g. 8 Sr / 7 Jr / 6 So / 7 Fr", "claim_key": "..." },
      "position_breakdown": { "value": "e.g. 4 GK / 9 D / 8 M / 7 F", "claim_key": "..." }
    },
    "attrition_next_two_cycles": [ { "cycle": "graduating 2026", "position": "Center Back", "players": ["..."], "claim_key": "..." } ],
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
  "sources": [ { "claim_key": "...", "url": "https://...", "fetched_at": "unused - server stamps this", "supporting_excerpt": "verbatim quote from the page" } ]
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
    lines.push(`Graduating class: ${seed.gradYear} (arrives on campus fall ${seed.gradYear}). Look up published commits for the ${seed.gradYear} class, and compute attrition for the two cycles before fall ${seed.gradYear}.`)
  } else {
    lines.push('Graduating class: unknown — skip the commits lookup and set published_commits_for_class.not_found_reason accordingly.')
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

  // claim_key -> the source URLs cited for it, split into grounded vs not.
  const groundedKeys = new Set<string>()
  const offendersByKey = new Map<string, string[]>()
  for (const src of rawSources) {
    if (!src || typeof src.claim_key !== 'string' || typeof src.url !== 'string') continue
    if (ledger.has(normalizeUrl(src.url))) {
      groundedKeys.add(src.claim_key)
    } else {
      const arr = offendersByKey.get(src.claim_key) ?? []
      arr.push(src.url)
      offendersByKey.set(src.claim_key, arr)
    }
  }

  const drops: ClaimDrop[] = []
  const keep = (obj: { claim_key?: string } | null | undefined, label: string): boolean => {
    if (!obj || typeof obj.claim_key !== 'string') return false // claim with no key can't be grounded
    if (groundedKeys.has(obj.claim_key)) return true
    drops.push({
      claim_key: obj.claim_key,
      label,
      offending_urls: offendersByKey.get(obj.claim_key) ?? [],
    })
    return false
  }

  const snapshot: ResearchSnapshot = {
    staff: rawSnapshot.staff.filter(s => keep(s, `staff: ${s.name ?? '?'}`)),
    program_results: {
      recent_records: rawSnapshot.program_results.recent_records.filter(r => keep(r, `record: ${r.text ?? '?'}`)),
      conference_finishes: rawSnapshot.program_results.conference_finishes.filter(r => keep(r, `conference: ${r.text ?? '?'}`)),
      tournament_runs: rawSnapshot.program_results.tournament_runs.filter(r => keep(r, `tournament: ${r.text ?? '?'}`)),
    },
    roster_summary: {
      size: rawSnapshot.roster_summary.size && keep(rawSnapshot.roster_summary.size, 'roster size') ? rawSnapshot.roster_summary.size : null,
      class_breakdown: rawSnapshot.roster_summary.class_breakdown && keep(rawSnapshot.roster_summary.class_breakdown, 'class breakdown') ? rawSnapshot.roster_summary.class_breakdown : null,
      position_breakdown: rawSnapshot.roster_summary.position_breakdown && keep(rawSnapshot.roster_summary.position_breakdown, 'position breakdown') ? rawSnapshot.roster_summary.position_breakdown : null,
    },
    attrition_next_two_cycles: rawSnapshot.attrition_next_two_cycles.filter(a => keep(a, `attrition: ${a.position ?? '?'} ${a.cycle ?? ''}`)),
    geographic_profile: {
      states_represented: rawSnapshot.geographic_profile.states_represented.filter(g => keep(g, `geo: ${g.text ?? '?'}`)),
      regions: rawSnapshot.geographic_profile.regions,  // interpretive synthesis of the sourced states
      gaps: rawSnapshot.geographic_profile.gaps,        // interpretive
    },
    published_commits_for_class: {
      class_year: rawSnapshot.published_commits_for_class.class_year,
      commits: rawSnapshot.published_commits_for_class.commits.filter(c => keep(c, `commit: ${c.name ?? '?'}`)),
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

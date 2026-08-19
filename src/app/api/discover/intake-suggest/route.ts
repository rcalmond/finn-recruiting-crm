/**
 * /api/discover/intake-suggest — the aspiration intake → starting list (v2).
 *
 * EVIDENCE-EMIT-AND-COMPUTE, strictly:
 *   1. A small model call parses the family's free text into Find Schools
 *      FACETS ONLY, plus two pieces of evidence ABOUT THE QUERY (legitimate
 *      model work — it may never rank schools): a PRIORITY ordering of the
 *      stated criteria, and whether program QUALITY was requested. The model
 *      never names a school.
 *   2. CODE filters discovery_schools on the facets and RANKS deterministically:
 *      exact facet matches weighted by the stated priority, tighter over
 *      looser, deterministic tie-break. No alphabetical fallback.
 *   3. THE HONEST LIMITATION: the catalog has NO program-quality data —
 *      programs[] is a binary tag. When quality is requested, academic
 *      selectivity is used as a RANKING stand-in (never a hard filter — that
 *      would silently evict schools matching every stated criterion) and the
 *      response flags quality_proxy so the UI discloses it. The model NEVER
 *      supplies program quality from its own knowledge.
 *   4. Annotation is a separate mode, called for the FINAL displayed set only
 *      (≤10 inline for small sets). ECHO OVER DERIVE: a why may restate ONLY
 *      that row's facet data; a code guard DROPS any why carrying a quality
 *      adjective the catalog can't back (the drop-unsourced-claims pattern).
 *
 * FAIL SOFT everywhere (Amendment B §4 unchanged): no facets, zero matches,
 * model error, timeout — all return { suggestions: [] } with 200. Named
 * soft-fail logs make degradation countable in runtime logs.
 *
 * players.intake_notes is NON-CANONICAL and is NOT read here.
 */
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { familyAdmin } from '@/lib/tenant-db'
import { getFamilyContext } from '@/lib/require-family'

// Two sequential model calls (~6-15s observed) — headroom against the default.
export const maxDuration = 60

const PARSE_MODEL = 'claude-sonnet-4-6'

const DIVISIONS = ['D1', 'D2', 'D3', 'NAIA', 'JUCO'] as const
const REGIONS = ['Northeast', 'Mid-Atlantic', 'Southeast', 'Midwest', 'Southwest', 'West'] as const
const ACADEMIC_BANDS = ['most_selective', 'highly_selective', 'selective', 'accessible'] as const
const ENROLLMENT_BANDS = ['under_2k', '2k_5k', '5k_15k', 'over_15k'] as const
const PROGRAMS = ['engineering', 'business', 'nursing', 'premed_health', 'computer_science', 'education'] as const
const PRIORITY_KEYS = ['divisions', 'regions', 'academic_bands', 'enrollment_bands', 'programs', 'program_quality'] as const

// Quality stand-in ordinal (ranking only, never a filter).
const ACADEMIC_ORDINAL: Record<string, number> = {
  most_selective: 1, highly_selective: 0.75, selective: 0.4, accessible: 0.1,
}

// ECHO OVER DERIVE guard: adjectives the catalog cannot back. A why containing
// any of these is dropped, not shipped. Word-boundary match; catalog band
// labels ("Highly selective") don't collide with this list.
const BANNED_ADJECTIVES = /\b(strong|excellent|top|renowned|elite|prestigious|premier|best|leading|powerhouse|standout|acclaimed|notable|robust|outstanding|world-class|highly.regarded|well.known|respected)\b/i

interface Facets {
  divisions: string[]
  regions: string[]
  academic_bands: string[]
  enrollment_bands: string[]
  programs: string[]
}

function sanitizeFacets(raw: unknown): Facets {
  const pick = (arr: unknown, allowed: readonly string[]) =>
    Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string' && allowed.includes(v)) : []
  const o = (raw ?? {}) as Record<string, unknown>
  return {
    divisions: pick(o.divisions, DIVISIONS),
    regions: pick(o.regions, REGIONS),
    academic_bands: pick(o.academic_bands, ACADEMIC_BANDS),
    enrollment_bands: pick(o.enrollment_bands, ENROLLMENT_BANDS),
    programs: pick(o.programs, PROGRAMS),
  }
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try { return JSON.parse(text.slice(start, end + 1)) } catch { return null }
}

type Row = {
  id: string; name: string; short_name: string | null; division: string
  conference: string | null; region: string | null; state: string | null
  city: string | null; academic_band: string | null; enrollment_band: string | null
  programs: string[] | null; has_engineering: boolean | null
}

// ─── Annotation (shared by the inline ≤10 path and the annotate mode) ────────

async function annotateRows(
  client: Anthropic,
  facets: Facets,
  rows: Pick<Row, 'id' | 'name' | 'division' | 'conference' | 'region' | 'state' | 'academic_band' | 'enrollment_band' | 'programs'>[],
): Promise<Map<string, string>> {
  const whys = new Map<string, string>()
  try {
    const annoRes = await client.messages.create({
      model: PARSE_MODEL,
      max_tokens: 900,
      messages: [{
        role: 'user',
        content: `For each school below, write ONE short line (under 15 words) for a family whose stated criteria are: ${JSON.stringify(facets)}.

RULES — these are hard:
- RESTATE ONLY the data given for that school (division, conference, region/state, the academic-selectivity band, the enrollment size band, the program tags). Nothing else exists.
- NO quality adjectives of any kind — never "strong", "excellent", "top", "renowned" or similar. The catalog does not rate programs; a program tag means OFFERED, not good.
- No outside knowledge, no soccer results, no rankings, no reputation claims.
- If a line would need anything beyond the given fields, write it from the fields alone.

Output ONLY JSON: [{"id":"...","why":"..."}].

${JSON.stringify(rows)}`,
      }],
    })
    const t = annoRes.content[0]?.type === 'text' ? annoRes.content[0].text : ''
    const s = t.indexOf('['); const e = t.lastIndexOf(']')
    let annoArr: unknown[] = []
    if (s !== -1 && e > s) { try { annoArr = JSON.parse(t.slice(s, e + 1)) } catch { annoArr = [] } }
    for (const a of annoArr as { id?: string; why?: string }[]) {
      if (typeof a?.id !== 'string' || typeof a?.why !== 'string') continue
      // Drop-unsourced-claims: a quality adjective the catalog can't back
      // kills the line, not the suggestion.
      if (BANNED_ADJECTIVES.test(a.why)) {
        console.warn('[intake-suggest] soft-fail: annotation-dropped (unbacked adjective)', a.why)
        continue
      }
      whys.set(a.id, a.why.slice(0, 140))
    }
  } catch (annoErr) {
    console.warn('[intake-suggest] soft-fail: annotation-failed', annoErr instanceof Error ? annoErr.message : String(annoErr))
  }
  return whys
}

export async function POST(req: Request) {
  const fam = await getFamilyContext()
  if (!fam.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: fam.status })
  const familyId = fam.ctx.familyId

  const body = await req.json().catch(() => ({})) as {
    intake?: string
    mode?: 'annotate'
    rows?: Row[]
    facets?: Facets
  }

  // ── Annotate mode: whys for the FINAL displayed set (post-narrowing) ──────
  if (body.mode === 'annotate') {
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 10) : []
    const facets = sanitizeFacets(body.facets)
    if (rows.length === 0) return NextResponse.json({ whys: [] })
    const whys = await annotateRows(new Anthropic(), facets, rows.map(r => ({
      id: String(r.id), name: String(r.name), division: String(r.division),
      conference: r.conference ?? null, region: r.region ?? null, state: r.state ?? null,
      academic_band: r.academic_band ?? null, enrollment_band: r.enrollment_band ?? null,
      programs: r.programs ?? null,
    })))
    return NextResponse.json({ whys: Array.from(whys.entries()).map(([id, why]) => ({ id, why })) })
  }

  const text = (body.intake ?? '').trim()
  if (!text) return NextResponse.json({ suggestions: [], facets: null })

  try {
    const client = new Anthropic()

    // ── 1. Parse: facets + query evidence out, nothing else ─────────────────
    const parseRes = await client.messages.create({
      model: PARSE_MODEL,
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `A recruiting family described the kind of schools their soccer player is aiming for. Map their words onto the browse facets below. Output ONLY JSON — arrays of the allowed values, empty when the text gives no signal for that dimension. Do NOT name schools, do NOT invent values, do NOT infer beyond what the words support.

Allowed values:
- divisions: ${DIVISIONS.join(', ')}
- regions: ${REGIONS.join(', ')} (Northeast = New England + NY)
- academic_bands: ${ACADEMIC_BANDS.join(', ')} ("strong academics" / "selective" language maps to most_selective + highly_selective)
- enrollment_bands: ${ENROLLMENT_BANDS.join(', ')} ("small" = under_2k + 2k_5k, "large" = over_15k)
- programs: ${PROGRAMS.join(', ')}

Also emit two pieces of evidence about the QUERY (not about any school):
- priority: the dimension keys the family stated, ordered by the emphasis of THEIR words (first = what they led with or stressed). Allowed keys: ${PRIORITY_KEYS.join(', ')}. Include program_quality only if they asked for program strength/quality. Omit dimensions they did not state.
- program_quality_requested: true only if they asked for strong/good/top-quality PROGRAMS (as opposed to academics generally).

Family's words:
"""${text.slice(0, 1200)}"""

Output: {"divisions":[],"regions":[],"academic_bands":[],"enrollment_bands":[],"programs":[],"priority":[],"program_quality_requested":false}`,
      }],
    })
    const parsed = parseRes.content[0]?.type === 'text' ? extractJson(parseRes.content[0].text) : null
    const facets = sanitizeFacets(parsed)
    const po = (parsed ?? {}) as Record<string, unknown>
    const priority = (Array.isArray(po.priority) ? po.priority : [])
      .filter((k): k is string => typeof k === 'string' && (PRIORITY_KEYS as readonly string[]).includes(k))
    const qualityRequested = po.program_quality_requested === true

    const hasAnyFacet = Object.values(facets).some(a => a.length > 0)
    if (!hasAnyFacet) {
      console.warn('[intake-suggest] soft-fail: no-facets (text gave no signal)')
      return NextResponse.json({ suggestions: [], facets: null })
    }

    // ── 2. CODE filters the catalog — the model never names a school ────────
    // TODO(womens-catalog): sport would select the catalog here; discovery_schools
    // is the men's universe and the only catalog today.
    const db = familyAdmin(familyId)

    const { data: existing } = await db.from('schools').select('name, discovery_school_id')
    const excludeIds = new Set((existing ?? []).map(r => r.discovery_school_id).filter(Boolean) as string[])
    const excludeNames = new Set((existing ?? []).map(r => (r.name as string).toLowerCase()))

    // Progressive relaxation: drop the narrowest dimensions in order (size,
    // then academics) — never division/region/programs, the core intent.
    const relaxOrders: (keyof Facets)[][] = [
      [],
      ['enrollment_bands'],
      ['enrollment_bands', 'academic_bands'],
    ]
    let rows: Row[] = []
    for (const dropped of relaxOrders) {
      let q = db.from('discovery_schools').select('*').limit(200)
      if (facets.divisions.length) q = q.in('division', facets.divisions)
      if (facets.regions.length) q = q.in('region', facets.regions)
      if (facets.academic_bands.length && !dropped.includes('academic_bands')) q = q.in('academic_band', facets.academic_bands)
      if (facets.enrollment_bands.length && !dropped.includes('enrollment_bands')) q = q.in('enrollment_band', facets.enrollment_bands)
      if (facets.programs.length) q = q.overlaps('programs', facets.programs)
      const { data } = await q
      rows = ((data ?? []) as Row[]).filter(r => !excludeIds.has(r.id) && !excludeNames.has(r.name.toLowerCase()))
      if (rows.length >= 4) break
    }
    if (rows.length === 0) {
      console.warn('[intake-suggest] soft-fail: zero-matches after relaxation', JSON.stringify(facets))
      return NextResponse.json({ suggestions: [], facets })
    }

    // ── 3. Deterministic ranking, priority-weighted, in code ────────────────
    // The quality proxy activates only when quality was requested AND the
    // family didn't already pin academic bands (their own bands then filter).
    const qualityProxy = qualityRequested && facets.academic_bands.length === 0

    // Weight per scorable dimension from the stated priority: earlier = heavier;
    // stated-but-unlisted dimensions weight 1.
    const P = priority.length
    const weight = (key: string, stated: boolean) => {
      const i = priority.indexOf(key)
      if (i !== -1) return P - i + 1
      return stated ? 1 : 0
    }
    const wAcademic = weight('academic_bands', facets.academic_bands.length > 0)
    const wSize = weight('enrollment_bands', facets.enrollment_bands.length > 0)
    const wPrograms = weight('programs', facets.programs.length > 0)
    const wQuality = qualityProxy ? Math.max(weight('program_quality', true), 1) : 0

    const score = (r: Row) => {
      let n = 0
      // Exact facet matches (relaxation may have readmitted looser rows —
      // tighter matches score above them).
      if (wAcademic && r.academic_band && facets.academic_bands.includes(r.academic_band)) n += wAcademic
      if (wSize && r.enrollment_band && facets.enrollment_bands.includes(r.enrollment_band)) n += wSize
      if (wPrograms && facets.programs.length) {
        const overlap = (r.programs ?? []).filter(p => facets.programs.includes(p)).length
        n += wPrograms * (overlap / facets.programs.length)
      }
      // The disclosed quality stand-in: academic selectivity ordinal.
      if (wQuality) n += wQuality * (ACADEMIC_ORDINAL[r.academic_band ?? ''] ?? 0)
      return n
    }
    // Deterministic tie-break: score desc → academic ordinal desc → name asc.
    // Name is the LAST resort, never the ordering.
    rows.sort((a, b) =>
      score(b) - score(a) ||
      (ACADEMIC_ORDINAL[b.academic_band ?? ''] ?? 0) - (ACADEMIC_ORDINAL[a.academic_band ?? ''] ?? 0) ||
      a.name.localeCompare(b.name),
    )
    const ranked = rows.slice(0, 60)

    // ── 4. Cap semantics: ≤10 ships annotated; >10 ships un-annotated for the
    // client's narrowing step (whys come later for the final set only). ──────
    let suggestions: (Row & { why: string | null })[]
    if (ranked.length <= 10) {
      const whys = await annotateRows(client, facets, ranked.map(r => ({
        id: r.id, name: r.name, division: r.division, conference: r.conference,
        region: r.region, state: r.state, academic_band: r.academic_band,
        enrollment_band: r.enrollment_band, programs: r.programs,
      })))
      suggestions = ranked.map(r => ({ ...r, why: whys.get(r.id) ?? null }))
    } else {
      suggestions = ranked.map(r => ({ ...r, why: null }))
    }

    return NextResponse.json({ facets, priority, quality_proxy: qualityProxy, suggestions })
  } catch (err) {
    // Never show an error where a family expected magic.
    console.error('[intake-suggest] soft-fail: hard-error', err instanceof Error ? err.message : err)
    return NextResponse.json({ suggestions: [], facets: null })
  }
}

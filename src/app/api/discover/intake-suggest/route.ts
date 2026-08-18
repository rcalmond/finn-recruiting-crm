/**
 * /api/discover/intake-suggest — the aspiration intake → starting list.
 *
 * EVIDENCE-EMIT-AND-COMPUTE, strictly:
 *   1. A small model call parses the family's free text into Find Schools
 *      FACETS ONLY (divisions, regions, academic bands, size bands, programs —
 *      each constrained to the discovery_schools vocabulary). The model never
 *      names a school.
 *   2. CODE filters discovery_schools on those facets — every suggestion is a
 *      catalog row by construction.
 *   3. One optional second call annotates the top rows with a one-line why,
 *      grounded ONLY in that row's facet data. Annotation failure is silent —
 *      suggestions ship without whys.
 *
 * FAIL SOFT at every step: no facets, zero matches, model error, timeout — all
 * return { suggestions: [] } with 200 so the create flow proceeds to the normal
 * empty state. Signup is never blocked on a model call.
 *
 * players.intake_notes is NON-CANONICAL and is NOT read here — the client
 * passes the text of THIS intake; no generator ever reads the stored column.
 */
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { familyAdmin } from '@/lib/tenant-db'
import { getFamilyContext } from '@/lib/require-family'

const PARSE_MODEL = 'claude-sonnet-4-6'

const DIVISIONS = ['D1', 'D2', 'D3', 'NAIA', 'JUCO'] as const
const REGIONS = ['Northeast', 'Mid-Atlantic', 'Southeast', 'Midwest', 'Southwest', 'West'] as const
const ACADEMIC_BANDS = ['most_selective', 'highly_selective', 'selective', 'accessible'] as const
const ENROLLMENT_BANDS = ['under_2k', '2k_5k', '5k_15k', 'over_15k'] as const
const PROGRAMS = ['engineering', 'business', 'nursing', 'premed_health', 'computer_science', 'education'] as const

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

export async function POST(req: Request) {
  const fam = await getFamilyContext()
  if (!fam.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: fam.status })
  const familyId = fam.ctx.familyId

  const { intake } = await req.json().catch(() => ({})) as { intake?: string }
  const text = (intake ?? '').trim()
  if (!text) return NextResponse.json({ suggestions: [], facets: null })

  try {
    const client = new Anthropic()

    // ── 1. Parse: facets out, nothing else ──────────────────────────────────
    const parseRes = await client.messages.create({
      model: PARSE_MODEL,
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `A recruiting family described the kind of schools their soccer player is aiming for. Map their words onto the browse facets below. Output ONLY JSON — arrays of the allowed values, empty when the text gives no signal for that dimension. Do NOT name schools, do NOT invent values, do NOT infer beyond what the words support.

Allowed values:
- divisions: ${DIVISIONS.join(', ')}
- regions: ${REGIONS.join(', ')} (Northeast = New England + NY)
- academic_bands: ${ACADEMIC_BANDS.join(', ')} ("strong academics" / "selective" language maps to most_selective + highly_selective)
- enrollment_bands: ${ENROLLMENT_BANDS.join(', ')} ("small" = under_2k + 2k_5k, "large" = over_15k)
- programs: ${PROGRAMS.join(', ')}

Family's words:
"""${text.slice(0, 1200)}"""

Output: {"divisions":[],"regions":[],"academic_bands":[],"enrollment_bands":[],"programs":[]}`,
      }],
    })
    const parsed = parseRes.content[0]?.type === 'text' ? extractJson(parseRes.content[0].text) : null
    const facets = sanitizeFacets(parsed)
    const hasAnyFacet = Object.values(facets).some(a => a.length > 0)
    if (!hasAnyFacet) return NextResponse.json({ suggestions: [], facets: null })

    // ── 2. CODE filters the catalog — the model never names a school ────────
    // TODO(womens-catalog): sport would select the catalog here; discovery_schools
    // is the men's universe and the only catalog today.
    const db = familyAdmin(familyId)

    // Exclude anything already on the family's list (fresh families: empty).
    const { data: existing } = await db.from('schools').select('name, discovery_school_id')
    const excludeIds = new Set((existing ?? []).map(r => r.discovery_school_id).filter(Boolean) as string[])
    const excludeNames = new Set((existing ?? []).map(r => (r.name as string).toLowerCase()))

    // Progressive relaxation: filter on everything given; if too few rows,
    // drop the narrowest dimensions in order (size, then academics) — never
    // relax division/region/programs, which carry the family's core intent.
    const relaxOrders: (keyof Facets)[][] = [
      [],
      ['enrollment_bands'],
      ['enrollment_bands', 'academic_bands'],
    ]
    type Row = {
      id: string; name: string; short_name: string | null; division: string
      conference: string | null; region: string | null; state: string | null
      city: string | null; academic_band: string | null; enrollment_band: string | null
      programs: string[] | null; has_engineering: boolean | null
    }
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
    if (rows.length === 0) return NextResponse.json({ suggestions: [], facets })

    // Deterministic ranking: rows matching MORE of the requested facet
    // dimensions first (relaxation may have readmitted partial matches), then
    // program-tagged rows, then name.
    const score = (r: Row) => {
      let n = 0
      if (facets.academic_bands.length && r.academic_band && facets.academic_bands.includes(r.academic_band)) n++
      if (facets.enrollment_bands.length && r.enrollment_band && facets.enrollment_bands.includes(r.enrollment_band)) n++
      if (facets.programs.length && (r.programs ?? []).some(p => facets.programs.includes(p))) n += 2
      return n
    }
    rows.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
    const top = rows.slice(0, 12)

    // ── 3. Annotate (optional; grounded ONLY in the row's facet data) ───────
    let whys = new Map<string, string>()
    try {
      const annoRes = await client.messages.create({
        model: PARSE_MODEL,
        max_tokens: 900,
        messages: [{
          role: 'user',
          content: `For each school below, write ONE short line (under 15 words) saying why it fits a family looking for: ${JSON.stringify(facets)}. Ground every line ONLY in the data given for that school — no outside knowledge, no soccer results, no claims beyond these fields. Output ONLY JSON: [{"id":"...","why":"..."}].

${JSON.stringify(top.map(r => ({ id: r.id, name: r.name, division: r.division, conference: r.conference, region: r.region, state: r.state, academic_band: r.academic_band, enrollment_band: r.enrollment_band, programs: r.programs })))}`,
        }],
      })
      const t = annoRes.content[0]?.type === 'text' ? annoRes.content[0].text : ''
      const s = t.indexOf('['); const e = t.lastIndexOf(']')
      let annoArr: unknown[] = []
      if (s !== -1 && e > s) { try { annoArr = JSON.parse(t.slice(s, e + 1)) } catch { annoArr = [] } }
      whys = new Map((annoArr as { id?: string; why?: string }[])
        .filter(a => typeof a?.id === 'string' && typeof a?.why === 'string')
        .map(a => [a.id as string, (a.why as string).slice(0, 140)]))
    } catch { /* annotation is optional — ship without whys */ }

    return NextResponse.json({
      facets,
      suggestions: top.map(r => ({ ...r, why: whys.get(r.id) ?? null })),
    })
  } catch (err) {
    // Never show an error where a family expected magic.
    console.error('[intake-suggest] failed soft:', err instanceof Error ? err.message : err)
    return NextResponse.json({ suggestions: [], facets: null })
  }
}

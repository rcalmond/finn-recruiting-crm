import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

function makeAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/discover/similar
 *
 * Body: { seeds: [{ name, division?, tier? }], force?: boolean }
 *
 * Reasons about why the seed schools cluster and proposes 5–8 SIMILAR
 * men's-soccer programs beyond the list, each with one sentence of reasoning.
 * Proposals are cross-checked by name against discovery_schools so facet data
 * (and a stable id) ride along on add; off-universe proposals are allowed
 * through flagged verify:true.
 *
 * Cached per seed-set hash (module-level, ephemeral per instance) so repeat
 * clicks are free; `force:true` bypasses the cache (Refresh affordance).
 */

type Seed = { name: string; division?: string | null; tier?: string | null }
type Proposal = {
  name: string
  division: string | null
  region: string | null
  reasoning: string
  inUniverse: boolean
  discoveryId: string | null
  verify: boolean
}

// Module-level cache: warm instances serve repeat clicks with no model call.
const CACHE = new Map<string, { at: number; proposals: Proposal[] }>()
const CACHE_TTL_MS = 60 * 60 * 1000 // 1h

function seedHash(seeds: Seed[]): string {
  return seeds.map(s => s.name.trim().toLowerCase()).sort().join('|')
}

export async function POST(request: Request) {
  try {
    const { seeds, force } = (await request.json()) as { seeds?: Seed[]; force?: boolean }
    if (!Array.isArray(seeds) || seeds.length < 3) {
      return NextResponse.json({ error: 'Need at least 3 seed schools' }, { status: 400 })
    }

    const key = seedHash(seeds)
    if (!force) {
      const hit = CACHE.get(key)
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        return NextResponse.json({ proposals: hit.proposals, cached: true })
      }
    }

    const admin = makeAdmin()

    // Athlete academic framing — from the canonical profile source (not hardcoded).
    const { data: profile } = await admin
      .from('player_profile')
      .select('academic_summary, player_scores')
      .limit(1)
      .maybeSingle()
    const framing = profile?.academic_summary
      ? `Athlete framing: ${String(profile.academic_summary).slice(0, 600)}`
      : 'Athlete framing: academically strong recruit, engineering/sciences interest, projects to the mid-D3 range.'

    const seedList = seeds
      .map(s => `- ${s.name}${s.division ? ` (${s.division})` : ''}${s.tier ? `, tier ${s.tier}` : ''}`)
      .join('\n')
    const excludeNames = new Set(seeds.map(s => s.name.trim().toLowerCase()))

    const client = new Anthropic()
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      system: `You help a college soccer recruit's family widen a target list. Given a set of "seed" schools the family already likes, infer what they have in common (division level, academic profile, size, engineering/sciences, region, playing-time realism) and propose 5–8 OTHER US colleges that fit the same cluster.

Hard rules:
- Every proposal MUST field a men's varsity soccer program (NCAA D1/D2/D3, NAIA, or JUCO). If unsure a school has men's soccer, do not propose it.
- Do NOT propose any school already in the seed list.
- Each proposal gets ONE sentence of reasoning naming the concrete tie to the seeds (e.g. "Like St. Lawrence and Clark: mid-D3, strong sciences, real early minutes").
- Prefer schools beyond the obvious; spread across a couple of regions when it fits.
- Each "name" must be exactly ONE school's common name and nothing else — no alternates, parentheticals, or commentary in the name field.

Return ONLY a JSON array, no prose:
[{"name": "...", "division": "D1|D2|D3|NAIA|JUCO", "region": "Northeast|Mid-Atlantic|Southeast|Midwest|Southwest|West|null", "reasoning": "one sentence"}]`,
      messages: [{
        role: 'user',
        content: `${framing}\n\nSeed schools (already on the list):\n${seedList}\n\nPropose 5–8 similar schools with reasoning. Return only the JSON array.`,
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    let raw: { name?: string; division?: string; region?: string; reasoning?: string }[] = []
    try {
      const m = text.match(/\[[\s\S]*\]/)
      raw = m ? JSON.parse(m[0]) : []
    } catch {
      raw = []
    }

    // Clean the name field: strip any commentary/alternates after a dash or paren.
    const cleanName = (n: string) =>
      n.split(/\s+[—–-]\s+|\s+\(|,\s+mirrored/i)[0].trim()

    // Token-normalized matching (name + short_name). Drop only generic institution
    // words; keep distinguishing tokens like "state"/"polytechnic"/"institute" so
    // "Worcester Polytechnic" ≠ "Worcester State". Exact set equality is order-free.
    const STOP = new Set(['university', 'college', 'the', 'of', 'at', 'in', 'univ', 'and'])
    const norm = (s: string) => new Set(
      s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
        .filter(t => t && !STOP.has(t))
    )
    const eq = (a: Set<string>, b: Set<string>) =>
      a.size > 0 && a.size === b.size && Array.from(a).every(t => b.has(t))

    // Seed exclusion by token match too — the model sometimes re-proposes a seed
    // under a different name form ("Tufts" vs "Tufts University").
    const seedTokens = seeds.map(s => norm(s.name))
    const cleaned = raw
      .map(p => ({ ...p, name: p.name ? cleanName(p.name) : '' }))
      .filter(p => p.name
        && !excludeNames.has(p.name.toLowerCase())
        && !seedTokens.some(st => eq(st, norm(p.name))))
      .slice(0, 8)

    const { data: universe } = await admin
      .from('discovery_schools')
      .select('id, name, short_name, division, region')
    const index = (universe ?? []).map(u => ({
      ...u, tName: norm(u.name), tShort: u.short_name ? norm(u.short_name) : new Set<string>(),
    }))

    const proposals: Proposal[] = cleaned.map(p => {
      const t = norm(p.name)
      const match = index.find(u => eq(t, u.tName) || (u.tShort.size > 0 && eq(t, u.tShort)))
      return {
        name: match?.name ?? p.name,
        division: match?.division ?? p.division ?? null,
        region: match?.region ?? p.region ?? null,
        reasoning: (p.reasoning ?? '').trim() || 'Similar profile to your list.',
        inUniverse: !!match,
        discoveryId: match?.id ?? null,
        verify: !match,
      }
    })

    CACHE.set(key, { at: Date.now(), proposals })
    return NextResponse.json({ proposals, cached: false })
  } catch (err) {
    console.error('Discovery similar failed:', err)
    return NextResponse.json({ error: 'generation_failed', proposals: [] }, { status: 200 })
  }
}

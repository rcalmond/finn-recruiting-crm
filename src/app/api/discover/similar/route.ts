import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

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
// `exclude` = every school already in the working pipeline (any tier), so a
// current target is never re-proposed even when it wasn't part of the seed set.
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
    // Standard auth gate — reads player_profile + burns model spend.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { seeds, exclude, force } = (await request.json()) as { seeds?: Seed[]; exclude?: string[]; force?: boolean }
    if (!Array.isArray(seeds) || seeds.length < 3) {
      return NextResponse.json({ error: 'Need at least 3 seed schools' }, { status: 400 })
    }
    const excludeList = Array.isArray(exclude) ? exclude : []

    // Cache key includes the exclusion set — a changed pipeline must re-generate.
    const key = seedHash(seeds) + '::' + excludeList.map(n => n.trim().toLowerCase()).sort().join('|')
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

    // Clean/normalize helpers + universe index — built BEFORE the prompt so each
    // seed's known programs (migration 062) can enrich the model's context, and
    // reused below for exclusion by discovery id.
    const cleanName = (n: string) =>
      n.split(/\s+[—–-]\s+|\s*\(|,\s+mirrored/i)[0].trim()
    const STOP = new Set(['university', 'college', 'the', 'of', 'at', 'in', 'univ', 'and'])
    const norm = (s: string) => new Set(
      cleanName(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
        .filter(t => t && !STOP.has(t))
    )
    const eq = (a: Set<string>, b: Set<string>) =>
      a.size > 0 && a.size === b.size && Array.from(a).every(t => b.has(t))

    const { data: universe } = await admin
      .from('discovery_schools')
      .select('id, name, short_name, division, region, programs')
    const index = (universe ?? []).map(u => ({
      ...u, tName: norm(u.name), tShort: u.short_name ? norm(u.short_name) : new Set<string>(),
    }))
    // Ambiguity guard: resolve only when exactly ONE universe row matches;
    // otherwise null (flagged verify downstream) so a proposal is never attached
    // to the wrong school ("Union University"/"Union College" → {union}).
    const matchUniverse = (name: string) => {
      const t = norm(name)
      const hits = index.filter(u => eq(t, u.tName) || (u.tShort.size > 0 && eq(t, u.tShort)))
      const uniqueIds = new Set(hits.map(h => h.id))
      return uniqueIds.size === 1 ? hits[0] : null
    }

    // Seed list enriched with each seed's known programs so the model reasons
    // with real material ("like Clark: business, pre-med").
    const seedList = seeds
      .map(s => {
        const progs = (matchUniverse(s.name)?.programs ?? []) as string[]
        const bits = [
          s.division ? `(${s.division})` : '',
          s.tier ? `tier ${s.tier}` : '',
          progs.length ? `programs: ${progs.join(', ')}` : '',
        ].filter(Boolean).join(', ')
        return `- ${s.name}${bits ? ` — ${bits}` : ''}`
      })
      .join('\n')
    const excludeNames = new Set(
      [...seeds.map(s => s.name), ...excludeList].map(n => n.trim().toLowerCase())
    )

    const client = new Anthropic()
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1600,
      system: `You help a college soccer recruit's family widen a target list. Given a set of "seed" schools the family already likes, infer what they have in common (division level, academic profile, size, engineering/sciences, region, playing-time realism) and propose OTHER US colleges that fit the same cluster.

Hard rules:
- Propose 12 candidates, ordered strongest fit first. (Some may already be on the family's list and will be filtered out downstream, so a deeper list ensures a strong final set — but never pad with weak fits; quality over quantity.)
- Every proposal MUST field a men's varsity soccer program (NCAA D1/D2/D3, NAIA, or JUCO). If unsure a school has men's soccer, do not propose it.
- Do NOT propose any school already in the seed list.
- Each proposal gets ONE sentence of reasoning naming the concrete tie to the seeds (e.g. "Like St. Lawrence and Clark: mid-D3, strong sciences, real early minutes").
- Prefer schools beyond the obvious; spread across a couple of regions when it fits.
- Each "name" must be exactly ONE school's common name and nothing else — no alternates, parentheticals, or commentary in the name field.

Return ONLY a JSON array, no prose:
[{"name": "...", "division": "D1|D2|D3|NAIA|JUCO", "region": "Northeast|Mid-Atlantic|Southeast|Midwest|Southwest|West|null", "reasoning": "one sentence"}]`,
      messages: [{
        role: 'user',
        content: `${framing}\n\nSeed schools (already on the list):\n${seedList}\n\nPropose 12 similar schools, strongest fit first, each with reasoning. Return only the JSON array.`,
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

    // (name matcher + universe index are built above, before the prompt)

    // Resolve every excluded/seed school to a discovery id. This bridges name-form
    // differences: working "Case Western" and a proposed "Case Western Reserve" both
    // resolve to the same universe row, so the current target is never re-proposed.
    const excludeIds = new Set<string>()
    const excludeTokenSets: Set<string>[] = []
    for (const name of [...seeds.map(s => s.name), ...excludeList]) {
      const m = matchUniverse(name)
      if (m) excludeIds.add(m.id)
      else excludeTokenSets.push(norm(name)) // off-universe fallback: token match
    }
    const isExcluded = (name: string, discoveryId: string | null) =>
      excludeNames.has(name.toLowerCase())
      || (discoveryId !== null && excludeIds.has(discoveryId))
      || excludeTokenSets.some(st => eq(st, norm(name)))

    const proposals: Proposal[] = raw
      .map(p => ({ ...p, name: p.name ? cleanName(p.name) : '' }))
      .filter(p => p.name)
      .map(p => {
        const match = matchUniverse(p.name)
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
      .filter(p => !isExcluded(p.name, p.discoveryId))
      .slice(0, 8)

    CACHE.set(key, { at: Date.now(), proposals })
    return NextResponse.json({ proposals, cached: false })
  } catch (err) {
    console.error('Discovery similar failed:', err)
    return NextResponse.json({ error: 'generation_failed', proposals: [] }, { status: 200 })
  }
}

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GetReadyClient from '@/components/GetReadyClient'
import type { PlayerScores } from '@/lib/types'

// ─── Name normalizer (mirrors the discovery matcher in /api/discover/similar) ─
// Used here to resolve active schools to their discovery_schools row so the
// selectivity spread reads a real academic_band. Ambiguity guard: resolve only
// on a unique match; unresolved schools fall to the "unrated" bucket, never
// guessed. (Duplicated from the similar route + DiscoverSection — a shared
// matcher lib is a future consolidation.)
const NAME_STOP = new Set(['university', 'college', 'the', 'of', 'at', 'in', 'univ', 'and'])
const cleanName = (n: string) => n.split(/\s+[—–-]\s+|\s*\(/)[0].trim()
const norm = (s: string) => new Set(
  cleanName(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(t => t && !NAME_STOP.has(t))
)
const eqSet = (a: Set<string>, b: Set<string>) => a.size > 0 && a.size === b.size && Array.from(a).every(t => b.has(t))

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

export default async function GetReadyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [
    { data: reelAsset },
    { data: resumeAsset },
    { data: transcriptAsset },
    { data: profile },
    { count: testScoresCount },
    { data: activeMessages },
    { data: schoolRows },
    { data: coverageRows },
    { data: universe },
  ] = await Promise.all([
    supabase.from('assets')
      .select('name, created_at').eq('type', 'highlight_reel').eq('is_current', true)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('assets')
      .select('name, version, created_at').eq('type', 'resume').eq('is_current', true)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('assets')
      .select('name, created_at').eq('type', 'transcript').eq('is_current', true)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    // Structured scores — canonical source is player_profile (migration 060). NOT hardcoded.
    supabase.from('player_profile').select('player_scores').limit(1).maybeSingle(),
    supabase.from('assets')
      .select('*', { count: 'exact', head: true }).eq('type', 'test_scores').eq('is_current', true),
    // Full active-message rows — drive the Talking Points staleness signal.
    supabase.from('messages')
      .select('id, title, type, created_at, updated_at').eq('status', 'active'),
    // Active schools with the fields the list insights need.
    supabase.from('schools')
      .select('id, name, short_name, division, category, recruiting_stage')
      .neq('category', 'Nope').neq('status', 'Inactive'),
    // Story-coverage: which (message, school) pairs a coach has heard.
    supabase.from('school_message_log').select('message_id, school_id'),
    // Universe rows for the selectivity resolution.
    supabase.from('discovery_schools').select('id, name, short_name, academic_band'),
  ])

  const schools = schoolRows ?? []

  // ── Tier counts + total ──────────────────────────────────────────────────
  const tierCounts = { A: 0, B: 0, C: 0 }
  for (const s of schools) {
    if (s.category === 'A' || s.category === 'B' || s.category === 'C') tierCounts[s.category as 'A' | 'B' | 'C']++
  }

  // ── Talking Points: staleness + coverage ─────────────────────────────────
  const msgs = activeMessages ?? []
  const newest = [...msgs].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0] ?? null
  // Updates go stale after 60 days; questions don't go stale.
  const staleCount = msgs.filter(m => m.type === 'update' && daysSince(m.updated_at) > 60).length

  const topIds = new Set(schools.filter(s => s.category === 'A' || s.category === 'B').map(s => s.id))
  const msgIds = new Set(msgs.map(m => m.id))
  const heard = new Set<string>()
  for (const r of coverageRows ?? []) {
    if (topIds.has(r.school_id) && msgIds.has(r.message_id)) heard.add(`${r.school_id}|${r.message_id}`)
  }
  const coverageDenom = topIds.size * msgIds.size
  const coveragePct = coverageDenom > 0 ? Math.round((heard.size / coverageDenom) * 100) : null

  const talkingPoints = {
    newestTitle: newest?.title ?? null,
    newestAgeDays: newest ? daysSince(newest.created_at) : null,
    staleCount,
    coveragePct,
  }

  // ── List insights: depth · selectivity · division ────────────────────────
  const depth = { advancing: 0, evaluating: 0, building: 0 }
  const division = { D1: 0, D2: 0, D3: 0, other: 0 }
  for (const s of schools) {
    const st = s.recruiting_stage ?? 1
    if (st >= 5) depth.advancing++
    else if (st === 4) depth.evaluating++
    else depth.building++
    if (s.division === 'D1' || s.division === 'D2' || s.division === 'D3') division[s.division as 'D1' | 'D2' | 'D3']++
    else division.other++
  }

  // Selectivity: resolve each active school to a unique universe row → academic_band.
  const index = (universe ?? []).map(u => ({
    band: u.academic_band as string | null,
    tName: norm(u.name),
    tShort: u.short_name ? norm(u.short_name) : new Set<string>(),
    id: u.id,
  }))
  const resolveBand = (name: string, short: string | null): string | null => {
    for (const cand of [name, short].filter(Boolean) as string[]) {
      const t = norm(cand)
      const hits = index.filter(u => eqSet(t, u.tName) || (u.tShort.size > 0 && eqSet(t, u.tShort)))
      const ids = new Set(hits.map(h => h.id))
      if (ids.size === 1) return hits[0].band
    }
    return null
  }
  const selectivity = { most_selective: 0, highly_selective: 0, selective: 0, accessible: 0, unrated: 0 }
  for (const s of schools) {
    const band = resolveBand(s.name, s.short_name)
    if (band && band in selectivity) selectivity[band as keyof typeof selectivity]++
    else selectivity.unrated++
  }

  return (
    <GetReadyClient
      reelAsset={reelAsset as { name: string; created_at: string } | null}
      resumeAsset={resumeAsset as { name: string; version: number; created_at: string } | null}
      transcriptAsset={transcriptAsset as { name: string; created_at: string } | null}
      playerScores={(profile as { player_scores: PlayerScores | null } | null)?.player_scores ?? null}
      testScoresCount={testScoresCount ?? 0}
      talkingPoints={talkingPoints}
      listInsights={{ depth, selectivity, division }}
      tierCounts={tierCounts}
      totalSchools={schools.length}
    />
  )
}

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GetReadyClient from '@/components/GetReadyClient'
import type { PlayerScores } from '@/lib/types'

export default async function GetReadyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Fetch asset status data
  const [
    { data: reelAsset },
    { data: resumeAsset },
    { data: transcriptAsset },
    { data: profile },
    { count: testScoresCount },
    { count: activeMessageCount },
    { count: activeQuestionCount },
  ] = await Promise.all([
    supabase.from('assets')
      .select('name, created_at')
      .eq('type', 'highlight_reel')
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('assets')
      .select('name, version, created_at')
      .eq('type', 'resume')
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('assets')
      .select('name, created_at')
      .eq('type', 'transcript')
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Structured scores — canonical source is player_profile (migration 060),
    // the same table the LLM prompt builders read. NOT hardcoded.
    supabase.from('player_profile')
      .select('player_scores')
      .limit(1)
      .maybeSingle(),
    supabase.from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'test_scores')
      .eq('is_current', true),
    supabase.from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabase.from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('type', 'question'),
  ])

  // Count active schools by tier
  const { data: schoolRows } = await supabase
    .from('schools')
    .select('category')
    .neq('category', 'Nope')
    .neq('status', 'Inactive')

  const tierCounts = { A: 0, B: 0, C: 0 }
  for (const s of schoolRows ?? []) {
    if (s.category === 'A' || s.category === 'B' || s.category === 'C') {
      tierCounts[s.category as 'A' | 'B' | 'C']++
    }
  }

  return (
    <GetReadyClient
      reelAsset={reelAsset as { name: string; created_at: string } | null}
      resumeAsset={resumeAsset as { name: string; version: number; created_at: string } | null}
      transcriptAsset={transcriptAsset as { name: string; created_at: string } | null}
      playerScores={(profile as { player_scores: PlayerScores | null } | null)?.player_scores ?? null}
      testScoresCount={testScoresCount ?? 0}
      activeMessageCount={activeMessageCount ?? 0}
      activeQuestionCount={activeQuestionCount ?? 0}
      tierCounts={tierCounts}
      totalSchools={(schoolRows ?? []).length}
    />
  )
}

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GetRecruitedClient from '@/components/GetRecruitedClient'
import { getIngestionHealth } from '@/lib/ingestion-health'

export default async function GetRecruitedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const ingestionHealth = await getIngestionHealth()

  // Unmatched mail must never be indistinguishable from mail that never
  // arrived. Count only — the entry point renders solely when > 0, so a family
  // with clean matching never sees it. RLS scopes the count.
  const { count: unmatchedCount } = await supabase
    .from('contact_log')
    .select('id', { count: 'exact', head: true })
    .eq('parse_status', 'orphan')

  return (
    <GetRecruitedClient
      user={user}
      ingestionHealth={ingestionHealth}
      unmatchedCount={unmatchedCount ?? 0}
    />
  )
}

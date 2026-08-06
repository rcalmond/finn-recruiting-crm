import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GetSeenClient from '@/components/GetSeenClient'

export default async function GetSeenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Upcoming camps count (next 90 days)
  const today = new Date().toISOString().split('T')[0]
  const ninetyDaysOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    { count: upcomingCampsCount },
    { count: activeCampaignCount },
  ] = await Promise.all([
    supabase.from('camps')
      .select('*', { count: 'exact', head: true })
      .gte('start_date', today)
      .lte('start_date', ninetyDaysOut),
    supabase.from('campaigns')
      .select('*', { count: 'exact', head: true })
      .in('status', ['draft', 'active'])
      .is('archived_at', null),
  ])

  return (
    <GetSeenClient
      upcomingCampsCount={upcomingCampsCount ?? 0}
      activeCampaignCount={activeCampaignCount ?? 0}
    />
  )
}

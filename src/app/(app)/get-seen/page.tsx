import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GetSeenClient from '@/components/GetSeenClient'

export interface UpcomingCampItem {
  id: string
  name: string
  start_date: string
  host_school_short_name: string | null
  host_school_name: string
  finn_status: string | null  // 'registered' | 'targeted' | 'interested' | null
}

export default async function GetSeenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const today = new Date().toISOString().split('T')[0]
  const eightWeeksOut = new Date(Date.now() + 56 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    { data: upcomingCamps },
    { count: activeCampaignCount },
  ] = await Promise.all([
    supabase.from('camps')
      .select('id, name, start_date, host_school_id, schools!camps_host_school_id_fkey(name, short_name), camp_finn_status(status)')
      .gte('start_date', today)
      .lte('start_date', eightWeeksOut)
      .order('start_date', { ascending: true })
      .limit(10),
    supabase.from('campaigns')
      .select('*', { count: 'exact', head: true })
      .in('status', ['draft', 'active'])
      .is('archived_at', null),
  ])

  // Flatten the joined data
  const campItems: UpcomingCampItem[] = (upcomingCamps ?? []).map((c: Record<string, unknown>) => {
    const school = c.schools as { name: string; short_name: string | null } | null
    const finnStatus = c.camp_finn_status as Array<{ status: string }> | null
    return {
      id: c.id as string,
      name: c.name as string,
      start_date: c.start_date as string,
      host_school_short_name: school?.short_name ?? null,
      host_school_name: school?.name ?? 'Unknown',
      finn_status: finnStatus?.[0]?.status ?? null,
    }
  })

  return (
    <GetSeenClient
      upcomingCamps={campItems}
      activeCampaignCount={activeCampaignCount ?? 0}
    />
  )
}

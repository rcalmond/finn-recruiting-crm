import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GetSeenClient from '@/components/GetSeenClient'
import type { CalendarEventKind } from '@/lib/types'
import type { UpcomingCampItem, TimelineEventItem } from '@/components/get-seen/MergedTimeline'
import { buildHostIndex } from '@/lib/camp-host'

// Only camps Finn is actually pursuing belong on the timeline. Declined
// (and null / attended / other) camps are excluded from the merged calendar.
const TIMELINE_CAMP_STATUSES = ['interested', 'targeted', 'registered']

export default async function GetSeenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const today = new Date().toISOString().split('T')[0]
  // 10-week window (widened from 8 for fall planning).
  const tenWeeksOut = new Date(Date.now() + 70 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Active A/B/C school ids — scopes the coaches-on-file metric.
  const { data: activeSchoolRows } = await supabase.from('schools')
    .select('id').neq('category', 'Nope').neq('status', 'Inactive')
  const activeIds = (activeSchoolRows ?? []).map(r => r.id as string)

  // Host names for the camp timeline, resolved in JS rather than by an embed —
  // see the camps query below and camp-host.ts.
  const { data: hostRows } = await supabase.from('schools')
    .select('id, name, short_name, discovery_school_id')
  const hostIndex = buildHostIndex((hostRows ?? []) as Array<{ id: string; name: string; short_name: string | null; discovery_school_id: string | null }>)

  const [
    { data: upcomingCamps },
    { data: eventRows },
    { count: activeCampaignCount },
    { count: coachTotal },
    { count: coachReview },
  ] = await Promise.all([
    // NO schools EMBED: camps_host_school_id_fkey re-targets discovery_schools
    // at E1.5 and the embed would break (PGRST200). The host name is resolved in
    // JS against the family's own schools instead, which works either side of
    // the re-point — see camp-host.ts.
    supabase.from('camps')
      .select('id, name, start_date, end_date, host_school_id, camp_family_status(status)')
      .gte('start_date', today)
      .lte('start_date', tenWeeksOut)
      .order('start_date', { ascending: true })
      .limit(30),
    supabase.from('calendar_events')
      .select('id, kind, name, start_date, end_date, location, status')
      .lte('start_date', tenWeeksOut)
      .neq('status', 'skipped')
      .order('start_date', { ascending: true }),
    supabase.from('campaigns')
      .select('*', { count: 'exact', head: true })
      .in('status', ['draft', 'active'])
      .is('archived_at', null),
    supabase.from('coaches')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true).in('school_id', activeIds.length ? activeIds : ['00000000-0000-0000-0000-000000000000']),
    supabase.from('coaches')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true).eq('needs_review', true).in('school_id', activeIds.length ? activeIds : ['00000000-0000-0000-0000-000000000000']),
  ])

  // Upcoming or still-ongoing events (single-day: start >= today; range: not yet ended).
  const upcomingEvents: TimelineEventItem[] = (eventRows ?? [])
    .filter((e: Record<string, unknown>) => ((e.end_date as string) ?? (e.start_date as string)) >= today)
    .map((e: Record<string, unknown>) => ({
      id: e.id as string,
      kind: e.kind as CalendarEventKind,
      name: e.name as string,
      start_date: e.start_date as string,
      end_date: (e.end_date as string) ?? null,
      location: (e.location as string) ?? null,
      status: e.status as string,
    }))

  // Flatten the joined data, then keep only camps Finn is pursuing (declined /
  // null / attended / other are excluded from the merged calendar).
  const campItems: UpcomingCampItem[] = (upcomingCamps ?? [])
    .map((c: Record<string, unknown>) => {
      const school = hostIndex.get(c.host_school_id as string) ?? null
      // PostgREST returns this embed as a one-to-one OBJECT ({status}), not an
      // array — the old [0] read always yielded null. Handle both shapes.
      const cfs = c.camp_family_status as { status?: string } | Array<{ status: string }> | null
      const family_status = Array.isArray(cfs) ? (cfs[0]?.status ?? null) : (cfs?.status ?? null)
      return {
        id: c.id as string,
        name: c.name as string,
        start_date: c.start_date as string,
        end_date: (c.end_date as string) ?? null,
        host_school_short_name: school?.short_name ?? null,
        host_school_name: school?.name ?? 'Unknown',
        family_status,
      }
    })
    .filter(c => TIMELINE_CAMP_STATUSES.includes(c.family_status ?? ''))

  return (
    <GetSeenClient
      upcomingCamps={campItems}
      upcomingEvents={upcomingEvents}
      activeCampaignCount={activeCampaignCount ?? 0}
      userId={user.id}
      coachStats={{ total: coachTotal ?? 0, needsReview: coachReview ?? 0 }}
    />
  )
}

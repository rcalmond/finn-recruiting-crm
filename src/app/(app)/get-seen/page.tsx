import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GetSeenClient from '@/components/GetSeenClient'
import type { CalendarEventKind } from '@/lib/types'

export interface UpcomingCampItem {
  id: string
  name: string
  start_date: string
  end_date: string | null
  host_school_short_name: string | null
  host_school_name: string
  finn_status: string | null  // 'registered' | 'targeted' | 'interested' | null
}

// Only camps Finn is actually pursuing belong on the timeline. Declined
// (and null / attended / other) camps are excluded from the merged calendar.
const TIMELINE_CAMP_STATUSES = ['interested', 'targeted', 'registered']

// Lightweight event shape for the merged timeline (calendar_events, migration 061).
export interface TimelineEventItem {
  id: string
  kind: CalendarEventKind
  name: string
  start_date: string
  end_date: string | null
  location: string | null
  status: string
}

export default async function GetSeenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const today = new Date().toISOString().split('T')[0]
  // 10-week window (widened from 8 for fall planning).
  const tenWeeksOut = new Date(Date.now() + 70 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    { data: upcomingCamps },
    { data: eventRows },
    { count: activeCampaignCount },
  ] = await Promise.all([
    supabase.from('camps')
      .select('id, name, start_date, end_date, host_school_id, schools!camps_host_school_id_fkey(name, short_name), camp_finn_status(status)')
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
      const school = c.schools as { name: string; short_name: string | null } | null
      // PostgREST returns this embed as a one-to-one OBJECT ({status}), not an
      // array — the old [0] read always yielded null. Handle both shapes.
      const cfs = c.camp_finn_status as { status?: string } | Array<{ status: string }> | null
      const finn_status = Array.isArray(cfs) ? (cfs[0]?.status ?? null) : (cfs?.status ?? null)
      return {
        id: c.id as string,
        name: c.name as string,
        start_date: c.start_date as string,
        end_date: (c.end_date as string) ?? null,
        host_school_short_name: school?.short_name ?? null,
        host_school_name: school?.name ?? 'Unknown',
        finn_status,
      }
    })
    .filter(c => TIMELINE_CAMP_STATUSES.includes(c.finn_status ?? ''))

  return (
    <GetSeenClient
      upcomingCamps={campItems}
      upcomingEvents={upcomingEvents}
      activeCampaignCount={activeCampaignCount ?? 0}
    />
  )
}

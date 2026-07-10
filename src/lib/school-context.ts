/**
 * school-context.ts
 *
 * Shared helper for fetching school context used by LLM-calling routes.
 * Consolidates the school + coaches + contact_log + camps + decline history
 * + action items fetching that was previously duplicated across 5 routes.
 *
 * The parse_status filter on contact_log is always applied — orphan and
 * non_coach rows never leak into LLM prompts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SchoolRow {
  id: string
  name: string
  short_name: string | null
  category: string
  division: string
  conference: string | null
  location: string | null
  notes: string | null
  status: string
  head_coach: string | null
  admit_likelihood: string | null
}

export interface CoachRow {
  name: string
  role: string | null
  email: string | null
  is_primary: boolean
  needs_review: boolean
}

export interface ContactLogRow {
  date: string
  sent_at: string
  direction: string
  channel: string
  coach_name: string | null
  summary: string | null
  authored_by: string | null
  intent: string | null
}

export interface CampRow {
  name: string
  start_date: string
  end_date: string
  location: string | null
  registration_deadline: string | null
  status: string  // from camp_finn_status join
}

export interface ActionItemRow {
  action: string
  owner: string | null
  due_date: string | null
}

export interface CurrentAssets {
  highlightReelUrl: string | null
  highlightReelTitle: string | null
  fullGameFilmUrl: string | null
  sportsRecruitsProfileUrl: string | null
  resumeFileName: string | null
  transcriptFileName: string | null
}

export interface StatusUpdateRow {
  body: string
  share_with_coach: string
  created_at: string
}

export interface SchoolContext {
  school: SchoolRow | null
  coaches: CoachRow[]
  contactLog: ContactLogRow[]
  upcomingCamps: CampRow[]
  declineHistory: ContactLogRow[]
  actionItems: ActionItemRow[]
  strategicNotes: string | null
  statusUpdates: StatusUpdateRow[]
  currentAssets: CurrentAssets
}

export interface SchoolContextOptions {
  includeActionItems?: boolean  // default false
}

// ─── Fetcher ────────────────────────────────────────────────────────────────

export async function fetchSchoolContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  schoolId: string,
  options: SchoolContextOptions = {}
): Promise<SchoolContext> {
  const today = new Date().toISOString().split('T')[0]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queries: PromiseLike<{ data: any }>[] = [
    // 0. School details (superset of all routes' needs)
    admin.from('schools')
      .select('id, name, short_name, category, division, conference, location, notes, status, head_coach, admit_likelihood')
      .eq('id', schoolId)
      .single(),
    // 1. All active coaches
    admin.from('coaches')
      .select('name, role, email, is_primary, needs_review')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('is_primary', { ascending: false }),
    // 2. Full contact_log (chronological) — ALWAYS filtered
    admin.from('contact_log')
      .select('date, sent_at, direction, channel, coach_name, summary, authored_by, intent')
      .eq('school_id', schoolId)
      .not('parse_status', 'in', '("orphan","non_coach")')
      .order('sent_at', { ascending: true }),
    // 3. Upcoming camps with Finn's status
    admin.from('camps')
      .select('name, start_date, end_date, location, registration_deadline, camp_finn_status(status)')
      .eq('host_school_id', schoolId)
      .gte('start_date', today),
    // 4. Strategic notes (from school_message_plan)
    admin.from('school_message_plan')
      .select('finn_notes')
      .eq('school_id', schoolId)
      .maybeSingle(),
    // 5. Current assets (canonical source for reel URL, game film, etc.)
    admin.from('assets')
      .select('type, name, url, file_name, created_at')
      .eq('is_current', true)
      .order('created_at', { ascending: false }),
  ]

  // 6. Action items (optional)
  if (options.includeActionItems) {
    queries.push(
      admin.from('action_items')
        .select('action, owner, due_date')
        .eq('school_id', schoolId)
        .is('completed_at', null)
        .or(`due_date.is.null,due_date.gte.${today}`)
        .order('sort_order')
        .limit(5)
    )
  }

  // 7. Status updates (always — lightweight, max 10)
  queries.push(
    admin.from('school_status_updates')
      .select('body, share_with_coach, created_at')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(10)
  )

  const results = await Promise.all(queries)

  const school = results[0].data as SchoolRow | null
  const rawCoaches = (results[1].data ?? []) as Array<Record<string, unknown>>
  const rawContactLog = (results[2].data ?? []) as ContactLogRow[]
  const rawCamps = (results[3].data ?? []) as Array<Record<string, unknown>>
  const planRow = results[4].data as { finn_notes: string | null } | null
  const strategicNotes = planRow?.finn_notes?.trim() || null
  const rawAssets = (results[5].data ?? []) as Array<{ type: string; name: string | null; url: string | null; file_name: string | null }>
  const rawActions = options.includeActionItems
    ? (results[6].data ?? []) as ActionItemRow[]
    : []
  // Status updates index: 7 if no action items, 6+1=7 if action items
  const statusUpdatesIdx = options.includeActionItems ? 7 : 6
  const rawStatusUpdates = (results[statusUpdatesIdx]?.data ?? []) as StatusUpdateRow[]

  // Process coaches
  const coaches: CoachRow[] = rawCoaches.map(c => ({
    name: c.name as string,
    role: c.role as string | null,
    email: c.email as string | null,
    is_primary: c.is_primary as boolean,
    needs_review: c.needs_review as boolean,
  }))

  // Process camps (flatten join)
  const upcomingCamps: CampRow[] = rawCamps.map(c => {
    const fs = c.camp_finn_status as Array<{ status: string }> | null
    return {
      name: c.name as string,
      start_date: c.start_date as string,
      end_date: c.end_date as string,
      location: c.location as string | null,
      registration_deadline: c.registration_deadline as string | null,
      status: fs?.[0]?.status ?? 'no status',
    }
  })

  // Derive decline history from contact_log
  const declineHistory = rawContactLog.filter(r => r.intent === 'decline')

  // Process current assets — first match per type wins (ordered by created_at desc)
  // Reel URL sourced from assets table. Do NOT read from player_profile.current_reel_url
  // — that field is stale and managed via manual SQL.
  const assetByType = (type: string) => rawAssets.find(a => a.type === type)
  const reelAsset = assetByType('highlight_reel')
  const filmAsset = assetByType('game_film')
  const srAsset = assetByType('sports_recruits')
  const resumeAsset = assetByType('resume')
  const transcriptAsset = assetByType('transcript')

  const currentAssets: CurrentAssets = {
    highlightReelUrl: reelAsset?.url ?? null,
    highlightReelTitle: reelAsset?.name ?? null,
    fullGameFilmUrl: filmAsset?.url ?? null,
    sportsRecruitsProfileUrl: srAsset?.url ?? null,
    resumeFileName: resumeAsset?.file_name ?? null,
    transcriptFileName: transcriptAsset?.file_name ?? null,
  }

  return {
    school,
    coaches,
    contactLog: rawContactLog,
    upcomingCamps,
    declineHistory,
    actionItems: rawActions,
    strategicNotes,
    statusUpdates: rawStatusUpdates,
    currentAssets,
  }
}

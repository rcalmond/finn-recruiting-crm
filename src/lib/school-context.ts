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
import { campHostFilterIds } from '@/lib/camp-host'
import { withPrimary, primaryFirst } from '@/lib/coach-primary'
import { fetchCoachFamilyState, withFamilyState } from '@/lib/coach-family-state'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SchoolRow {
  id: string
  name: string
  short_name: string | null
  category: string
  division: string
  conference: string | null
  location: string | null
  status: string
  head_coach: string | null
  admit_likelihood: string | null
  recruiting_stage: number
  /** E2 private layer: the family's designated contact. Null until set. */
  primary_coach_id: string | null
}

export interface CoachRow {
  id: string
  name: string
  role: string | null
  email: string | null
  /** COMPOSED, not a column — see coach-primary.ts. Reads both domains. */
  isPrimary: boolean
  /** COMPOSED — this family has hidden them. Hidden coaches are INCLUDED here
   *  and flagged: a hidden coach is still a fact about the roster, and a
   *  generator should know the GK coach exists even though the family will
   *  never email him. Generators must not propose contacting a hidden coach. */
  hidden: boolean
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
  raw_source: string | null   // raw email body — the ONLY source for verbatim coach quotes
}

export interface CampRow {
  name: string
  start_date: string
  end_date: string
  location: string | null
  registration_deadline: string | null
  status: string  // from camp_family_status join
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

export interface MilestoneRow {
  milestone: string
  occurred_on: string | null
  note: string | null
}

export interface OfferRow {
  offer_type: string
  headline: string
  money_note: string | null
  conditions: string | null
  key_dates: string | null
  status: string
  received_on: string | null
  note: string | null
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
  milestones: MilestoneRow[]
  offers: OfferRow[]
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

  // Resolve the school's catalog linkage up front so the camps query can match
  // on either id form across E1.5's re-point (see camp-host.ts).
  const { data: hostRow } = await admin
    .from('schools').select('id, discovery_school_id').eq('id', schoolId).maybeSingle()
  const campHostIds = campHostFilterIds(hostRow ?? { id: schoolId })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queries: PromiseLike<{ data: any }>[] = [
    // 0. School details (superset of all routes' needs)
    admin.from('schools')
      .select('id, name, short_name, category, division, conference, location, status, head_coach, admit_likelihood, recruiting_stage, primary_coach_id')
      .eq('id', schoolId)
      .single(),
    // 1. All active coaches.
    //    NO DB-side .order('is_primary') — that column is going away and a
    //    sort on it cannot survive the re-point. Primary-first ordering is
    //    applied in JS below, off whichever domain answers (coach-primary.ts).
    admin.from('coaches')
      .select('id, name, role, email, is_primary, archived_at, needs_review')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    // 2. Full contact_log (chronological) — ALWAYS filtered
    admin.from('contact_log')
      .select('date, sent_at, direction, channel, coach_name, summary, authored_by, intent, raw_source')
      .eq('school_id', schoolId)
      .not('parse_status', 'in', '("orphan","non_coach")')
      .order('sent_at', { ascending: true }),
    // 3. Upcoming camps with the family's status.
    //    Filtered on BOTH id forms (see camp-host.ts): after E1.5 re-points
    //    camps.host_school_id at the catalog, an .eq() on the family school id
    //    matches nothing and every generator would silently believe this school
    //    has no camps — the worst kind of wrong, since the doc reads confident.
    admin.from('camps')
      .select('name, start_date, end_date, location, registration_deadline, camp_family_status(status)')
      .in('host_school_id', campHostIds)
      .gte('start_date', today),
    // 4. Strategic notes (from school_message_plan)
    admin.from('school_message_plan')
      .select('family_notes')
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

  // 8. Milestones (always — lightweight)
  queries.push(
    admin.from('school_milestones')
      .select('milestone, occurred_on, note')
      .eq('school_id', schoolId)
      .order('occurred_on')
  )

  // 9. Offers (always — lightweight)
  queries.push(
    admin.from('school_offers')
      .select('offer_type, headline, money_note, conditions, key_dates, status, received_on, note')
      .eq('school_id', schoolId)
      .order('received_on', { ascending: false })
  )

  const results = await Promise.all(queries)

  const school = results[0].data as SchoolRow | null
  const rawCoaches = (results[1].data ?? []) as Array<Record<string, unknown>>
  const rawContactLog = (results[2].data ?? []) as ContactLogRow[]
  const rawCamps = (results[3].data ?? []) as Array<Record<string, unknown>>
  const planRow = results[4].data as { family_notes: string | null } | null
  const strategicNotes = planRow?.family_notes?.trim() || null
  const rawAssets = (results[5].data ?? []) as Array<{ type: string; name: string | null; url: string | null; file_name: string | null }>
  const rawActions = options.includeActionItems
    ? (results[6].data ?? []) as ActionItemRow[]
    : []
  // Status updates index: 7 if no action items, 6+1=7 if action items
  const statusUpdatesIdx = options.includeActionItems ? 7 : 6
  const rawStatusUpdates = (results[statusUpdatesIdx]?.data ?? []) as StatusUpdateRow[]
  // Milestones index: statusUpdatesIdx + 1
  const milestonesIdx = statusUpdatesIdx + 1
  const rawMilestones = (results[milestonesIdx]?.data ?? []) as MilestoneRow[]
  // Offers index: milestonesIdx + 1
  const offersIdx = milestonesIdx + 1
  const rawOffers = (results[offersIdx]?.data ?? []) as OfferRow[]

  // Process coaches. isPrimary is COMPOSED from schools.primary_coach_id with
  // the legacy coaches.is_primary as fallback — no flag, both domains accepted.
  // This is the funnel for every generator: prompts.ts (x3), the message-plan,
  // plan-QA and conversation-summary generators, camp-doc and call-prep all
  // read their coach arrays from here, so composing once reaches all of them.
  const familyState = await fetchCoachFamilyState(admin, rawCoaches.map(c => c.id as string))
  const coaches: CoachRow[] = primaryFirst(
    withPrimary(
      school,
      withFamilyState(
        rawCoaches.map(c => ({
          id: c.id as string,
          name: c.name as string,
          role: c.role as string | null,
          email: c.email as string | null,
          is_primary: c.is_primary as boolean,
          archived_at: (c.archived_at ?? null) as string | null,
          needs_review: c.needs_review as boolean,
        })),
        familyState,
      ),
    ),
  ).map(({ is_primary: _legacy, archived_at: _legacyHide, notes: _notes, ...c }) => c)

  // Process camps (flatten join)
  const upcomingCamps: CampRow[] = rawCamps.map(c => {
    const fs = c.camp_family_status as Array<{ status: string }> | null
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
    milestones: rawMilestones,
    offers: rawOffers,
  }
}

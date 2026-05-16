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

export interface SchoolContext {
  school: SchoolRow | null
  coaches: CoachRow[]
  contactLog: ContactLogRow[]
  upcomingCamps: CampRow[]
  declineHistory: ContactLogRow[]
  actionItems: ActionItemRow[]
  strategicNotes: string | null
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
  ]

  // 5. Action items (optional)
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

  const results = await Promise.all(queries)

  const school = results[0].data as SchoolRow | null
  const rawCoaches = (results[1].data ?? []) as Array<Record<string, unknown>>
  const rawContactLog = (results[2].data ?? []) as ContactLogRow[]
  const rawCamps = (results[3].data ?? []) as Array<Record<string, unknown>>
  const planRow = results[4].data as { finn_notes: string | null } | null
  const strategicNotes = planRow?.finn_notes?.trim() || null
  const rawActions = options.includeActionItems
    ? (results[5].data ?? []) as ActionItemRow[]
    : []

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

  return {
    school,
    coaches,
    contactLog: rawContactLog,
    upcomingCamps,
    declineHistory,
    actionItems: rawActions,
    strategicNotes,
  }
}

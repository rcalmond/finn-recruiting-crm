/**
 * camps.ts
 *
 * Data layer for ID camps. Queries, mutations, and pure helpers.
 * Used by useCamps() hook and directly by server components.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Camp,
  CampFinnStatus,
  CampFinnStatusValue,
  CampSchoolAttendee,
  CampCoachAttendee,
  CampWithRelations,
  School,
} from './types'

// ─── Composition ─────────────────────────────────────────────────────────────

/**
 * Compose CampWithRelations[] from flat arrays fetched independently.
 * Pure function — no DB access.
 */
export function composeCampsWithRelations(
  camps: Camp[],
  schools: School[],
  finnStatuses: CampFinnStatus[],
  schoolAttendees: Array<CampSchoolAttendee & { school: Pick<School, 'id' | 'name' | 'short_name' | 'category'> }>,
  coachAttendees: CampCoachAttendee[],
): CampWithRelations[] {
  const schoolMap = new Map(schools.map(s => [s.id, s]))
  const statusByCamp = new Map(finnStatuses.map(fs => [fs.camp_id, fs]))
  const attendeesByCamp = new Map<string, typeof schoolAttendees>()
  for (const a of schoolAttendees) {
    if (!attendeesByCamp.has(a.camp_id)) attendeesByCamp.set(a.camp_id, [])
    attendeesByCamp.get(a.camp_id)!.push(a)
  }
  const coachesByCamp = new Map<string, CampCoachAttendee[]>()
  for (const c of coachAttendees) {
    if (!coachesByCamp.has(c.camp_id)) coachesByCamp.set(c.camp_id, [])
    coachesByCamp.get(c.camp_id)!.push(c)
  }

  return camps.map(camp => {
    const host = schoolMap.get(camp.host_school_id)
    return {
      camp,
      hostSchool: host
        ? { id: host.id, name: host.name, short_name: host.short_name, category: host.category }
        : { id: camp.host_school_id, name: 'Unknown', short_name: null, category: 'C' as School['category'] },
      finnStatus: statusByCamp.get(camp.id) ?? null,
      schoolAttendees: attendeesByCamp.get(camp.id) ?? [],
      coachAttendees: coachesByCamp.get(camp.id) ?? [],
    }
  })
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Create a camp and its default camp_finn_status row (status='interested').
 */
export async function createCamp(
  supabase: SupabaseClient,
  data: Omit<Camp, 'id' | 'created_at' | 'updated_at'>
): Promise<{ camp: Camp | null; error: string | null }> {
  const { data: camp, error } = await supabase
    .from('camps')
    .insert(data)
    .select()
    .single()

  if (error || !camp) return { camp: null, error: error?.message ?? 'Insert failed' }

  // Create default finn_status
  const { error: statusError } = await supabase
    .from('camp_finn_status')
    .insert({ camp_id: camp.id, status: 'interested' })

  if (statusError) {
    console.error('Camp created but finn_status insert failed:', statusError, 'campId:', camp.id)
  }

  return { camp: camp as Camp, error: null }
}

/**
 * Update camp fields.
 */
export async function updateCamp(
  supabase: SupabaseClient,
  id: string,
  data: Partial<Omit<Camp, 'id' | 'created_at' | 'updated_at'>>
): Promise<string | null> {
  const { error } = await supabase.from('camps').update(data).eq('id', id)
  return error?.message ?? null
}

/**
 * Update Finn's status for a camp. Sets the appropriate timestamp
 * without clearing historical ones.
 *
 * No action_items integration in this phase (deferred to A5).
 */
export async function updateFinnStatus(
  supabase: SupabaseClient,
  campId: string,
  status: CampFinnStatusValue,
  opts?: { declined_reason?: string; notes?: string }
): Promise<string | null> {
  const updates: Record<string, unknown> = { status }

  // Set the appropriate timestamp for this transition
  if (status === 'registered') updates.registered_at = new Date().toISOString()
  if (status === 'attended') updates.attended_at = new Date().toISOString()
  if (status === 'declined') {
    updates.declined_at = new Date().toISOString()
    if (opts?.declined_reason !== undefined) updates.declined_reason = opts.declined_reason
  }

  if (opts?.notes !== undefined) updates.notes = opts.notes

  const { error } = await supabase
    .from('camp_finn_status')
    .update(updates)
    .eq('camp_id', campId)

  return error?.message ?? null
}

/**
 * Delete a camp. Cascade FKs handle attendees + finn_status.
 */
export async function deleteCamp(
  supabase: SupabaseClient,
  id: string
): Promise<string | null> {
  const { error } = await supabase.from('camps').delete().eq('id', id)
  return error?.message ?? null
}

// ─── School attendee mutations ───────────────────────────────────────────────

/**
 * Add a school to a camp's attendee list.
 */
export async function addSchoolAttendee(
  supabase: SupabaseClient,
  campId: string,
  schoolId: string,
  source: string = 'advertised',
): Promise<string | null> {
  const { error } = await supabase
    .from('camp_school_attendees')
    .insert({ camp_id: campId, school_id: schoolId, source })
  return error?.message ?? null
}

/**
 * Remove a school from a camp's attendee list.
 */
export async function removeSchoolAttendee(
  supabase: SupabaseClient,
  campId: string,
  schoolId: string,
): Promise<string | null> {
  const { error } = await supabase
    .from('camp_school_attendees')
    .delete()
    .eq('camp_id', campId)
    .eq('school_id', schoolId)
  return error?.message ?? null
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Get the next upcoming camp hosted by a school.
 * Used by PipelineTable for the "ID Camps" column.
 */
export function getNextUpcomingCamp(
  camps: CampWithRelations[],
  schoolId: string,
  today: string,
): CampWithRelations | null {
  const upcoming = camps
    .filter(c => c.camp.host_school_id === schoolId && c.camp.start_date >= today)
    .sort((a, b) => a.camp.start_date.localeCompare(b.camp.start_date))
  return upcoming[0] ?? null
}

/**
 * Classify a camp as upcoming, ongoing, or past.
 */
export function classifyCampTimeframe(
  camp: Camp,
  today: string,
): 'upcoming' | 'ongoing' | 'past' {
  if (camp.start_date > today) return 'upcoming'
  if (camp.end_date >= today) return 'ongoing'
  return 'past'
}

/**
 * Sort camps: upcoming/ongoing first (asc by start_date), then past (desc by start_date).
 */
export function sortCampsChronological(camps: CampWithRelations[]): CampWithRelations[] {
  const today = new Date().toISOString().split('T')[0]
  const upcoming: CampWithRelations[] = []
  const past: CampWithRelations[] = []

  for (const c of camps) {
    if (c.camp.end_date >= today) {
      upcoming.push(c)
    } else {
      past.push(c)
    }
  }

  upcoming.sort((a, b) => a.camp.start_date.localeCompare(b.camp.start_date))
  past.sort((a, b) => b.camp.start_date.localeCompare(a.camp.start_date))

  return [...upcoming, ...past]
}

/**
 * Get camps relevant to a school — both as host and as attendee.
 * Used by school detail CampsSection (Phase A4).
 */
export function getCampsForSchool(
  camps: CampWithRelations[],
  schoolId: string,
): { hosted: CampWithRelations[]; attending: CampWithRelations[] } {
  const hosted: CampWithRelations[] = []
  const attending: CampWithRelations[] = []

  for (const c of camps) {
    if (c.camp.host_school_id === schoolId) {
      hosted.push(c)
    } else if (c.schoolAttendees.some(a => a.school_id === schoolId)) {
      attending.push(c)
    }
  }

  return { hosted, attending }
}

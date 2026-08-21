/**
 * camps.ts
 *
 * Data layer for ID camps. Queries, mutations, and pure helpers.
 * Used by useCamps() hook and directly by server components.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Camp,
  CampFamilyStatus,
  CampFamilyStatusValue,
  CampSchoolAttendee,
  CampCoachAttendee,
  CampWithRelations,
  School,
} from './types'
import { buildHostIndex, campHostIdFor } from '@/lib/camp-host'
import { campHostMatches, resolveHostSchool, type HostSchoolRef } from '@/lib/camp-host'

// ─── Composition ─────────────────────────────────────────────────────────────

/**
 * Compose CampWithRelations[] from flat arrays fetched independently.
 * Pure function — no DB access.
 */
export function composeCampsWithRelations(
  camps: Camp[],
  schools: School[],
  familyStatuses: CampFamilyStatus[],
  /** Raw rows. The school is resolved HERE rather than by a PostgREST embed:
   *  camp_school_attendees.school_id re-targets discovery_schools at E1.5, which
   *  breaks the embed outright, and resolving against the family's own list
   *  works on either side of the re-point. */
  schoolAttendees: CampSchoolAttendee[],
  coachAttendees: CampCoachAttendee[],
): CampWithRelations[] {
  // Indexed on BOTH id forms: after E1.5 re-points camps.host_school_id at the
  // catalog, a map keyed only on the family school id returns undefined for
  // every camp and each one renders as "Unknown" — no error, no empty state.
  const schoolMap = buildHostIndex(schools)
  const statusByCamp = new Map(familyStatuses.map(fs => [fs.camp_id, fs]))
  type ResolvedAttendee = CampSchoolAttendee & { school: Pick<School, 'id' | 'name' | 'short_name' | 'category'> }
  const attendeesByCamp = new Map<string, ResolvedAttendee[]>()
  for (const a of schoolAttendees) {
    const s = schoolMap.get(a.school_id)
    const resolved: ResolvedAttendee = {
      ...a,
      school: s
        ? { id: s.id, name: s.name, short_name: s.short_name, category: s.category }
        : { id: a.school_id, name: 'Unknown', short_name: null, category: 'C' as School['category'] },
    }
    if (!attendeesByCamp.has(a.camp_id)) attendeesByCamp.set(a.camp_id, [])
    attendeesByCamp.get(a.camp_id)!.push(resolved)
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
      familyStatus: statusByCamp.get(camp.id) ?? null,
      schoolAttendees: attendeesByCamp.get(camp.id) ?? [],
      coachAttendees: coachesByCamp.get(camp.id) ?? [],
    }
  })
}

// ─── Action item sync ────────────────────────────────────────────────────────

/**
 * Maintains the invariant: status='targeted' AND registration_deadline IS NOT NULL
 * ↔ active action_item exists. (Model B: 'targeted' gates action items, not 'interested'.)
 *
 * Called by createCamp, updateCamp, updateFamilyStatus, and deleteCamp.
 */
async function syncActionItemForCamp(
  supabase: SupabaseClient,
  opts: {
    campId: string
    campName: string
    hostSchoolId: string
    status: CampFamilyStatusValue
    registrationDeadline: string | null
    actionItemId: string | null
  }
): Promise<string | null> {
  const { campId, campName, hostSchoolId, status, registrationDeadline, actionItemId } = opts
  const shouldExist = status === 'targeted' && registrationDeadline !== null

  // hostSchoolId is whatever camps.host_school_id holds — a FAMILY id today, a
  // CATALOG id after E1.5. action_items.school_id is family-scoped either way,
  // so resolve rather than write through.
  let familySchoolId = hostSchoolId
  if (shouldExist) {
    const { data: famRows } = await supabase.from('schools').select('id, discovery_school_id')
    familySchoolId =
      resolveHostSchool(hostSchoolId, (famRows ?? []) as Array<{ id: string; discovery_school_id: string | null }>)?.id
      ?? hostSchoolId
  }

  if (shouldExist && !actionItemId) {
    // CREATE: interested + deadline, no action_item yet
    const { data: maxData } = await supabase
      .from('action_items')
      .select('sort_order')
      .is('completed_at', null)
      .order('sort_order', { ascending: false, nullsFirst: false })
      .limit(1)
      .single()
    const nextOrder = ((maxData as { sort_order: number } | null)?.sort_order ?? 0) + 1

    const { data: item, error } = await supabase
      .from('action_items')
      .insert({
        // action_items.school_id points at the FAMILY schools table, while
        // hostSchoolId becomes a CATALOG id at E1.5. Resolved back rather than
        // written through — the same wrong-domain write as prep_docs.school_id.
        school_id: familySchoolId,
        action: `Register: ${campName}`,
        owner: 'Finn',
        due_date: registrationDeadline,
        sort_order: nextOrder,
      })
      .select('id')
      .single()

    if (error || !item) {
      console.error('Failed to create camp action_item:', error, 'campId:', campId)
      return null
    }

    // Store the reference
    await supabase
      .from('camp_family_status')
      .update({ action_item_id: item.id })
      .eq('camp_id', campId)

    return item.id

  } else if (shouldExist && actionItemId) {
    // UPDATE: interested + deadline, action_item exists — sync due_date, action text,
    // and clear completed_at (reactivates if previously completed via registered→interested)
    await supabase
      .from('action_items')
      .update({ due_date: registrationDeadline, action: `Register: ${campName}`, completed_at: null })
      .eq('id', actionItemId)

    return actionItemId

  } else if (!shouldExist && actionItemId) {
    // Need to remove or complete the action_item
    if (status === 'registered' || status === 'attended') {
      // COMPLETE: transitioned to registered or attended
      await supabase
        .from('action_items')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', actionItemId)
      // Keep the reference (history)
      return actionItemId

    } else {
      // DELETE: declined, or status returned to interested (no longer targeted)
      await supabase.from('action_items').delete().eq('id', actionItemId)
      await supabase
        .from('camp_family_status')
        .update({ action_item_id: null })
        .eq('camp_id', campId)
      return null
    }
  }

  // No action needed (no deadline + no action_item, or non-targeted + no action_item)
  return actionItemId
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Create a camp and its default camp_family_status row (status='interested').
 * Action item creation deferred until status transitions to 'targeted' (Model B).
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

  // Create default family_status
  const { error: statusError } = await supabase
    .from('camp_family_status')
    .insert({ camp_id: camp.id, status: 'interested' })

  if (statusError) {
    console.error('Camp created but family_status insert failed:', statusError, 'campId:', camp.id)
  }

  // Sync action_item if deadline exists
  const typedCamp = camp as Camp
  if (typedCamp.registration_deadline) {
    await syncActionItemForCamp(supabase, {
      campId: typedCamp.id,
      campName: typedCamp.name,
      hostSchoolId: typedCamp.host_school_id,
      status: 'interested',
      registrationDeadline: typedCamp.registration_deadline,
      actionItemId: null,
    })
  }

  return { camp: typedCamp, error: null }
}

/**
 * Update camp fields. Syncs action_item if registration_deadline changed.
 */
export async function updateCamp(
  supabase: SupabaseClient,
  id: string,
  data: Partial<Omit<Camp, 'id' | 'created_at' | 'updated_at'>>
): Promise<string | null> {
  const { error } = await supabase.from('camps').update(data).eq('id', id)
  if (error) return error.message

  // If deadline or name changed, sync action_item
  if ('registration_deadline' in data || 'name' in data || 'host_school_id' in data) {
    // Fetch current camp + family_status to get full context
    const { data: camp } = await supabase.from('camps').select('*').eq('id', id).single()
    const { data: fs } = await supabase.from('camp_family_status').select('*').eq('camp_id', id).single()

    if (camp && fs) {
      const typedCamp = camp as Camp
      const typedFs = fs as CampFamilyStatus
      await syncActionItemForCamp(supabase, {
        campId: id,
        campName: typedCamp.name,
        hostSchoolId: typedCamp.host_school_id,
        status: typedFs.status,
        registrationDeadline: typedCamp.registration_deadline,
        actionItemId: typedFs.action_item_id,
      })
    }
  }

  return null
}

/**
 * Update Finn's status for a camp. Sets the appropriate timestamp
 * without clearing historical ones. Syncs action_item per status transition.
 */
export async function updateFamilyStatus(
  supabase: SupabaseClient,
  campId: string,
  status: CampFamilyStatusValue,
  opts?: { declined_reason?: string; notes?: string }
): Promise<string | null> {
  const updates: Record<string, unknown> = { status }

  // Set the appropriate timestamp for this transition
  if (status === 'targeted') updates.targeted_at = new Date().toISOString()
  if (status === 'registered') updates.registered_at = new Date().toISOString()
  if (status === 'attended') updates.attended_at = new Date().toISOString()
  if (status === 'declined') {
    updates.declined_at = new Date().toISOString()
    if (opts?.declined_reason !== undefined) updates.declined_reason = opts.declined_reason
  }

  if (opts?.notes !== undefined) updates.notes = opts.notes

  const { error } = await supabase
    .from('camp_family_status')
    .update(updates)
    .eq('camp_id', campId)

  if (error) return error.message

  // Sync action_item for the new status
  const { data: camp } = await supabase.from('camps').select('*').eq('id', campId).single()
  const { data: fs } = await supabase.from('camp_family_status').select('*').eq('camp_id', campId).single()

  if (camp && fs) {
    const typedCamp = camp as Camp
    const typedFs = fs as CampFamilyStatus
    await syncActionItemForCamp(supabase, {
      campId,
      campName: typedCamp.name,
      hostSchoolId: typedCamp.host_school_id,
      status: typedFs.status,
      registrationDeadline: typedCamp.registration_deadline,
      actionItemId: typedFs.action_item_id,
    })
  }

  return null
}

/**
 * Delete a camp. Deletes associated action_item if it exists,
 * then cascade FKs handle attendees + family_status.
 */
export async function deleteCamp(
  supabase: SupabaseClient,
  id: string
): Promise<string | null> {
  // Delete associated action_item if it exists (not cascaded by FK)
  const { data: fs } = await supabase
    .from('camp_family_status')
    .select('action_item_id')
    .eq('camp_id', id)
    .single()

  if (fs && (fs as CampFamilyStatus).action_item_id) {
    await supabase.from('action_items').delete().eq('id', (fs as CampFamilyStatus).action_item_id!)
  }

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
  // WRITE side: camp_school_attendees.school_id becomes a CATALOG id at E1.5.
  // The family school is resolved to whichever id form the column expects (see
  // camp-host.ts); reads accept both, writes must pick one.
  const { data: school } = await supabase
    .from('schools').select('id, discovery_school_id').eq('id', schoolId).maybeSingle()
  const value = school ? campHostIdFor(school as { id: string; discovery_school_id: string | null }) : schoolId
  const { error } = await supabase
    .from('camp_school_attendees')
    .insert({ camp_id: campId, school_id: value, source })
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
  /** The school itself, not just its id: camps.host_school_id holds a FAMILY id
   *  today and a CATALOG id after E1.5, so matching needs both forms. */
  school: HostSchoolRef,
  today: string,
): CampWithRelations | null {
  const upcoming = camps
    .filter(c => campHostMatches(c.camp.host_school_id, school) && c.camp.start_date >= today)
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
  /** See getNextUpcomingCamp — both id forms are needed across the re-point. */
  school: HostSchoolRef,
): { hosted: CampWithRelations[]; attending: CampWithRelations[] } {
  const hosted: CampWithRelations[] = []
  const attending: CampWithRelations[] = []

  for (const c of camps) {
    if (campHostMatches(c.camp.host_school_id, school)) {
      hosted.push(c)
    } else if (c.schoolAttendees.some(a => campHostMatches(a.school_id, school))) {
      attending.push(c)
    }
  }

  return { hosted, attending }
}

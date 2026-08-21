/**
 * camp-proposal-queue.ts — what is actually pending FOR ONE FAMILY.
 *
 * camp_proposals is a SHARED catalog table: one proposal, reviewed once. Its
 * status is therefore a fact about the world (pending / applied / invalid), not
 * about any family's appetite. Before the per-family split, every read surface
 * filtered status='pending' with no family dimension, which meant one family's
 * reject removed the proposal from EVERY family's queue.
 *
 * A family's queue is: pending proposals MINUS the ones that family dismissed.
 * That subtraction lives here so the page, the sidebar badge and the tools badge
 * cannot drift apart — three copies of this logic would eventually disagree, and
 * a badge that disagrees with its page is how people learn to ignore badges.
 *
 * READ ORDER MATTERS: the pending set is fetched first and the decision lookup
 * is bounded BY IT (.in on those ids). Fetching every dismissal instead would
 * grow without bound and eventually meet the silent 1000-row PostgREST cap.
 */
import { familyAdmin } from '@/lib/tenant-db'
import { fetchAll } from '@/lib/fetch-all'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Proposal ids that are pending AND not dismissed by this family.
 *
 * `reader` is the client used for the shared camp_proposals read (the caller's
 * user client, so RLS still applies to the catalog table). Decisions are read
 * through familyAdmin because camp_proposal_decisions has RLS on and its
 * policy set is not something a read surface should be betting on.
 */
export async function pendingProposalIdsForFamily(
  reader: SupabaseClient,
  familyId: string,
): Promise<string[]> {
  // HOSTED AT ONE OF THIS FAMILY'S SCHOOLS. Once the crons scan the union of
  // families, camp_proposals contains proposals for schools this family does
  // not track — and a shared table filtered only by status would put another
  // family's camp in this family's review queue. Invisible while one family
  // existed, which is exactly why it survived until the pin came off.
  // BOTH id forms: camp_proposals.host_school_id re-points at the catalog with
  // camps at E1.5, so a set of family ids alone would match nothing and every
  // family's proposal queue would silently empty — a queue that says "nothing
  // waiting" is indistinguishable from a queue that is actually clear.
  const scoped = familyAdmin(familyId)
  const mySchools = await fetchAll<{ id: string; discovery_school_id: string | null }>(
    scoped, 'schools', 'id, discovery_school_id', { orderBy: 'id' })
  const mine = new Set<string>()
  for (const s of mySchools) {
    mine.add(s.id)
    if (s.discovery_school_id) mine.add(s.discovery_school_id)
  }
  if (mine.size === 0) return []

  const { data: pending, error } = await reader
    .from('camp_proposals')
    .select('id, host_school_id')
    .eq('status', 'pending')

  if (error) {
    console.error('[camp-queue] pending read failed:', error.message)
    return []
  }

  const ids = (pending ?? [])
    .filter(p => mine.has(p.host_school_id as string))
    .map(p => p.id as string)
  if (ids.length === 0) return []

  const { data: dismissed, error: decErr } = await familyAdmin(familyId)
    .from('camp_proposal_decisions')
    .select('proposal_id')
    .eq('decision', 'dismissed')
    .in('proposal_id', ids)

  if (decErr) {
    // Fail toward SHOWING the proposal. A queue item a family already dismissed
    // is noise they can dismiss again; a hidden one they never see is a camp
    // they never hear about.
    console.error('[camp-queue] dismissal read failed:', decErr.message)
    return ids
  }

  const hidden = new Set((dismissed ?? []).map(d => d.proposal_id as string))
  return ids.filter(id => !hidden.has(id))
}

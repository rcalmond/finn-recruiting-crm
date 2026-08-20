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
  const { data: pending, error } = await reader
    .from('camp_proposals')
    .select('id')
    .eq('status', 'pending')

  if (error) {
    console.error('[camp-queue] pending read failed:', error.message)
    return []
  }

  const ids = (pending ?? []).map(p => p.id as string)
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

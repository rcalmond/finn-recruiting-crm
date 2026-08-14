/**
 * require-family.ts — T1: resolve the authenticated user's family in one place.
 *
 * Every route that needs a tenant scope calls this instead of a bare
 * auth.getUser(). Returns the RLS-enforcing user client alongside the ids, so
 * user-client routes need no second construction. The users lookup runs on the
 * user client and is itself RLS-scoped (family members read family users).
 */

import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'

export interface FamilyContext {
  user: User
  familyId: string
  /** The cookie-backed, RLS-enforcing client for this request. */
  supabase: SupabaseClient
}

/** Returns null when unauthenticated OR when the user has no family binding —
 *  callers treat both as 401/403 respectively via the discriminant. */
export async function getFamilyContext(): Promise<
  { ok: true; ctx: FamilyContext } | { ok: false; status: 401 | 403 }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401 }
  const { data } = await supabase
    .from('users')
    .select('family_id')
    .eq('id', user.id)
    .maybeSingle()
  const familyId = (data?.family_id as string | undefined) ?? null
  if (!familyId) return { ok: false, status: 403 }
  return { ok: true, ctx: { user, familyId, supabase } }
}

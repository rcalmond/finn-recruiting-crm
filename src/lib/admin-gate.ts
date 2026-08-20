/**
 * admin-gate.ts — the minimal admin check for the inbound console.
 *
 * Deliberately an ENV ALLOWLIST of auth user ids, not a role model: there is no
 * admin concept in the schema yet, inventing one here would drag RLS and a
 * permission surface into the email-boundary build, and an env list is
 * trivially revocable. The real role model is deferred.
 *
 * ADMIN_USER_IDS="uuid1,uuid2"
 */
import { createClient } from '@/lib/supabase/server'

export interface AdminCheck {
  ok: boolean
  userId: string | null
  /** The acting admin's email, for audit columns. The id is the durable key;
   *  the email is the READABLE one — an audit row nobody can read without a
   *  second lookup is the same decoration as no audit row at all. */
  email: string | null
}

export async function requireAdmin(): Promise<AdminCheck> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, userId: null, email: null }

  const allow = (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  // Fail closed: an unset allowlist grants nobody access.
  return { ok: allow.includes(user.id), userId: user.id, email: user.email ?? null }
}

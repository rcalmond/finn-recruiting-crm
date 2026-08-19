/**
 * family-identity.ts — the per-message identity context.
 *
 * Loaded ONCE per inbound message, immediately after routing, and threaded into
 * every parser. It replaces the module-level identity constants that assumed a
 * single family (FINN_EMAILS, the Finn-named regexes, USER_TIMEZONE).
 *
 * FAIL CLOSED ON AN EMPTY SENDING SET. Direction detection compares the From
 * header against `sendingAddresses`; with an empty set every message a family
 * sent would be filed as INBOUND FROM A COACH, which inverts touchpoint
 * classification, falsely lights awaiting-reply, promotes the stage floor on the
 * family's own words, and lets summaries read the family as the coach. Callers
 * MUST check `hasSendingAddresses` and refuse address-based direction rather
 * than defaulting. (The SR notification path is structurally safe — it derives
 * direction from notification TYPE, not addresses — so this gate matters for the
 * Gmail/OAuth path and any future convergence.)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface FamilyIdentity {
  familyId: string
  /** Full player name, or null when the family has no player row yet. */
  playerName: string | null
  playerFirstName: string | null
  /** IANA zone for date localization — replaces the USER_TIMEZONE constant. */
  homeTimezone: string
  /** Addresses the FAMILY sends from — the direction-detection input. */
  sendingAddresses: Set<string>
  /** Addresses the family RECEIVES at — used for CC copy, never for direction. */
  inboundAddresses: Set<string>
  /** False = refuse address-based direction detection (see above). */
  hasSendingAddresses: boolean
}

const DEFAULT_TZ = 'America/Denver'

/**
 * @param admin a familyAdmin client already scoped to this family
 */
export async function loadFamilyIdentity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  familyId: string,
): Promise<FamilyIdentity> {
  // TODO(multi-player): first player by created_at; schema supports several.
  const [playerRes, sendingRes, inboundRes] = await Promise.all([
    admin.from('players').select('name, home_timezone')
      .order('created_at', { ascending: true }).limit(1).maybeSingle(),
    admin.from('family_sending_addresses').select('address'),
    admin.from('family_inbound_addresses').select('address, status').eq('family_id', familyId),
  ])

  const playerName = ((playerRes.data?.name as string | null) ?? '').trim() || null
  const homeTimezone = ((playerRes.data?.home_timezone as string | null) ?? '').trim() || DEFAULT_TZ

  const sendingAddresses = new Set(
    ((sendingRes.data ?? []) as { address: string }[])
      .map(r => (r.address ?? '').trim().toLowerCase())
      .filter(Boolean),
  )
  const inboundAddresses = new Set(
    ((inboundRes.data ?? []) as { address: string; status: string }[])
      .filter(r => r.status === 'active')
      .map(r => (r.address ?? '').trim().toLowerCase())
      .filter(Boolean),
  )

  // A FAILED read must not look like an empty set (fail-closed on absence):
  // an error leaves hasSendingAddresses false, which refuses direction
  // inference rather than asserting everything is inbound.
  if (sendingRes.error) {
    console.error(`[family-identity] sending-address read failed for ${familyId}: ${sendingRes.error.message}`)
  }

  return {
    familyId,
    playerName,
    playerFirstName: playerName ? playerName.split(/\s+/)[0] : null,
    homeTimezone,
    sendingAddresses,
    inboundAddresses,
    hasSendingAddresses: !sendingRes.error && sendingAddresses.size > 0,
  }
}

/** Is this address one the family sends from? Empty set answers false, and
 *  callers must treat "no set" as "cannot determine", not as "inbound". */
export function isFamilySender(identity: FamilyIdentity, email: string | null | undefined): boolean {
  if (!email) return false
  return identity.sendingAddresses.has(email.trim().toLowerCase())
}

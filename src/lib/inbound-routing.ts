/**
 * inbound-routing.ts — recipient → family dispatch for inbound mail.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * THE RULE: ENVELOPE FOR ROUTING, HEADERS FOR IDENTITY.
 *
 *   envelope.to   — the TRUE SMTP recipient. The ONLY routing input.
 *   To header     — under Gmail forwarding this names the ORIGINAL mailbox
 *                   (finnalmond08@gmail.com), not the address that actually
 *                   received the mail. Routing on it MIS-FILES. Never a routing
 *                   input, at any layer, for any reason.
 *   envelope.from — REWRITTEN by Gmail on forward
 *                   (finnalmond08+caf_=finn=in.finnsoccer.com@gmail.com).
 *                   Never used for sender identity; corroboration only.
 *   From header   — survives forwarding intact. THE sender-identity input.
 *
 * Proven on live forwarded mail by the envelope probe (2026-08-19):
 *   envelope.to = ["finn@in.finnsoccer.com"]   ← the receiving address
 *   header.to   = "Finn Almond <finnalmond08@gmail.com>"  ← the original mailbox
 * ══════════════════════════════════════════════════════════════════════════
 *
 * REFUSE AND QUARANTINE. A message whose envelope resolves to zero or several
 * families is NEVER guessed at from content. There is deliberately no "which
 * family has a matching school" fallback: that mis-files precisely on coaches
 * who recruit two families' players — the failure this whole boundary exists to
 * prevent. Quarantined mail writes NO contact_log row.
 */
import { rawService } from '@/lib/tenant-db'

export type QuarantineReason =
  | 'no_match'            // envelope recipient(s) match no registered address
  | 'ambiguous'           // recipients resolve to more than one family
  | 'retired_address'     // matches only retired registration(s)
  | 'malformed_envelope'  // envelope absent or unparseable
  | 'mode_conflict'       // family has both OAuth sync and active forwarding

export interface ParsedEnvelope {
  to: string[]
  from: string | null
}

export type RouteResult =
  | { ok: true; familyId: string; matchedAddress: string }
  | { ok: false; reason: QuarantineReason; matchedFamilyIds: string[] }

/** Normalize an address for comparison: trim, strip display name and angle
 *  brackets, lowercase. SMTP local parts are technically case-sensitive;
 *  in practice no provider treats them so, and registrations are stored lower. */
export function normalizeAddress(raw: string): string {
  const trimmed = (raw ?? '').trim()
  const angled = trimmed.match(/<([^>]+)>/)
  return (angled ? angled[1] : trimmed).trim().toLowerCase()
}

/** Parse SendGrid's `envelope` field. Returns null when absent/unparseable —
 *  the caller quarantines with 'malformed_envelope' rather than falling back
 *  to any header. */
export function parseEnvelope(raw: string | null | undefined): ParsedEnvelope | null {
  if (!raw || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw) as { to?: unknown; from?: unknown }
    const to = Array.isArray(parsed.to)
      ? parsed.to.filter((v): v is string => typeof v === 'string').map(normalizeAddress).filter(Boolean)
      : []
    const from = typeof parsed.from === 'string' ? normalizeAddress(parsed.from) : null
    if (to.length === 0) return null
    return { to, from }
  } catch {
    return null
  }
}

/**
 * Resolve the owning family from envelope recipients.
 *
 * Exactly one distinct family → route. Anything else refuses. Multi-family
 * envelopes are NOT fanned out: a human reviewing one quarantined message is
 * cheap, and fan-out risks double-filing if the platform also posts per
 * recipient. The quarantine reason records which behaviour we actually saw.
 */
export async function resolveFamilyFromEnvelope(
  envelope: ParsedEnvelope | null,
): Promise<RouteResult> {
  if (!envelope || envelope.to.length === 0) {
    return { ok: false, reason: 'malformed_envelope', matchedFamilyIds: [] }
  }

  // Cross-family read by design (see ROUTING_TABLES in tenant-db).
  const db = rawService()
  const { data, error } = await db
    .from('family_inbound_addresses')
    .select('family_id, address, status')
    .in('address', envelope.to)

  if (error) {
    // Fail closed: a failed lookup is NOT "no family". Quarantine so the
    // message is recoverable rather than silently dropped or mis-filed.
    console.error('[inbound-routing] address lookup failed:', error.message)
    return { ok: false, reason: 'no_match', matchedFamilyIds: [] }
  }

  const rows = (data ?? []) as { family_id: string; address: string; status: string }[]
  const active = rows.filter(r => r.status === 'active')

  if (active.length === 0) {
    // Distinguish "we know this address but it is retired" from "never heard of
    // it" — a retired address receiving mail again is a signal worth seeing.
    const reason: QuarantineReason = rows.length > 0 ? 'retired_address' : 'no_match'
    return { ok: false, reason, matchedFamilyIds: Array.from(new Set(rows.map(r => r.family_id))) }
  }

  const familyIds = Array.from(new Set(active.map(r => r.family_id)))
  if (familyIds.length > 1) {
    return { ok: false, reason: 'ambiguous', matchedFamilyIds: familyIds }
  }

  return { ok: true, familyId: familyIds[0], matchedAddress: active[0].address }
}

export interface QuarantineInput {
  reason: QuarantineReason
  matchedFamilyIds?: string[]
  envelopeTo: string[]
  envelopeFrom: string | null
  headerFrom: string
  headerTo: string
  subject: string
  /** The SendGrid form fields, stored so the message can be REPLAYED through
   *  the identical ingestion path once an address is registered. */
  rawPayload: Record<string, string>
}

/** Write a quarantine row. Never throws — a quarantine failure must not also
 *  cost the message a 200 (SendGrid would retry into the same failure). */
export async function quarantineMessage(input: QuarantineInput): Promise<void> {
  try {
    const db = rawService()
    const { error } = await db.from('inbound_quarantine').insert({
      envelope_to: input.envelopeTo,
      envelope_from: input.envelopeFrom,
      header_from: input.headerFrom,
      header_to: input.headerTo,
      subject: input.subject,
      reason: input.reason,
      matched_family_ids: input.matchedFamilyIds ?? [],
      raw_payload: input.rawPayload,
      status: 'new',
    })
    if (error) console.error('[inbound-routing] quarantine insert failed:', error.message)
  } catch (err) {
    console.error('[inbound-routing] quarantine threw:', err instanceof Error ? err.message : err)
  }
}

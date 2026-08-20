/**
 * mint-inbound-address.ts — create a family's inbound (forwarding) address.
 *
 * Format: <slug>-<suffix>@<domain>   e.g. testerson-k3f9m2@in.finnsoccer.com
 *
 * WHY A RANDOM SUFFIX: the address is the ONLY routing credential. Anyone who
 * can guess it can inject fabricated coach mail into a family's timeline —
 * mail that would be indistinguishable from the real thing once filed. Six
 * characters from a 31-symbol unambiguous alphabet is ~0.9 billion
 * combinations; four would be brute-forceable against a guessable slug.
 *
 * PLATFORM NOTE (confirmed 2026-08-19 from SendGrid's own Edit Host & URL
 * dialog, not inferred): "Email sent to ANY address in the receiving domain
 * will be processed by Inbound Parse and POSTed to the destination URL." One
 * host entry covers in.finnsoccer.com domain-wide, so a freshly minted local
 * part needs ZERO platform configuration — it works the moment the row exists.
 *
 * Generate → insert → on unique violation regenerate and retry, bounded.
 * Never check-then-insert: that races, and the global unique index on
 * lower(address) is the real enforcement.
 */
import { rawService } from '@/lib/tenant-db'

/** No 0/O/1/l/i — an address gets read aloud, typed, and copied by hand. */
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
const SUFFIX_LENGTH = 6
const MAX_ATTEMPTS = 8
const PG_UNIQUE_VIOLATION = '23505'

export const INBOUND_DOMAIN = process.env.INBOUND_DOMAIN ?? 'in.finnsoccer.com'

/** Family name → address-safe slug: ASCII-folded, lowercased, punctuation
 *  collapsed to single hyphens, trimmed, capped at 24 chars. */
export function slugifyFamilyName(name: string): string {
  const slug = (name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')      // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/, '')                    // truncation may have left a trailing -
  return slug || 'family'                  // never emit an empty local part
}

function randomSuffix(): string {
  const bytes = new Uint8Array(SUFFIX_LENGTH)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

export type MintResult =
  | { ok: true; address: string; id: string; attempts: number }
  | { ok: false; reason: 'already_has_active'; existing: string[] }
  | { ok: false; reason: 'family_not_found' }
  | { ok: false; reason: 'exhausted_attempts' | 'insert_failed'; detail?: string }

/** WHO minted. Required, and deliberately a POSITIONAL argument rather than an
 *  optional field on MintOptions: minting creates a family's only routing
 *  credential, so "which admin did this" must never be silently omittable. A
 *  required position makes the compiler find every call site. */
export interface Minter {
  userId: string | null
  email: string | null
}

export interface MintOptions {
  /** Mint a SECOND address for a family that already has one. Off by default:
   *  silently minting duplicates makes "which address is mine?" ambiguous
   *  later, and ambiguity in a routing credential is the last thing we want. */
  allowAdditional?: boolean
  label?: string
}

export async function mintInboundAddress(
  familyId: string,
  minter: Minter,
  opts: MintOptions = {},
): Promise<MintResult> {
  const db = rawService()

  const { data: family } = await db
    .from('families').select('id, name').eq('id', familyId).maybeSingle()
  if (!family) return { ok: false, reason: 'family_not_found' }

  if (!opts.allowAdditional) {
    const { data: active } = await db
      .from('family_inbound_addresses')
      .select('address')
      .eq('family_id', familyId)
      .eq('status', 'active')
    const existing = ((active ?? []) as { address: string }[]).map(r => r.address)
    if (existing.length > 0) {
      return { ok: false, reason: 'already_has_active', existing }
    }
  }

  const slug = slugifyFamilyName((family.name as string | null) ?? '')

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Lowercase on write; the unique index on lower(address) enforces.
    const address = `${slug}-${randomSuffix()}@${INBOUND_DOMAIN}`.toLowerCase()

    const { data, error } = await db
      .from('family_inbound_addresses')
      .insert({
        family_id: familyId,
        address,
        label: opts.label ?? 'primary — minted',
        status: 'active',
        minted_by: minter.userId,
        minted_by_email: minter.email,
      })
      .select('id')
      .single()

    if (!error && data) {
      console.log(`[mint-inbound] minted ${address} for family ${familyId} (attempt ${attempt})`)
      return { ok: true, address, id: (data as { id: string }).id, attempts: attempt }
    }

    // A collision is expected-rare; regenerate the suffix and retry.
    if (error?.code === PG_UNIQUE_VIOLATION) {
      console.warn(`[mint-inbound] collision on ${address} (attempt ${attempt}) — regenerating`)
      continue
    }

    console.error(`[mint-inbound] insert failed: ${error?.message}`)
    return { ok: false, reason: 'insert_failed', detail: error?.message }
  }

  return { ok: false, reason: 'exhausted_attempts' }
}

/**
 * gmail-verification.ts — capture Google's forwarding-confirmation mail.
 *
 * Gmail's "add a forwarding address" flow mails a confirmation code to the
 * DESTINATION — which is our parse pipeline. Before this existed the message
 * fell through the non-SR drop and was discarded, and the code lived only in a
 * body we never logged, so every alpha family stalled at setup.
 *
 * SENDER GATE READS THE **From HEADER**, not envelope.from. The probe proved
 * Gmail rewrites envelope.from on forward (…+caf_=…@gmail.com) while the From
 * header survives intact — "envelope for routing, headers for identity".
 *
 * Runs AFTER routing (so we know whose code it is) and BEFORE the non-SR drop.
 */
import { rawService } from '@/lib/tenant-db'

const GOOGLE_FORWARDING_SENDER = 'forwarding-noreply@google.com'

/** True when this is a Google forwarding-confirmation message. */
export function isGmailForwardingConfirmation(headerFrom: string, subject: string): boolean {
  const fromMatch = headerFrom.toLowerCase().includes(GOOGLE_FORWARDING_SENDER)
  if (!fromMatch) return false
  // Corroborate with the subject so unrelated Google mail can't trip it.
  return /forwarding|confirm/i.test(subject)
}

/** Google's confirmation code is a 9-digit number; the mail also carries a
 *  confirmation URL. Return whatever is found — both are useful to the family. */
export function extractVerificationCode(body: string): { code: string | null; url: string | null } {
  const codeMatch = body.match(/\b(\d{9})\b/)
  const urlMatch = body.match(/https:\/\/mail\.google\.com\/\S*ForwardingConfirm\S*/i)
  return {
    code: codeMatch ? codeMatch[1] : null,
    url: urlMatch ? urlMatch[0].replace(/[)>\].,]+$/, '') : null,
  }
}

/**
 * Store the code against the address that received it, and seed the family's
 * sending-address set: an address a family forwards FROM is by definition one
 * they send from (design §4b).
 */
export async function captureVerification(
  familyId: string,
  receivingAddress: string,
  body: string,
  headerFrom: string,
): Promise<{ captured: boolean; code: string | null }> {
  const { code, url } = extractVerificationCode(body)
  if (!code && !url) return { captured: false, code: null }

  try {
    const db = rawService()
    await db.from('family_inbound_addresses')
      .update({
        verification_code: code ?? url,
        verification_received_at: new Date().toISOString(),
      })
      .eq('address', receivingAddress)
      .eq('family_id', familyId)

    // Seed the sending set from the confirming mailbox (the "forwarded from"
    // address Google names in the confirmation's From/subject chain). We only
    // seed when we can read a plausible address out of the body.
    const forwardedFrom = body.match(/([\w.+-]+@[\w.-]+\.\w+)\s+has requested/i)
      ?? body.match(/forward mail (?:to you )?from\s+([\w.+-]+@[\w.-]+\.\w+)/i)
    const seed = forwardedFrom?.[1]?.toLowerCase()
    if (seed) {
      // Family-scoped unique — a duplicate is a no-op, not an error worth failing on.
      await db.from('family_sending_addresses')
        .upsert(
          { family_id: familyId, address: seed, label: 'forwarding source', source: 'forwarding_seed' },
          { onConflict: 'family_id,address', ignoreDuplicates: true },
        )
    }
  } catch (err) {
    console.error('[gmail-verification] capture failed:', err instanceof Error ? err.message : err)
    return { captured: false, code }
  }

  console.log(`[gmail-verification] captured code for ${receivingAddress} (family ${familyId}); from="${headerFrom}"`)
  return { captured: true, code }
}

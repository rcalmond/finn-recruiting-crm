import { NextRequest, NextResponse } from 'next/server'
import { familyAdmin } from '@/lib/tenant-db'
import { loadFamilyIdentity } from '@/lib/family-identity'
import {
  parseEnvelope,
  resolveFamilyFromEnvelope,
  quarantineMessage,
} from '@/lib/inbound-routing'
import { ingestSrMessage, type InboundFields } from '@/lib/sr-inbound'
import { isGmailForwardingConfirmation, captureVerification } from '@/lib/gmail-verification'

// SendGrid Inbound Parse webhook — inbound coach mail ingestion.
// URL: /api/webhooks/sendgrid-inbound?key=<SENDGRID_INBOUND_SECRET>
//
// Flow (verified live 2026-08-19 by the envelope probe):
//   coach → SportsRecruits → the family's mailbox → the family's forwarding
//   address at in.finnsoccer.com → SendGrid Inbound Parse → here.
//
// Almond's live address is finn@in.finnsoccer.com, which receives BOTH the
// Gmail unconditional forward and SR's outbound-CC notifications.
// sr-notifications@in.finnsoccer.com is registered as active-legacy: it is
// deliverable but carried no observed traffic as of 2026-08-19.
//
// Routing is ENVELOPE-ONLY. See src/lib/inbound-routing.ts for the rule.

export async function GET() {
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const receivedAt = new Date().toISOString()

  // 1. Query-param secret check
  const providedKey = req.nextUrl.searchParams.get('key')
  if (!process.env.SENDGRID_INBOUND_SECRET || providedKey !== process.env.SENDGRID_INBOUND_SECRET) {
    console.log(`[sg-inbound] ${receivedAt} — rejected: invalid secret`)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 2. Parse multipart/form-data (SendGrid's default payload format)
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    console.log(`[sg-inbound] ${receivedAt} — failed to parse multipart body`)
    // Still return 200 — a malformed payload won't improve on retry
    return NextResponse.json({ ok: true })
  }

  const fields: InboundFields = {
    from:     (form.get('from')     as string | null) ?? '',
    to:       (form.get('to')       as string | null) ?? '',
    subject:  (form.get('subject')  as string | null) ?? '',
    spf:      (form.get('SPF')      as string | null) ?? '',
    dkim:     (form.get('dkim')     as string | null) ?? '',
    headers:  (form.get('headers')  as string | null) ?? '',
    text:     (form.get('text')     as string | null) ?? '',
    html:     (form.get('html')     as string | null) ?? '',
    envelope: (form.get('envelope') as string | null) ?? '',
  }

  console.log(
    `[sg-inbound] ${receivedAt} | from="${fields.from}" | to="${fields.to}" | subject="${fields.subject}"`
  )

  // ── OBSERVATION — email-boundary Amendment 2 ────────────────────────────────
  //
  // Retained through the routing cutover deliberately: it is the only
  // instrument that will catch the next genuine SportsRecruits notification,
  // the one direct sighting still outstanding. It routes nothing and must never
  // throw. Query: runtime logs, search "envelope-probe".
  try {
    const envelopeRaw = fields.envelope
    let envTo: unknown = null
    let envFrom: unknown = null
    let parsedOk = false
    if (envelopeRaw) {
      try {
        const env = JSON.parse(envelopeRaw) as { to?: unknown; from?: unknown }
        envTo = env.to ?? null
        envFrom = env.from ?? null
        parsedOk = true
      } catch {
        parsedOk = false
      }
    }
    console.log(
      `[envelope-probe] ${receivedAt}` +
      ` | envelope_present=${envelopeRaw ? 'yes' : 'NO'}` +
      ` parsed=${parsedOk ? 'ok' : 'FAIL'}` +
      ` | envelope.to=${JSON.stringify(envTo)}` +
      ` | envelope.from=${JSON.stringify(envFrom)}` +
      ` | header.to="${fields.to}"` +
      ` | header.from="${fields.from}"` +
      ` | subject="${fields.subject}"` +
      ` | envelope_raw=${envelopeRaw.slice(0, 200)}`
    )
  } catch (probeErr) {
    console.log(
      `[envelope-probe] ${receivedAt} — probe failed (ingestion unaffected): ` +
      (probeErr instanceof Error ? probeErr.message : String(probeErr))
    )
  }

  // 3. ROUTING — envelope only. The To header is NEVER consulted here.
  const envelope = parseEnvelope(fields.envelope)
  const route = await resolveFamilyFromEnvelope(envelope)

  if (!route.ok) {
    // REFUSE AND QUARANTINE — no contact_log row is written, and no content is
    // inspected to guess a family.
    await quarantineMessage({
      reason: route.reason,
      matchedFamilyIds: route.matchedFamilyIds,
      envelopeTo: envelope?.to ?? [],
      envelopeFrom: envelope?.from ?? null,
      headerFrom: fields.from,
      headerTo: fields.to,
      subject: fields.subject,
      rawPayload: fields as unknown as Record<string, string>,
    })
    console.log(
      `[sg-inbound] ${receivedAt} — QUARANTINED (${route.reason})` +
      ` | envelope.to=${JSON.stringify(envelope?.to ?? null)}` +
      ` | subject="${fields.subject}"`
    )
    // 200: SendGrid retrying would only re-quarantine the same message.
    return NextResponse.json({ ok: true, quarantined: route.reason })
  }

  const familyId = route.familyId
  const admin = familyAdmin(familyId)

  // Name the resolved family on every routed message. Without this, mail that
  // is DROPPED (non-SR test sends, marketing forwarded from a family's inbox)
  // leaves no evidence of where routing sent it — which made plain test emails
  // useless as routing proof during acceptance.
  console.log(
    `[sg-inbound] ${receivedAt} — routed family=${familyId}` +
    ` via ${route.matchedAddress} | subject="${fields.subject}"`
  )

  // 4. Gmail forwarding-confirmation capture — after routing (so we know whose
  //    code it is), before the non-SR drop that would otherwise discard it.
  //    Sender-gated on the From HEADER: envelope.from is rewritten by forwarding.
  if (isGmailForwardingConfirmation(fields.from, fields.subject)) {
    const body = fields.text?.trim() || fields.html || ''
    const { captured, code } = await captureVerification(familyId, route.matchedAddress, body, fields.from)
    console.log(
      `[sg-inbound] ${receivedAt} — Gmail forwarding confirmation for family ${familyId}` +
      ` | captured=${captured} | code=${code ? 'yes' : 'no'}`
    )
    return NextResponse.json({ ok: true, verification: captured })
  }

  // 5. Identity, loaded once, threaded into every parser.
  const identity = await loadFamilyIdentity(admin, familyId)

  // 6. Ingest — the identical path quarantine replay uses.
  const result = await ingestSrMessage(admin, identity, fields, receivedAt)

  if (result.status === 'auth_failed') {
    return NextResponse.json({ error: 'Auth failed' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}

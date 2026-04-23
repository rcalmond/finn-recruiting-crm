/**
 * gmail-autolabel.ts
 *
 * Scans Gmail for recent messages that don't yet have the "Recruiting" label
 * and applies it when the sender or recipient is a known coach.
 *
 * Two scans per run:
 *
 *   Inbound scan  (in:inbox)
 *     Finds unlabeled emails FROM known coach addresses.
 *     Catches coach emails that arrived without the label.
 *
 *   Sent scan     (in:sent)
 *     Finds unlabeled emails sent TO known coach addresses.
 *     Catches cold outreach Finn composed directly in Gmail —
 *     these never get a thread-label cascade because no labeled
 *     message exists in the thread yet.
 *
 * Both scans run before listRecruitingMessages() in each sync cycle.
 * The "Recruiting" label is the entry gate — nothing is processed without it.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { applyLabel } from './gmail-client'
import { getAuthorizedClient } from './gmail-client'

const LABEL_NAME = 'Recruiting'
const DEFAULT_LOOKBACK_DAYS = 7

// Safety cap: don't scan more than this many unlabeled messages per scan.
const MAX_SCAN = 500

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function autoLabelKnownSenders(
  userEmail: string,
  { lookbackDays = DEFAULT_LOOKBACK_DAYS }: { lookbackDays?: number } = {}
): Promise<{ labeled: number; skipped: number; inboundLabeled: number; sentLabeled: number }> {
  const admin = serviceClient()

  // Fetch all coach email addresses from the DB
  const { data: coaches, error } = await admin
    .from('coaches')
    .select('email')
    .not('email', 'is', null)

  if (error) {
    console.error('[gmail-autolabel] Failed to fetch coaches:', error.message)
    return { labeled: 0, skipped: 0, inboundLabeled: 0, sentLabeled: 0 }
  }

  const coachEmails = new Set(
    (coaches ?? [])
      .map((c: { email: string | null }) => c.email?.toLowerCase().trim())
      .filter((e): e is string => Boolean(e))
  )

  if (coachEmails.size === 0) {
    console.log('[gmail-autolabel] No coach emails in DB — skipping autolabel')
    return { labeled: 0, skipped: 0, inboundLabeled: 0, sentLabeled: 0 }
  }

  const gmail = await getAuthorizedClient(userEmail)

  // ── Inbound scan ───────────────────────────────────────────────────────────
  // Unlabeled inbox messages FROM known coach addresses.

  let inboundLabeled = 0
  let inboundSkipped = 0

  {
    const query = `-label:${LABEL_NAME} in:inbox newer_than:${lookbackDays}d`
    let pageToken: string | undefined
    let total = 0

    do {
      const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 100, pageToken })
      const messages = res.data.messages ?? []

      for (const stub of messages) {
        if (!stub.id) continue

        const detail = await gmail.users.messages.get({
          userId: 'me', id: stub.id, format: 'metadata', metadataHeaders: ['From'],
        })

        const fromHeader = (detail.data.payload?.headers ?? [])
          .find(h => h.name?.toLowerCase() === 'from')?.value ?? ''

        const senderEmail = extractFirstEmail(fromHeader)

        if (senderEmail && coachEmails.has(senderEmail)) {
          try {
            await applyLabel(userEmail, stub.id, LABEL_NAME)
            console.log(`[gmail-autolabel] Labeled inbound ${stub.id} from ${senderEmail}`)
            inboundLabeled++
          } catch (err) {
            console.error(`[gmail-autolabel] Failed to label inbound ${stub.id}:`, err)
            inboundSkipped++
          }
        } else {
          inboundSkipped++
        }

        if (++total >= MAX_SCAN) break
      }

      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken && total < MAX_SCAN)
  }

  // ── Sent scan ──────────────────────────────────────────────────────────────
  // Unlabeled sent messages TO known coach addresses.
  // Catches cold outreach Finn composed directly in Gmail.
  // Thread-label cascade handles replies in pre-labeled threads, so this
  // only needs to find brand-new threads initiated by Finn.

  let sentLabeled = 0
  let sentSkipped = 0

  {
    const query = `-label:${LABEL_NAME} in:sent newer_than:${lookbackDays}d`
    let pageToken: string | undefined
    let total = 0

    do {
      const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 100, pageToken })
      const messages = res.data.messages ?? []

      for (const stub of messages) {
        if (!stub.id) continue

        const detail = await gmail.users.messages.get({
          userId: 'me', id: stub.id, format: 'metadata', metadataHeaders: ['To', 'Cc'],
        })

        const headers = detail.data.payload?.headers ?? []
        const toHeader  = headers.find(h => h.name?.toLowerCase() === 'to')?.value  ?? ''
        const ccHeader  = headers.find(h => h.name?.toLowerCase() === 'cc')?.value  ?? ''
        const recipients = extractAllEmails(`${toHeader},${ccHeader}`)
        const matchesCoach = recipients.some(e => coachEmails.has(e))

        if (matchesCoach) {
          try {
            await applyLabel(userEmail, stub.id, LABEL_NAME)
            console.log(`[gmail-autolabel] Labeled sent ${stub.id} (coach recipient)`)
            sentLabeled++
          } catch (err) {
            console.error(`[gmail-autolabel] Failed to label sent ${stub.id}:`, err)
            sentSkipped++
          }
        } else {
          sentSkipped++
        }

        if (++total >= MAX_SCAN) break
      }

      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken && total < MAX_SCAN)
  }

  return {
    labeled:        inboundLabeled + sentLabeled,
    skipped:        inboundSkipped + sentSkipped,
    inboundLabeled,
    sentLabeled,
  }
}

// ── Email extraction helpers ───────────────────────────────────────────────────

/** Extract the first email address from a From: header ("Name <email>" or bare). */
function extractFirstEmail(header: string): string {
  const angleMatch = header.match(/<([^>]+)>/)
  if (angleMatch) return angleMatch[1].toLowerCase().trim()
  const bareMatch  = header.match(/[\w.+\-]+@[\w.\-]+\.[a-z]{2,}/i)
  return bareMatch ? bareMatch[0].toLowerCase().trim() : ''
}

/** Extract all email addresses from a To:/Cc: header (may have multiple recipients). */
function extractAllEmails(header: string): string[] {
  const emails: string[] = []
  // Angle-bracket format: "Name <email@x.com>"
  for (const m of Array.from(header.matchAll(/<([^>]+)>/g))) {
    emails.push(m[1].toLowerCase().trim())
  }
  // Bare format (no angle brackets) — only when none found above
  if (emails.length === 0) {
    for (const m of Array.from(header.matchAll(/[\w.+\-]+@[\w.\-]+\.[a-z]{2,}/gi))) {
      emails.push(m[0].toLowerCase().trim())
    }
  }
  return emails
}

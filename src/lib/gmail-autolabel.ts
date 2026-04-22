/**
 * gmail-autolabel.ts
 *
 * Scans Gmail for recent messages from known coach email addresses
 * that don't yet have the "Recruiting" label, and applies the label.
 *
 * This runs before listRecruitingMessages() in each sync cycle so that
 * emails from known coaches are captured even if Finn hasn't manually
 * labeled them. The "Recruiting" label is the entry gate — nothing is
 * processed without it.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { applyLabel } from './gmail-client'
import { google } from 'googleapis'
import { getAuthorizedClient } from './gmail-client'

const LABEL_NAME = 'Recruiting'
// Default lookback for the regular cron sync. The backfill route passes
// a longer window (180 days) via the lookbackDays option.
const DEFAULT_LOOKBACK_DAYS = 7

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function autoLabelKnownSenders(
  userEmail: string,
  { lookbackDays = DEFAULT_LOOKBACK_DAYS }: { lookbackDays?: number } = {}
): Promise<{ labeled: number; skipped: number }> {
  const admin = serviceClient()

  // 1. Fetch all coach email addresses from the DB
  const { data: coaches, error } = await admin
    .from('coaches')
    .select('email')
    .not('email', 'is', null)

  if (error) {
    console.error('[gmail-autolabel] Failed to fetch coaches:', error.message)
    return { labeled: 0, skipped: 0 }
  }

  const coachEmails = new Set(
    (coaches ?? [])
      .map((c: { email: string | null }) => c.email?.toLowerCase().trim())
      .filter((e): e is string => Boolean(e))
  )

  if (coachEmails.size === 0) {
    console.log('[gmail-autolabel] No coach emails in DB — skipping autolabel')
    return { labeled: 0, skipped: 0 }
  }

  // 2. Search Gmail for recent messages NOT already labeled "Recruiting"
  //    Gmail query: -label:Recruiting newer_than:Nd
  const gmail = await getAuthorizedClient(userEmail)
  const query = `-label:${LABEL_NAME} newer_than:${lookbackDays}d`

  let labeled = 0
  let skipped = 0
  let pageToken: string | undefined

  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 100,
      pageToken,
    })

    const messages = res.data.messages ?? []

    for (const stub of messages) {
      if (!stub.id) continue

      // Fetch just the From: header — we don't need the full message
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: stub.id,
        format: 'metadata',
        metadataHeaders: ['From'],
      })

      const fromHeader = (detail.data.payload?.headers ?? [])
        .find(h => h.name?.toLowerCase() === 'from')
        ?.value ?? ''

      // Extract email address from "Name <email>" or bare "email"
      const emailMatch = fromHeader.match(/<([^>]+)>/) ?? fromHeader.match(/(\S+@\S+)/)
      const senderEmail = (emailMatch?.[1] ?? '').toLowerCase().trim()

      if (senderEmail && coachEmails.has(senderEmail)) {
        try {
          await applyLabel(userEmail, stub.id, LABEL_NAME)
          console.log(`[gmail-autolabel] Labeled message ${stub.id} from ${senderEmail}`)
          labeled++
        } catch (err) {
          console.error(`[gmail-autolabel] Failed to label ${stub.id}:`, err)
          skipped++
        }
      } else {
        skipped++
      }
    }

    pageToken = res.data.nextPageToken ?? undefined
    // Safety cap: don't scan more than 500 unlabeled messages per run
    if (labeled + skipped >= 500) break
  } while (pageToken)

  return { labeled, skipped }
}

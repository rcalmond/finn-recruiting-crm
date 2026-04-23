/**
 * /api/cron/gmail-sync
 *
 * Vercel cron job — runs every 15 minutes.
 * Protected by CRON_SECRET (Vercel's standard Authorization header mechanism).
 *
 * Orchestration:
 *   1. Validate CRON_SECRET
 *   2. Fetch gmail_tokens row — abort if missing or token refresh fails
 *   3. autoLabelKnownSenders — label new emails from known coach addresses
 *   4. Determine sync window (last_sync_at - 1 hour overlap, or 24 h default)
 *   5. Paginate through Recruiting-labeled messages up to MAX_PAGES_PER_RUN
 *   6. For each new message: fetch → parse → match school/coach → insert
 *   7. Update gmail_tokens.last_sync_at
 *
 * Error handling philosophy:
 *   - GmailAuthError (token revoked) → log + return 200; don't 500 Vercel
 *   - Individual message failure → log + skip; continue to next message
 *   - DB write failure → log + count; continue; last_sync_at still updated
 *   - Any other uncaught error → 500 (Vercel will retry; that's OK)
 *
 * See Checkpoint 6 for the backfill variant (longer window, higher page cap).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
  listRecruitingMessages,
  getMessageDetails,
  GmailAuthError,
  GmailMessageDetails,
} from '@/lib/gmail-client'
import { parseGmailMessage, ParsedGmailEntry } from '@/lib/gmail-parser'
import { autoLabelKnownSenders } from '@/lib/gmail-autolabel'
import { resolveSchoolAndCoach } from '@/lib/gmail-resolve'

// ── Constants ─────────────────────────────────────────────────────────────────

// Maximum pages of 100 messages each per normal sync run.
// 5 pages = 500 messages. In practice 15-minute syncs process <10 messages.
const MAX_PAGES_PER_RUN = 5

// If last_sync_at is null (first run after connect), look back 6 months.
// This bootstraps the cron from empty state and also acts as the effective
// window for the backfill route, which reuses the same logic.
const DEFAULT_LOOKBACK_HOURS = 24 * 180  // ~6 months

// Finn's Gmail account — single-user app
const GMAIL_USER = process.env.GOOGLE_EXPECTED_EMAIL ?? 'finnalmond08@gmail.com'

// ── Internal Supabase helpers ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = ReturnType<typeof createServiceClient<any>>

function serviceClient(): Supabase {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Cron handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const startedAt = new Date().toISOString()

  // ── 1. CRON_SECRET validation ───────────────────────────────────────────────
  //
  // Vercel's cron runner sends:
  //   Authorization: Bearer <CRON_SECRET>
  //
  // We reject anything that doesn't match. This prevents external actors from
  // triggering syncs (which would consume Google API quota and write bad data).
  // The secret lives only in Vercel env vars — never in source or client code.
  //
  // We also allow the request if it originates from Vercel's own infra
  // (x-vercel-cron: 1 header) as a belt-and-suspenders check, but the
  // Authorization check is the real gate.

  const cronSecret = process.env.CRON_SECRET
  const isProd     = process.env.NODE_ENV === 'production'

  if (cronSecret) {
    // Secret is configured — enforce it in all environments
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      console.warn(`[gmail-sync] ${startedAt} — rejected: invalid CRON_SECRET`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } else if (isProd) {
    // Production with no secret configured — hard failure.
    // This prevents the endpoint from being publicly accessible in prod
    // if CRON_SECRET was accidentally omitted from Vercel env vars.
    console.error(`[gmail-sync] ${startedAt} — CRON_SECRET is not configured in production`)
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured' },
      { status: 500 }
    )
  } else {
    // Development with no secret — allow with a warning (local convenience)
    console.warn(`[gmail-sync] ${startedAt} — CRON_SECRET not set; running unauthenticated (dev only)`)
  }

  const admin = serviceClient()

  // ── 2. Fetch last_sync_at ───────────────────────────────────────────────────

  const { data: tokenRow, error: tokenErr } = await admin
    .from('gmail_tokens')
    .select('last_sync_at')
    .eq('user_email', GMAIL_USER)
    .single()

  if (tokenErr || !tokenRow) {
    console.error(`[gmail-sync] ${startedAt} — no token row for ${GMAIL_USER}; aborting`)
    // Return 200 so Vercel doesn't mark the cron as failed and send alerts.
    // This is expected when Part 4 is deployed but OAuth hasn't been completed yet.
    return NextResponse.json({ ok: true, skipped: 'no_token' })
  }

  // ── 3. Auto-label known senders ────────────────────────────────────────────

  let labelResult = { labeled: 0, skipped: 0, inboundLabeled: 0, sentLabeled: 0 }
  try {
    labelResult = await autoLabelKnownSenders(GMAIL_USER)
    console.log(
      `[gmail-sync] ${startedAt} — autolabel: ` +
      `${labelResult.inboundLabeled} inbound + ${labelResult.sentLabeled} sent labeled, ` +
      `${labelResult.skipped} skipped`
    )
  } catch (err) {
    if (err instanceof GmailAuthError) {
      // Token is dead — can't proceed with sync either
      console.error(`[gmail-sync] ${startedAt} — GmailAuthError in autolabel: ${err.message}`)
      return NextResponse.json({ ok: true, skipped: 'auth_error', detail: err.message })
    }
    // Non-auth error in autolabel: log and continue — don't let it block the sync
    console.error(`[gmail-sync] ${startedAt} — autolabel error (continuing):`, err)
  }

  // ── 4. Sync window ─────────────────────────────────────────────────────────
  //
  // We pull messages since last_sync_at minus a 1-hour overlap (handled inside
  // listRecruitingMessages). The 1-hour overlap is a buffer for late label
  // application — a message that arrived at 12:00 might not get the Recruiting
  // label until 12:05, and if the sync ran at 12:01 it would be missed without
  // the overlap.
  //
  // Duplicate messages that fall in the overlap are caught by the
  // gmail_message_id dedup check in step 6a.

  const since = tokenRow.last_sync_at
    ? new Date(tokenRow.last_sync_at)
    : new Date(Date.now() - DEFAULT_LOOKBACK_HOURS * 3600 * 1000)

  console.log(`[gmail-sync] ${startedAt} — sync window since: ${since.toISOString()}`)

  // ── 5. Paginate through Recruiting-labeled messages ─────────────────────────
  //
  // MAX_PAGES_PER_RUN caps the per-run message volume. In normal operation
  // (15-minute intervals) there are rarely more than a handful of new messages.
  // The cap protects against runaway behavior if, for example, someone bulk-adds
  // the Recruiting label to thousands of old emails.
  //
  // The backfill route (Checkpoint 6) uses a higher cap and a longer window.

  const stats = {
    inserted: 0,
    deduped:  0,
    failed:   0,
    partial:  0,
  }

  let pageToken: string | undefined
  let pagesProcessed = 0

  paginationLoop:
  while (pagesProcessed < MAX_PAGES_PER_RUN) {
    let page: { messageIds: string[]; nextPageToken?: string }
    try {
      page = await listRecruitingMessages(GMAIL_USER, { pageToken })
    } catch (err) {
      if (err instanceof GmailAuthError) {
        console.error(`[gmail-sync] ${startedAt} — GmailAuthError listing messages: ${err.message}`)
        break paginationLoop
      }
      throw err   // unexpected — let Vercel see the 500
    }

    pagesProcessed++
    console.log(
      `[gmail-sync] ${startedAt} — page ${pagesProcessed}: ${page.messageIds.length} message IDs`
    )

    // ── 6. Process each message ───────────────────────────────────────────────

    for (const messageId of page.messageIds) {
      // 6a. Dedup: skip if we've already written this Gmail message
      const { data: existing } = await admin
        .from('contact_log')
        .select('id')
        .eq('gmail_message_id', messageId)
        .limit(1)

      if (existing && existing.length > 0) {
        stats.deduped++
        continue
      }

      // 6b. Fetch full message + parse
      //     Each message is wrapped in try/catch so one bad message
      //     (malformed payload, API error) doesn't abort the whole batch.
      let parsed: ParsedGmailEntry
      let details: GmailMessageDetails
      try {
        details = await getMessageDetails(GMAIL_USER, messageId)
        parsed  = parseGmailMessage(details)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[gmail-sync] FAILED message ${messageId}: ${errMsg}`)
        stats.failed++
        continue   // skip this message; process the rest
      }

      // 6c. School matching
      //
      // Strategy (mirrors the SendGrid webhook hierarchy):
      //   1. Inbound: match senderDomain against coaches.email domains
      //   2. Outbound: match any recipientEmail against coaches.email exactly
      //   3. Fallback: extract school name from subject line → matchSchool()
      //
      // senderDomain is null when the sender uses a generic provider
      // (gmail.com etc.) — skip domain matching and go straight to subject.

      const { schoolId, coachId, coachName, matchNotes, parseStatus: resolvedStatus } =
        await resolveSchoolAndCoach(admin, parsed)

      // 6d. Determine parse_status
      //
      // Base status comes from resolveSchoolAndCoach (confidence-gated).
      // Downgrade to 'partial' further if:
      //   - dateSource === 'now' (date is unreliable)
      //   - No body was extracted (snippet fallback)

      const parseNotes = [...parsed.parseNotes, ...matchNotes]
      let parseStatus  = resolvedStatus

      if (parsed.dateSource === 'now') {
        parseStatus = 'partial'
        parseNotes.push('Date could not be extracted — webhook receipt time used')
      }

      if (!parsed.body || parsed.body === parsed.snippet) {
        parseStatus = 'partial'
        parseNotes.push('Body could not be extracted — snippet used as fallback')
      }

      // 6e. Insert into contact_log
      const { error: insertErr } = await admin.from('contact_log').insert({
        school_id:         schoolId,
        date:              parsed.isoDate,
        channel:           'Email',
        direction:         parsed.direction,
        coach_name:        coachName,
        coach_id:          coachId,
        summary:           parsed.body || parsed.snippet,
        raw_source:        details.textBody ?? details.htmlBody ?? null,
        gmail_message_id:  parsed.gmailMessageId,
        gmail_thread_id:   parsed.gmailThreadId,
        source_message_id: parsed.inReplyTo,
        parse_status:      parseStatus,
        parse_notes:       parseNotes.length > 0 ? parseNotes.join('; ') : null,
        created_by:        null,
      })

      if (insertErr) {
        console.error(`[gmail-sync] ${startedAt} — insert failed for ${messageId}: ${insertErr.message}`)
        stats.failed++
        continue
      }

      stats.inserted++
      if (parseStatus === 'partial') stats.partial++

      console.log(
        `[gmail-sync] ${startedAt} — ${parsed.direction} | ${parsed.isoDate} | ` +
        `school=${schoolId ? schoolId.slice(0, 8) + '…' : 'null'} | ` +
        `parse=${parseStatus} | id=${messageId}`
      )
    }

    if (!page.nextPageToken) break
    pageToken = page.nextPageToken
  }

  if (pagesProcessed >= MAX_PAGES_PER_RUN) {
    console.warn(
      `[gmail-sync] ${startedAt} — hit MAX_PAGES_PER_RUN (${MAX_PAGES_PER_RUN}); ` +
      'some messages may be deferred to next run'
    )
  }

  // ── 7. Update last_sync_at ─────────────────────────────────────────────────
  //
  // We always update last_sync_at, even if some messages failed — so the next
  // run doesn't re-process the entire window. Failed messages are logged and
  // counted; manual triage via parse_status='partial' / 'failed' is the
  // recovery path.

  await admin
    .from('gmail_tokens')
    .update({ last_sync_at: startedAt, updated_at: startedAt })
    .eq('user_email', GMAIL_USER)

  console.log(
    `[gmail-sync] ${startedAt} — done: ` +
    `inserted=${stats.inserted} deduped=${stats.deduped} ` +
    `failed=${stats.failed} partial=${stats.partial} ` +
    `pages=${pagesProcessed} autolabel=${labelResult.labeled}`
  )

  return NextResponse.json({ ok: true, stats, labelResult, pagesProcessed })
}

// resolveSchoolAndCoach and matching helpers are in @/lib/gmail-resolve.

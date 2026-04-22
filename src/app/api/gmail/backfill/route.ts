/**
 * POST /api/gmail/backfill
 *
 * One-time 6-month historical Gmail backfill. Auth-protected (Supabase session).
 * Streams progress as newline-delimited JSON (NDJSON) so you can watch
 * page-by-page results in real time:
 *
 *   curl -N -X POST \
 *     -H "Cookie: <session-cookie>" \
 *     http://localhost:3000/api/gmail/backfill
 *
 * Or from the settings UI (Checkpoint 7).
 *
 * Response format (one JSON object per line):
 *   {"type":"start",  "window": {...}, "note": "..."}
 *   {"type":"autolabel", "labeled": N, "skipped": N}
 *   {"type":"page",   "page": N, "found": N, "inserted": N, "deduped": N, "failed": N}
 *   {"type":"page",   ...}
 *   ...
 *   {"type":"done",   "stats": {...}, "cappedAt": true|false}
 *   {"type":"error",  "message": "..."}       ← only on fatal errors
 *
 * Idempotent: running backfill twice produces all deduped on second run.
 * Cron interaction: no lock — dedup (gmail_message_id) ensures correctness
 *   if cron fires mid-backfill. Worst case: redundant Gmail API calls, no
 *   duplicate DB rows.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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

// 50 pages × 100 messages = 5000 max. Halt and log clearly if hit.
const MAX_PAGES_BACKFILL = 50

// Six months in milliseconds (default window)
const SIX_MONTHS_MS = 180 * 24 * 3600 * 1000

// Hard upper limit: 18 months
const MAX_LOOKBACK_MS = 18 * 30 * 24 * 3600 * 1000

const GMAIL_USER = process.env.GOOGLE_EXPECTED_EMAIL ?? 'finnalmond08@gmail.com'

// ── Supabase helpers ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = ReturnType<typeof createServiceClient<any>>

function serviceClient(): Supabase {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth guard — must be a signed-in CRM user
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = serviceClient()

  // Confirm gmail_tokens exists (i.e. OAuth was completed)
  const { data: tokenRow, error: tokenErr } = await admin
    .from('gmail_tokens')
    .select('user_email')
    .eq('user_email', GMAIL_USER)
    .single()

  if (tokenErr || !tokenRow) {
    return NextResponse.json(
      { error: 'Gmail not connected — complete OAuth first' },
      { status: 400 }
    )
  }

  // ── Window resolution ────────────────────────────────────────────────────────
  //
  // ?since=YYYY-MM-DD overrides the default 6-month window.
  // Hard upper limit: 18 months. Reject with 400 if exceeded.

  const sinceParam = req.nextUrl.searchParams.get('since')
  let since: Date

  if (sinceParam) {
    const parsed = new Date(sinceParam)
    if (isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: `Invalid since parameter: "${sinceParam}" — expected ISO date like 2025-07-01` },
        { status: 400 }
      )
    }
    const ageMs = Date.now() - parsed.getTime()
    if (ageMs > MAX_LOOKBACK_MS) {
      return NextResponse.json(
        { error: `since=${sinceParam} exceeds the 18-month hard limit. Earliest allowed: ${new Date(Date.now() - MAX_LOOKBACK_MS).toISOString().slice(0, 10)}` },
        { status: 400 }
      )
    }
    since = parsed
  } else {
    since = new Date(Date.now() - SIX_MONTHS_MS)
  }

  // ── Stream setup ────────────────────────────────────────────────────────────
  //
  // ReadableStream lets us push progress lines as each page completes rather
  // than blocking until all 5000 messages are processed. The client (curl or
  // UI) receives each line immediately.

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const write = (obj: object) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
        } catch {
          // Client disconnected — nothing we can do; let the loop drain
        }
      }

      try {
        // ── Phase 1: auto-label known senders across the chosen window ────────

        const sinceISO   = since.toISOString()
        const windowDays = Math.round((Date.now() - since.getTime()) / (24 * 3600 * 1000))

        write({
          type:   'start',
          window: { since: sinceISO, days: windowDays },
          note:   'Cron safe to run concurrently — gmail_message_id dedup prevents double-inserts',
        })

        let labelResult = { labeled: 0, skipped: 0 }
        try {
          labelResult = await autoLabelKnownSenders(GMAIL_USER, { lookbackDays: windowDays })
        } catch (err) {
          if (err instanceof GmailAuthError) {
            write({ type: 'error', message: `Gmail auth error: ${err.message}` })
            controller.close()
            return
          }
          // Non-fatal autolabel error — log and continue
          write({ type: 'autolabel_error', message: String(err) })
        }
        write({ type: 'autolabel', labeled: labelResult.labeled, skipped: labelResult.skipped })

        // ── Phase 2: paginate through Recruiting-labeled messages ──────────────

        const totals = {
          found:    0,
          inserted: 0,
          deduped:  0,
          failed:   0,
          partial:  0,
        }

        let pageToken: string | undefined
        let pagesProcessed = 0
        let cappedAt       = false

        paginationLoop:
        while (pagesProcessed < MAX_PAGES_BACKFILL) {
          let page: { messageIds: string[]; nextPageToken?: string }
          try {
            page = await listRecruitingMessages(GMAIL_USER, { pageToken })
          } catch (err) {
            if (err instanceof GmailAuthError) {
              write({ type: 'error', message: `Gmail auth error: ${err.message}` })
              break paginationLoop
            }
            throw err
          }

          pagesProcessed++
          const pageStats = { page: pagesProcessed, found: page.messageIds.length, inserted: 0, deduped: 0, failed: 0 }
          totals.found += page.messageIds.length

          // ── Process each message in this page ─────────────────────────────

          for (const messageId of page.messageIds) {
            // Dedup check
            const { data: existing } = await admin
              .from('contact_log')
              .select('id')
              .eq('gmail_message_id', messageId)
              .limit(1)

            if (existing && existing.length > 0) {
              pageStats.deduped++
              totals.deduped++
              continue
            }

            // Fetch + parse
            let parsed: ParsedGmailEntry
            let details: GmailMessageDetails
            try {
              details = await getMessageDetails(GMAIL_USER, messageId)
              parsed  = parseGmailMessage(details)
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err)
              console.error(`[gmail-backfill] FAILED message ${messageId}: ${errMsg}`)
              pageStats.failed++
              totals.failed++
              continue
            }

            // School + coach resolution
            const { schoolId, coachId, coachName, matchNotes, parseStatus: resolvedStatus } =
              await resolveSchoolAndCoach(admin, parsed)

            const parseNotes = [...parsed.parseNotes, ...matchNotes]
            let parseStatus  = resolvedStatus  // may be downgraded below

            if (parsed.dateSource === 'now') {
              parseStatus = 'partial'
              parseNotes.push('Date could not be extracted — backfill receipt time used')
            }
            if (!parsed.body || parsed.body === parsed.snippet) {
              parseStatus = 'partial'
              parseNotes.push('Body could not be extracted — snippet used as fallback')
            }

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
              console.error(`[gmail-backfill] insert failed for ${messageId}: ${insertErr.message}`)
              pageStats.failed++
              totals.failed++
              continue
            }

            pageStats.inserted++
            totals.inserted++
            if (parseStatus === 'partial') totals.partial++
          }

          // Emit page summary immediately
          write({ type: 'page', ...pageStats })

          if (!page.nextPageToken) break
          pageToken = page.nextPageToken
        }

        if (pagesProcessed >= MAX_PAGES_BACKFILL) {
          cappedAt = true
          console.warn(
            `[gmail-backfill] Hit MAX_PAGES_BACKFILL (${MAX_PAGES_BACKFILL}) — ` +
            'increase cap or run again to continue'
          )
        }

        // ── Stamp last_sync_at so the cron picks up from here going forward ───

        const completedAt = new Date().toISOString()
        await admin
          .from('gmail_tokens')
          .update({ last_sync_at: completedAt, updated_at: completedAt })
          .eq('user_email', GMAIL_USER)

        write({
          type:       'done',
          stats:      { ...totals, pagesProcessed },
          cappedAt,
          last_sync_at: completedAt,
          message:    cappedAt
            ? `Capped at ${MAX_PAGES_BACKFILL} pages. Run again to continue — dedup ensures no double-inserts.`
            : 'Backfill complete.',
        })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('[gmail-backfill] Unexpected error:', err)
        write({ type: 'error', message: errMsg })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',  // disable nginx proxy buffering (Vercel)
    },
  })
}

// resolveSchoolAndCoach and matching helpers are in @/lib/gmail-resolve.

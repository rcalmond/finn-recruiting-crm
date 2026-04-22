/**
 * gmail-parser.ts
 *
 * Pure parser for Gmail messages. No DB calls — all school/coach matching
 * happens in the sync cron using the same matchSchool/matchCoach logic
 * as the SendGrid webhook.
 *
 * Input:  GmailMessageDetails (from gmail-client.ts getMessageDetails)
 * Output: ParsedGmailEntry — everything the cron needs to write a
 *         contact_log row, except schoolId/coachId (filled in by cron).
 */

import { USER_TIMEZONE } from './sr-paste-parser'
import type { GmailMessageDetails } from './gmail-client'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedGmailEntry {
  // Gmail identity
  gmailMessageId: string
  gmailThreadId:  string

  // Direction — based on From: header only
  direction: 'Outbound' | 'Inbound'

  // Sender
  senderEmail:  string
  senderName:   string | null

  // Recipients (To + Cc combined, for outbound coach matching)
  recipientEmails: string[]
  recipientRaw:    string   // raw To: header value for display

  // Content
  subject:     string | null
  isoDate:     string         // YYYY-MM-DD in Denver (USER_TIMEZONE)
  rawDate:     string | null  // original Date header
  dateSource:  'header' | 'internalDate' | 'now'  // provenance for debugging
  body:        string         // cleaned body text
  snippet:     string         // Gmail's 100-char preview (no cleaning needed)

  // Threading
  inReplyTo:   string | null  // In-Reply-To header value
  references:  string | null  // References header value

  // Flags for the cron to use when matching
  isForwarded: boolean        // subject starts with Fwd:/Fw: — coach info may be in body
  senderDomain: string | null // extracted from senderEmail, used for coach domain matching

  // Matching hints (populated by parser where possible, else null)
  // Cron fills in schoolId/coachId via DB lookup
  parseNotes: string[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Finn's own email addresses — any From: matching these is Outbound.
const FINN_EMAILS = new Set([
  (process.env.FINN_EMAIL ?? 'finnalmond08@gmail.com').toLowerCase(),
])

// Domains that are definitely not school/coach domains — gmail.com coaches
// won't match domain-based school lookup. The cron falls back to subject
// parsing for these.
const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'icloud.com', 'me.com', 'aol.com', 'protonmail.com',
])

// ── Main export ───────────────────────────────────────────────────────────────

export function parseGmailMessage(msg: GmailMessageDetails): ParsedGmailEntry {
  const notes: string[] = []

  // ── Direction ──────────────────────────────────────────────────────────────
  //
  // Strictly From:-header based. If Finn is the sender → Outbound.
  // We do NOT infer direction from subject (e.g. "Fwd: ..." where Finn
  // forwarded a coach reply to himself) — isForwarded flag handles that.

  const fromHeader    = msg.headers['from'] ?? ''
  const { email: senderEmail, name: senderName } = parseEmailAddress(fromHeader)
  const isOutbound    = FINN_EMAILS.has(senderEmail.toLowerCase())
  const direction     = isOutbound ? 'Outbound' : 'Inbound'

  // ── Recipients ─────────────────────────────────────────────────────────────

  const toHeader  = msg.headers['to']  ?? ''
  const ccHeader  = msg.headers['cc']  ?? ''
  const allRecips = [toHeader, ccHeader]
    .filter(Boolean)
    .flatMap(h => splitAddressList(h))
    .map(a => parseEmailAddress(a).email.toLowerCase())
    .filter(e => e.length > 0 && !FINN_EMAILS.has(e))  // exclude Finn's own addresses

  // ── Subject ────────────────────────────────────────────────────────────────

  const subject    = msg.headers['subject']?.trim() || null
  const isForwarded = /^(fwd?|fwk?):\s*/i.test(subject ?? '')

  if (isForwarded) {
    notes.push('Forwarded message — coach info may be in body, not headers')
  }

  // ── Date ───────────────────────────────────────────────────────────────────
  //
  // Priority order:
  //   1. Date: header — the timestamp the sending server assigned
  //   2. internalDate — when Gmail received the message (a few seconds later)
  //   3. now — last resort; flagged so the cron can set parse_status=partial
  //
  // We localise to USER_TIMEZONE (America/Denver) so the YYYY-MM-DD date
  // matches Finn's local calendar, consistent with the SR paste importer.
  // A 9:57 PM Denver email stays on the same date rather than rolling to
  // the next UTC day.

  let isoDate: string
  let rawDate: string | null = null
  let dateSource: ParsedGmailEntry['dateSource'] = 'now'

  const dateHeader = msg.headers['date']
  if (dateHeader) {
    const parsed = new Date(dateHeader)
    if (!isNaN(parsed.getTime())) {
      isoDate    = localDateString(parsed)
      rawDate    = dateHeader
      dateSource = 'header'
    } else {
      notes.push(`Malformed Date header: "${dateHeader}" — fell back to internalDate`)
    }
  }

  if (dateSource === 'now' && msg.internalDate) {
    const parsed = new Date(Number(msg.internalDate))
    if (!isNaN(parsed.getTime())) {
      isoDate    = localDateString(parsed)
      rawDate    = new Date(Number(msg.internalDate)).toISOString()
      dateSource = 'internalDate'
      if (!dateHeader) notes.push('No Date header — using Gmail internalDate')
    }
  }

  if (dateSource === 'now') {
    isoDate = localDateString(new Date())
    notes.push('Could not parse any date — using today; review needed')
  }

  // ── Body ───────────────────────────────────────────────────────────────────
  //
  // Prefer text/plain — it's already close to what we want in the summary.
  // Fall back to HTML-stripped text when text/plain is absent (HTML-only emails).
  //
  // We then run cleanGmailBody() to strip:
  //   - Forwarding headers ("---------- Forwarded message ----------")
  //   - Gmail signature separators ("-- ")
  //   - Excessive blank lines
  //
  // We do NOT strip quoted reply lines ("> ..."). Coach replies often
  // respond inline to specific points Finn raised, and stripping the
  // quoted context would make the reply unintelligible. Storage is
  // lossless — if a future feature (e.g. AI drafting) needs a clean
  // version it can strip quotes at query time.

  let rawBody: string
  if (msg.textBody) {
    rawBody = msg.textBody
  } else if (msg.htmlBody) {
    rawBody = stripHtml(msg.htmlBody)
    notes.push('No text/plain part — body extracted from HTML')
  } else {
    rawBody = msg.snippet  // last resort: Gmail's auto-generated preview
    notes.push('No body content found — using Gmail snippet')
  }

  const body = cleanGmailBody(rawBody)

  // ── Sender domain ──────────────────────────────────────────────────────────
  //
  // For inbound messages, the cron uses senderDomain to look up which school
  // this coach is from. E.g. "streb@rochester.edu" → domain "rochester.edu".
  //
  // If the domain is a generic personal email (gmail.com, etc.), domain
  // matching won't work; the cron falls back to subject-based school matching.

  const senderDomain = extractDomain(senderEmail)
  const isGenericDomain = senderDomain ? GENERIC_EMAIL_DOMAINS.has(senderDomain) : true

  if (isGenericDomain && !isOutbound) {
    notes.push(
      `Sender domain "${senderDomain ?? 'unknown'}" is not institutional — ` +
      'school match will fall back to subject parsing'
    )
  }

  return {
    gmailMessageId:  msg.id,
    gmailThreadId:   msg.threadId,
    direction,
    senderEmail,
    senderName,
    recipientEmails: allRecips,
    recipientRaw:    toHeader,
    subject,
    isoDate:         isoDate!,
    rawDate,
    dateSource,
    body,
    snippet:         msg.snippet,
    inReplyTo:       msg.headers['in-reply-to']  ?? null,
    references:      msg.headers['references']   ?? null,
    isForwarded,
    senderDomain:    isGenericDomain ? null : senderDomain,
    parseNotes:      notes,
  }
}

// ── Address parsing ───────────────────────────────────────────────────────────
//
// RFC 5322 addresses come in several formats:
//   "Sean Streb <sean.streb@rochester.edu>"
//   "sean.streb@rochester.edu"
//   "Sean Streb" <sean.streb@rochester.edu>
//
// We extract the email address and display name separately.

function parseEmailAddress(raw: string): { email: string; name: string | null } {
  const angleMatch = raw.match(/^(.*?)<([^>]+)>/)
  if (angleMatch) {
    const name  = angleMatch[1].trim().replace(/^["']|["']$/g, '').trim() || null
    const email = angleMatch[2].trim()
    return { email, name }
  }
  const bare = raw.trim()
  return { email: bare, name: null }
}

// Split "To: A <a@x.com>, B <b@y.com>" into individual address strings.
// The tricky case is commas inside quoted display names:
//   "Streb, Sean <s@r.edu>, Cross, Ben <b@r.edu>"
// We split on ", " only when NOT inside angle brackets.
function splitAddressList(header: string): string[] {
  const results: string[] = []
  let current  = ''
  let inAngles = 0

  for (const ch of header) {
    if (ch === '<') { inAngles++; current += ch }
    else if (ch === '>') { inAngles = Math.max(0, inAngles - 1); current += ch }
    else if (ch === ',' && inAngles === 0) {
      if (current.trim()) results.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) results.push(current.trim())
  return results
}

function extractDomain(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  return email.slice(at + 1).toLowerCase()
}

// ── Date localisation ─────────────────────────────────────────────────────────

function localDateString(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: USER_TIMEZONE,
    year:  'numeric',
    month: '2-digit',
    day:   '2-digit',
  }).formatToParts(d)
  const y   = parts.find(p => p.type === 'year')?.value  ?? ''
  const mon = parts.find(p => p.type === 'month')?.value ?? ''
  const day = parts.find(p => p.type === 'day')?.value   ?? ''
  return `${y}-${mon}-${day}`
}

// ── HTML stripping ────────────────────────────────────────────────────────────
//
// Used when text/plain is absent. Handles common HTML email patterns
// without a full parser dependency.

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Body cleaning ─────────────────────────────────────────────────────────────
//
// Strips email client boilerplate from a decoded text/plain body:
//
//   • Gmail forwarding header block ("---------- Forwarded message ----------"
//     and the From/Date/Subject/To lines that follow it)
//   • Gmail's "-- " signature separator and everything below it
//   • Excessive blank lines (3+ → 2)
//   • Trailing whitespace per line
//
// Quoted reply lines ("> ...") are intentionally preserved — ingest is
// lossless. Coach replies often respond inline to specific points Finn
// raised; stripping the quoted context would make the reply unintelligible.
//
// We do NOT strip disclaimer / legal footers — they're school-specific and
// usually short. Add boilerplate markers here if they become a problem.

function cleanGmailBody(text: string): string {
  let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Strip Gmail forward header block.
  // The block starts with a line of dashes containing "Forwarded message".
  // We strip from there to the first blank line (which ends the header block).
  normalized = normalized.replace(
    /[-]{5,}\s*Forwarded message\s*[-]{5,}[\s\S]*?\n\n/gi,
    ''
  )

  const lines   = normalized.split('\n')
  const kept: string[] = []
  let inSignature = false

  for (const line of lines) {
    // Gmail signature separator: a line that is exactly "-- " or "--"
    // Everything below it is the sender's signature.
    if (/^--\s*$/.test(line)) {
      inSignature = true
      break
    }
    if (inSignature) continue
    kept.push(line.trimEnd())
  }

  // Collapse 3+ consecutive blank lines → 2
  const collapsed: string[] = []
  let blankRun = 0
  for (const line of kept) {
    if (line.trim() === '') {
      blankRun++
      if (blankRun <= 2) collapsed.push(line)
    } else {
      blankRun = 0
      collapsed.push(line)
    }
  }

  return collapsed.join('\n').trim()
}

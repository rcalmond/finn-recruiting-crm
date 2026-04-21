/**
 * sr-paste-parser.ts
 *
 * Pure parser for SR (Sports Recruits) Sent folder copy-paste text.
 * No DB calls — all matching happens in the API route.
 *
 * SR Sent folder format (copy-pasted from the Sent thread view):
 *
 *   [EXT] Subject heading                  ← thread-level subject header (ONCE, at top)
 *   Me                                     ← sender: "Me" = outbound
 *   To: Coach Name (School Name)           ← recipients
 *   [Cc: ...]                              ← optional, ignored
 *   Re: Subject Line                       ← per-message subject
 *   Apr 20, 2026 at 9:26 AM               ← date
 *
 *   Body text...
 *
 *    Reply                                 ← message separator (may have leading space)
 *
 *   Coach Name (School Name)              ← inbound reply
 *   To: Me
 *   ...
 *
 *   ── Earlier Messages ──                ← SR collapses older messages here; we truncate
 *
 * Important: the first block has a thread-level subject preamble before the first
 * sender line ("Me" / coach). parseBlock scans forward until it finds the sender.
 *
 * Blocks are split on lines matching /^\s*Reply(\s+All)?\s*$/ (leading whitespace allowed).
 * We truncate at "── Earlier Messages ──" before splitting to avoid phantom blocks from
 * collapsed older messages that may contain their own Reply separators.
 *
 * We only import outbound ("Me") messages. Inbound blocks are parsed but not stored.
 */

import { createHash } from 'crypto'

// ─── Config ───────────────────────────────────────────────────────────────────
//
// Finn's local timezone. SR paste dates are in his local time; we store the
// date as it appears in this timezone, not the UTC date. Without this, an
// evening message (e.g. 9:57 PM MDT) would roll forward to the next UTC day.

export const USER_TIMEZONE = 'America/Denver'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ParsedRecipient {
  name: string        // as written in the To: line, e.g. "David Yates"
  school: string      // as written in parens, e.g. "Rochester"
}

export interface RawMessage {
  isOutbound: boolean
  senderName: string | null       // null for "Me"
  senderSchool: string | null     // null for outbound
  recipients: ParsedRecipient[]
  subject: string | null
  isoDate: string | null          // YYYY-MM-DD
  rawDate: string | null          // original date string from paste
  body: string                    // cleaned body text
  rawBlock: string                // the original block (for debugging)
}

// ─── SHA-256 helper ───────────────────────────────────────────────────────────

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

// ─── Thread key ───────────────────────────────────────────────────────────────
//
// Deterministic grouping using hybrid coach identity tokens:
//   sha256(normalizedSubject + "|" + sorted_tokens)
//
// Callers build each token as:
//   "coach:<uuid>"        — coach matched to DB (stable across name variations)
//   "name:<normalized>"   — unmatched coach (lowercased, whitespace collapsed)

export function computeThreadKey(normalizedSubject: string, coachTokens: string[]): string {
  const tokens = [...coachTokens].map(t => t.toLowerCase().trim()).sort().join(',')
  return sha256(normalizedSubject + '|' + tokens)
}

// ─── Content hash ─────────────────────────────────────────────────────────────

export function computeContentHash(
  isoDate: string,
  schoolId: string,
  coachIdsOrNames: string[],
  normalizedBody: string
): string {
  const coaches = [...coachIdsOrNames].map(s => s.toLowerCase().trim()).sort().join(',')
  return sha256(`${isoDate}|${schoolId}|${coaches}|${normalizedBody}`)
}

// ─── Subject normalization ────────────────────────────────────────────────────

export function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re:\s*)+/i, '')      // strip Re: / RE: prefixes
    .replace(/\[EXT\]/gi, '')        // strip [EXT] markers
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Body cleaning ────────────────────────────────────────────────────────────

const BOILERPLATE_MARKERS = [
  /^to view (my|finn'?s?) full profile/i,
  /^my\.sportsrecruits\.com\//i,
  /^from student-athletes/i,
  /^sports ?recruits/i,
  /^you are receiving this/i,
  /^unsubscribe/i,
  /^©\s*\d{4}/,
  /^\[EARLIER MESSAGES OMITTED\]/,
]

const CSS_RULE_RE = /^[A-Za-z][A-Za-z0-9\s,.-]*\s*\{[^}]*\}/
const OUTLOOK_ARTIFACT_RE = /^\[cid:/i
const IMAGE_LINE_RE = /\.(png|jpg|jpeg|gif|webp)\s*$/i

export function cleanBody(raw: string): string {
  const lines = raw.split('\n')
  const kept: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (BOILERPLATE_MARKERS.some(re => re.test(trimmed))) break
    if (CSS_RULE_RE.test(trimmed)) continue
    if (OUTLOOK_ARTIFACT_RE.test(trimmed)) continue
    if (IMAGE_LINE_RE.test(trimmed)) continue
    kept.push(line)
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

// ─── Date parsing ─────────────────────────────────────────────────────────────

const MONTH_NAMES = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'
const DATE_RE = new RegExp(
  `((?:${MONTH_NAMES})\\s+\\d{1,2},\\s+\\d{4}(?:\\s+at\\s+\\d{1,2}(?::\\d{2})?(?:\\s+[AP]M)?)?)`,
  'i'
)

// localDateString extracts the YYYY-MM-DD date as seen in USER_TIMEZONE,
// regardless of what timezone the server is running in.
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

function parseDateLine(line: string): { isoDate: string; rawDate: string } | null {
  const m = DATE_RE.exec(line)
  if (!m) return null
  const raw = m[1].trim()
  // Strip " at " so JS Date can parse "Apr 12, 2026 9:57 PM" cleanly
  const normalized = raw.replace(/\s+at\s+/i, ' ')
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return null
  // Extract the date in Finn's local timezone, not UTC —
  // avoids rolling forward on evening messages (e.g. 9:57 PM MDT → Apr 13 UTC)
  const iso = localDateString(d)
  return { isoDate: iso, rawDate: raw }
}

// ─── To: line parsing ─────────────────────────────────────────────────────────
//
// SR format: "Name (School), Name (School)" — split on "), " to avoid splitting
// on commas inside school names like "University of California, Los Angeles".

function parseToLine(toValue: string): ParsedRecipient[] {
  const segments = toValue.split(/\),\s*/).map((s, i, arr) =>
    i < arr.length - 1 ? s + ')' : s
  )

  const recipients: ParsedRecipient[] = []
  for (const seg of segments) {
    const trimmed = seg.trim()
    if (!trimmed) continue
    const m = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
    if (m) recipients.push({ name: m[1].trim(), school: m[2].trim() })
  }
  return recipients
}

// ─── Sender line detection ────────────────────────────────────────────────────
//
// A sender line is either:
//   • Exactly "Me" (outbound)
//   • "Name (School)" — coach name followed by school in parens (inbound)
//
// Lines that don't match (e.g. the thread-level subject preamble that SR puts at
// the top of the paste) are skipped until we find the first sender.

const COACH_SENDER_RE = /^(.+?)\s*\(([^)]+)\)\s*$/

function isSenderLine(line: string): boolean {
  const t = line.trim()
  return t === 'Me' || COACH_SENDER_RE.test(t)
}

// ─── Single block parser ──────────────────────────────────────────────────────

function parseBlock(rawBlock: string, debug: boolean): RawMessage | null {
  const text = rawBlock.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = text.split('\n')

  // ── Skip preamble: find sender line with To:/From: lookahead confirmation ──
  //
  // A real sender line is ALWAYS immediately followed (next non-empty line) by
  // "To:" or "From:". This rules out subject lines that happen to contain
  // parentheses matching the coach pattern, e.g.:
  //   "[External] Film + MLS Next Fest (Engineering + NESCAC Fit)"  ← NOT a sender
  //   "Kyle Dezotell (Tufts University)"                             ← sender ✓ (To: follows)
  let i = 0
  while (i < lines.length) {
    if (isSenderLine(lines[i])) {
      // Look ahead to the next non-empty line
      let j = i + 1
      while (j < lines.length && lines[j].trim() === '') j++
      if (j < lines.length && /^(To|From):/i.test(lines[j].trim())) {
        break  // confirmed sender
      }
    }
    i++
  }

  if (i >= lines.length) {
    if (debug) console.error('[sr-parser] parseBlock: no confirmed sender line found, skipping block')
    return null
  }

  if (debug && i > 0) {
    console.error(`[sr-parser] parseBlock: skipped ${i} preamble line(s): "${lines[0].trim().slice(0, 60)}"`)
  }

  // ── Sender line ──
  const senderLine = lines[i].trim()
  i++

  let isOutbound: boolean
  let senderName: string | null = null
  let senderSchool: string | null = null

  if (senderLine === 'Me') {
    isOutbound = true
  } else {
    const m = senderLine.match(COACH_SENDER_RE)
    if (m) {
      senderName = m[1].trim()
      senderSchool = m[2].trim()
    } else {
      senderName = senderLine
    }
    isOutbound = false
  }

  // ── Header fields: To:, Cc:, Subject, Date ──
  let recipients: ParsedRecipient[] = []
  let subject: string | null = null
  let isoDate: string | null = null
  let rawDate: string | null = null
  let bodyStartIdx = i

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (/^To:\s*/i.test(trimmed)) {
      recipients = parseToLine(trimmed.replace(/^To:\s*/i, ''))
      i++
      continue
    }

    if (/^Cc:\s*/i.test(trimmed)) {
      i++
      continue
    }

    // Date line — check before subject (date is unambiguous)
    const parsedDate = parseDateLine(trimmed)
    if (parsedDate) {
      isoDate = parsedDate.isoDate
      rawDate = parsedDate.rawDate
      bodyStartIdx = i + 1
      i++
      break
    }

    // Subject: first non-blank, non-To, non-Cc, non-date line
    if (trimmed !== '' && subject === null) {
      subject = trimmed
      i++
      continue
    }

    // Continuation of a multi-line subject (long subjects wrap in SR paste)
    if (trimmed !== '' && subject !== null) {
      subject = subject + ' ' + trimmed
      i++
      continue
    }

    // Blank line — keep scanning for date
    i++
  }

  // ── Strip orphaned subject tail at top of body ──
  // Long subjects that wrap can leave a trailing fragment (e.g. "MSOE)*") as
  // the first body line after the date. Drop it if it looks like a fragment.
  const bodyLines = lines.slice(bodyStartIdx)
  let bStart = 0
  while (bStart < bodyLines.length && bodyLines[bStart].trim() === '') bStart++
  if (bStart < bodyLines.length) {
    const first = bodyLines[bStart].trim()
    if (/^[^\n*()]*[*)]\s*$/.test(first) && first.length < 60) {
      bodyLines.splice(bStart, 1)
    }
  }

  const body = cleanBody(bodyLines.join('\n'))

  if (debug) {
    console.error(
      `[sr-parser] parseBlock: ${isOutbound ? 'OUTBOUND' : 'INBOUND'} | ` +
      `sender="${senderLine}" | date=${isoDate ?? 'null'} | ` +
      `recipients=${recipients.length} | bodyLen=${body.length}`
    )
  }

  return { isOutbound, senderName, senderSchool, recipients, subject, isoDate, rawDate, body, rawBlock }
}

// ─── Main export ──────────────────────────────────────────────────────────────
//
// debug=true → logs to console.error so it shows in server logs without
// polluting JSON API responses.

// Separator: "Reply" or "Reply All" on their own line, allowing leading/trailing
// whitespace (SR paste sometimes indents these with a single space).
const SEPARATOR_RE = /^\s*Reply(?:\s+All)?\s*$/m

// "Earlier Messages" heading: strip the heading line itself but keep everything
// below it — those are older messages in the thread, legitimate content to import.
const EARLIER_MESSAGES_RE = /^.*Earlier Messages.*$/gm

export function parseSRPaste(text: string, debug = false): RawMessage[] {
  // Normalize line endings
  let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Strip "Earlier Messages" heading lines (replace with blank line so surrounding
  // block structure isn't disrupted, but the heading itself isn't misread as content)
  normalized = normalized.replace(EARLIER_MESSAGES_RE, '')

  // Split on Reply / Reply All boundaries
  const rawBlocks = normalized.split(SEPARATOR_RE)

  if (debug) {
    console.error(`[sr-parser] parseSRPaste: found ${rawBlocks.length} raw block(s) after split`)
    rawBlocks.forEach((b, idx) => {
      const preview = b.trim().slice(0, 60).replace(/\n/g, '↵')
      console.error(`[sr-parser]   block[${idx}]: ${b.trim().length} chars | "${preview}"`)
    })
  }

  const messages: RawMessage[] = []
  for (const block of rawBlocks) {
    if (block.trim() === '') continue
    const msg = parseBlock(block, debug)
    if (msg) messages.push(msg)
  }

  if (debug) {
    const out = messages.filter(m => m.isOutbound).length
    const inb = messages.filter(m => !m.isOutbound).length
    console.error(`[sr-parser] Result: ${messages.length} messages — ${out} outbound, ${inb} inbound`)
  }

  return messages
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
  parseSRPaste,
  computeContentHash,
  computeThreadKey,
  normalizeSubject,
  cleanBody,
  USER_TIMEZONE,
} from '@/lib/sr-paste-parser'
import { resolveSentAt } from '@/lib/sent-at'

// SendGrid Inbound Parse webhook — Sports Recruits notification ingestion
// URL: /api/webhooks/sendgrid-inbound?key=<SENDGRID_INBOUND_SECRET>
//
// Flow: SR → finnalmond08@gmail.com → Gmail auto-forward →
//         sr-notifications@in.finnsoccer.com → SendGrid Inbound Parse → here

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// SendGrid pings with GET to verify the endpoint before activating
export async function GET() {
  return NextResponse.json({ ok: true })
}

// ── Auth / security helpers ───────────────────────────────────────────────────

function spfPasses(spf: string): boolean {
  return spf.toLowerCase() === 'pass'
}

function dkimPasses(dkim: string): boolean {
  // SendGrid format: "{@domain.com : pass}" — check any domain passes
  return /:\s*pass\s*\}/i.test(dkim)
}

// ── HTML stripping ────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Gmail forward extraction ──────────────────────────────────────────────────

// Gmail forward preamble: "---------- Forwarded message ---------\nFrom: ...\nDate: ...\n..."
function extractForwardedContent(text: string): { body: string; forwardDate: string | null } {
  // Normalize line endings first — email text frequently arrives with \r\n
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const forwardMarker = /[-]{5,}\s*Forwarded message\s*[-]{5,}/i
  const match = normalized.match(forwardMarker)
  if (match && match.index !== undefined) {
    const afterMarker = normalized.slice(match.index + match[0].length)
    // Strip leading blank lines before the preamble header block
    const trimmed = afterMarker.replace(/^\n+/, '')
    // Forward header block (From/Date/Subject/To) ends at first blank line
    const headerEnd = trimmed.indexOf('\n\n')
    const forwardHeaders = headerEnd !== -1 ? trimmed.slice(0, headerEnd) : ''
    const innerBody = (headerEnd !== -1 ? trimmed.slice(headerEnd + 2) : trimmed).trim()
    const dateMatch = forwardHeaders.match(/^Date:\s*(.+)$/m)
    return { body: innerBody, forwardDate: dateMatch ? dateMatch[1].trim() : null }
  }
  return { body: normalized.trim(), forwardDate: null }
}

// ── SR detection ──────────────────────────────────────────────────────────────

function isSRNotification(subject: string, body: string): boolean {
  // Check for SportsRecruits presence — both domain URLs and plain text brand name
  const hasSRBrand = /sportsrecruits/i.test(body) || /sportsrecruits/i.test(subject)
  const hasSRAction = /just sent|replied to|sent you a message/i.test(body)
  const hasSRThread = /messages\/thread\/\d+/.test(body)
  const hasSRSubject = /sent (?:you|finn) a message/i.test(subject)
  return hasSRBrand && (hasSRAction || hasSRSubject) && (hasSRThread || hasSRSubject)
}

// ── SR parsing ────────────────────────────────────────────────────────────────

function extractThreadId(body: string): string | null {
  const match = body.match(/messages\/thread\/(\d+)/)
  return match ? match[1] : null
}

function extractMessageId(headers: string): string | null {
  const match = headers.match(/^Message-ID:\s*<?([^>\s]+)>?/im)
  return match ? match[1].trim() : null
}

// Two SR subject formats:
//   Format A (initial message): "Coach Name (School Name) Sent You a Message"
//   Format B (forwarded outer): "Fwd: Re: Finn Almond | Left Wingback | Class of 2027 | School Name"
// Body display line (all types):
//   "Coach Name (School Name) just sent a message"
//   "Coach Name (School Name) replied to your message"
function extractSchoolAndCoach(
  outerSubject: string,
  body: string
): { schoolName: string | null; coachName: string | null; srSubject: string | null } {
  // ── Body: "[Coach Name] ([School Name]) just sent" or "replied to"
  const bodyMatch = body.match(/^([^(\n]+?)\s*\(([^)]+)\)\s+(?:just sent|replied to)/m)
  if (bodyMatch) {
    const coachName = bodyMatch[1].trim()
    const schoolName = bodyMatch[2].trim()
    // Also extract the SR internal subject from body
    const srSubjectMatch = body.match(/\*?Subject:\s*([^\n*]+)\*?/i)
    return {
      coachName,
      schoolName,
      srSubject: srSubjectMatch ? srSubjectMatch[1].trim() : null,
    }
  }

  // ── Subject: Format A "Coach Name (School Name) Sent You a Message"
  const subjectMatchA = outerSubject.match(/^(?:Fwd:\s*)?(.+?)\s*\((.+?)\)\s+Sent (?:You|Finn) a Message/i)
  if (subjectMatchA) {
    return { coachName: subjectMatchA[1].trim(), schoolName: subjectMatchA[2].trim(), srSubject: outerSubject }
  }

  // ── Subject: Format B — school is the last segment after the final "|"
  const strippedSubject = outerSubject.replace(/^(?:Fwd|Re):\s*/i, '').trim()
  const lastPipe = strippedSubject.lastIndexOf('|')
  const schoolFromSubject = lastPipe !== -1 ? strippedSubject.slice(lastPipe + 1).trim() : null

  return { coachName: null, schoolName: schoolFromSubject, srSubject: strippedSubject }
}

// Remove SR notification noise from an extracted body string
function cleanExtractedBody(text: string): string {
  // 1. Strip orphaned subject-line tail on the first line.
  //    Happens when the subject line wraps across two physical lines:
  //    pattern matches the first line, leaving e.g. "MSOE)*\n\n\n..." at top.
  //    Match: any chars (no newline/asterisk), then *, then blank lines.
  text = text.replace(/^[^\n*]*\*[ \t]*\n+/, '')

  // 2. Remove inline CSS rules that survive HTML→text conversion
  //    e.g. "P {margin-top:0;margin-bottom:0;}"
  text = text.replace(/[A-Za-z]\s*\{[^}]*\}/g, '')

  // 3. Collapse three or more consecutive blank lines to one
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}

// Extract just the coach's message body from the SR notification
function extractMessageBody(body: string): string {
  // Normalize line endings — email text may arrive with \r\n
  const normalized = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Find the SR internal subject line — try formats in order of specificity.
  // Use m.index directly (avoids re-searching the string via indexOf).
  const subjectPatterns = [
    /\*Subject:[^\n]+\*\n+/i,       // *Subject: Re: ...*
    /\*Subject:[^\n]+\n+/i,          // *Subject: Re: ...  (no closing *)
    /^Subject:[^\n]+\n+/im,          // Subject: Re: ...   (no asterisks, line-anchored)
  ]

  let startIdx = 0
  for (const pattern of subjectPatterns) {
    const m = normalized.match(pattern)
    if (m && m.index !== undefined) {
      startIdx = m.index + m[0].length
      break
    }
  }

  // End: "Reply on SportsRecruits", footer disclaimer, or horizontal rule
  let endIdx = normalized.length
  const candidates = [
    normalized.indexOf('Reply on SportsRecruits', startIdx),
    normalized.indexOf('Please do not reply to this notification email', startIdx),
    normalized.indexOf('\n---\n', startIdx),
    normalized.indexOf('View the full message on SportsRecruits', startIdx),
  ]
  for (const idx of candidates) {
    if (idx !== -1 && idx > startIdx) endIdx = Math.min(endIdx, idx)
  }

  return cleanExtractedBody(normalized.slice(startIdx, endIdx))
}

// Gmail preamble dates look like "Sat, Apr 4, 2026 at 7:35 AM" — "at" is not valid JS
function parseGmailDate(raw: string): Date {
  return new Date(raw.replace(/\s+at\s+/i, ' '))
}

function parseMessageDate(
  forwardDate: string | null,
  headers: string
): { date: string; sentAt: string; isEstimated: boolean } {
  // Preamble date first: this is the original SR send time, preserved inside the
  // Gmail forward body. The email headers Date is when Gmail *forwarded* the message
  // (correct for live auto-forwards; wrong for manually forwarded old emails).
  if (forwardDate) {
    const d = parseGmailDate(forwardDate)
    if (!isNaN(d.getTime())) return { date: d.toISOString().split('T')[0], sentAt: d.toISOString(), isEstimated: false }
  }
  // Fall back to email headers Date (correct for live auto-forwards, ~seconds off)
  const headerMatch = headers.match(/^Date:\s*(.+)$/m)
  if (headerMatch) {
    const d = new Date(headerMatch[1].trim())
    if (!isNaN(d.getTime())) return { date: d.toISOString().split('T')[0], sentAt: d.toISOString(), isEstimated: false }
  }
  // Last resort — approximate: today's date + current time-of-day (same as backfill pattern)
  const today = new Date().toISOString().split('T')[0]
  return { date: today, sentAt: resolveSentAt(null, null, today), isEstimated: true }
}

// ── School & coach matching ───────────────────────────────────────────────────

type SchoolRow = { id: string; name: string; short_name: string | null; aliases: string[] }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase  = ReturnType<typeof createServiceClient<any>>

async function matchSchool(
  admin: Supabase,
  parsedName: string
): Promise<{ school: SchoolRow | null; matchType: string }> {
  const { data } = await admin.from('schools').select('id, name, short_name, aliases')
  const schools  = (data ?? []) as SchoolRow[]
  const lower    = parsedName.toLowerCase().trim()

  // 1. Exact name match
  const exact = schools.find(s => s.name.toLowerCase() === lower)
  if (exact) return { school: exact, matchType: 'exact' }

  // 2. Exact short_name match
  const shortExact = schools.find(s => s.short_name?.toLowerCase() === lower)
  if (shortExact) return { school: shortExact, matchType: 'short_name_exact' }

  // 3. Alias match (case-insensitive) — SR uses formal names we've aliased
  const aliasMatch = schools.find(s =>
    (s.aliases ?? []).some(a => a.toLowerCase() === lower)
  )
  if (aliasMatch) return { school: aliasMatch, matchType: 'alias' }

  // 4. school.name contains the parsed token (e.g. "Amherst" → "Amherst College")
  const nameContains = schools.find(s => s.name.toLowerCase().includes(lower))
  if (nameContains) return { school: nameContains, matchType: 'name_contains_parsed' }

  // 5. parsed token contains school.name (e.g. "University of Rochester" → "Rochester")
  const parsedContainsName = schools.find(s => lower.includes(s.name.toLowerCase()))
  if (parsedContainsName) return { school: parsedContainsName, matchType: 'parsed_contains_name' }

  return { school: null, matchType: 'none' }
}

type CoachRow = { id: string; name: string }

async function matchCoach(
  admin: Supabase,
  schoolId: string,
  parsedCoachName: string
): Promise<{ coachId: string | null; matchType: string }> {
  const { data } = await admin
    .from('coaches')
    .select('id, name')
    .eq('school_id', schoolId)

  const coaches = (data ?? []) as CoachRow[]
  if (coaches.length === 0) return { coachId: null, matchType: 'no_coaches_for_school' }

  const lower     = parsedCoachName.toLowerCase().trim()
  const parsedLast = lower.split(/\s+/).at(-1) ?? ''

  const exact = coaches.find(c => c.name.toLowerCase() === lower)
  if (exact) return { coachId: exact.id, matchType: 'exact' }

  // Last name match — handles "Coach Serpone" matching "John Serpone"
  if (parsedLast.length > 1) {
    const lastMatch = coaches.find(c => c.name.toLowerCase().split(/\s+/).at(-1) === parsedLast)
    if (lastMatch) return { coachId: lastMatch.id, matchType: 'last_name' }
  }

  // Loose contains match
  const contains = coaches.find(
    c => c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())
  )
  if (contains) return { coachId: contains.id, matchType: 'contains' }

  return { coachId: null, matchType: 'none' }
}

// ── Outbound CC detection ─────────────────────────────────────────────────────
//
// SR sends a CC notification to finn@in.finnsoccer.com when Finn manually CCs
// that address on an outbound SR message. Subject format:
//   "Finn Almond CC'ed You on a Message to University of Rochester"
// Body contains: "You were CC'd on a SportsRecruits message"
//
// These emails do NOT pass isSRNotification() (different action phrases, no thread
// URL in subject), so we intercept them first.

function isOutboundCC(subject: string, body: string): boolean {
  return (
    /CC'?ed You on a Message to /i.test(subject) ||
    /You were CC'?d on a SportsRecruits message/i.test(body)
  )
}

// ── Outbound CC extraction helpers ────────────────────────────────────────────

// Extract coach names from the notification sentence:
// "Finn Almond used his SportsRecruits account to send a message to Coach Sean
//  Streb and Coach Ben Cross."  →  ["Sean Streb", "Ben Cross"]
// Normalizes internal whitespace so "Kevin  McCarthy" → "Kevin McCarthy".
function extractCoachNamesFromCC(body: string): string[] {
  const m = body.match(/send a message to (.+?)\.(?:\s|$)/i)
  if (!m) return []
  return m[1]
    .split(/\s+and\s+/i)
    .map(s => s.replace(/^Coach\s+/i, '').trim())
    .map(s => s.replace(/\s+/g, ' '))   // collapse double spaces ("Kevin  McCarthy")
    .filter(Boolean)
}

// Pre-clean the raw SR notification body before searching for the Subject: boundary.
// SR's HTML email template renders with CSS blocks, tab-indented whitespace, and
// \xa0 non-breaking spaces. Cleaning first prevents all of that from ending up
// in the summary when the Subject: regex would otherwise fail.
function precleanCCBody(body: string): string {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')                              // CSS block comments
    .replace(/@[a-z-][^{]*\{[^}]*\}/gi, '')                       // CSS @at-rules
    .replace(/[A-Za-z#.*_][A-Za-z0-9\s,#.*[\]:()_-]*\s*\{[^}]*\}/g, '')  // CSS rules
    .replace(/\xa0/g, ' ')                                         // non-breaking spaces
    .replace(/^[ \t]+$/gm, '')                                     // whitespace-only lines
    .replace(/\n{3,}/g, '\n\n')                                    // 3+ blank lines → 2
}

// Find the "Subject:" line that SR embeds in the notification body, then return:
//   srSubject   — the SR internal subject string (no [EXT] prefix on new-compose)
//   messageBody — everything below that line (Finn's actual message), cleaned
//
// SR's HTML email indents "Subject:" with spaces, so we allow leading whitespace
// in the regex. We also pre-clean CSS/template junk before searching so that a
// missed match doesn't dump raw HTML into the summary.
function extractCCBody(body: string): { srSubject: string | null; messageBody: string } {
  let normalized = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Pre-clean CSS template artifacts before searching for the Subject: boundary
  normalized = precleanCCBody(normalized)

  // Allow leading whitespace: SR notification emails indent "Subject:" with spaces
  const subjectMatch = normalized.match(/^\s*Subject:\s*(.+)$/im)

  if (!subjectMatch || subjectMatch.index === undefined) {
    // No Subject: line — clean the whole body and return
    return { srSubject: null, messageBody: cleanBody(normalized) }
  }

  const srSubject = subjectMatch[1].trim()
  const afterSubject = normalized
    .slice(subjectMatch.index + subjectMatch[0].length)
    .replace(/^\n+/, '') // drop leading blank lines between subject and body

  return { srSubject, messageBody: cleanBody(afterSubject) }
}

// Parse the email Date header into a JS Date object.
// Falls back to now() if header is missing/unparseable (getEmailDate is used
// where a Date object is needed for formatDateForParser).
function getEmailDate(headers: string): Date {
  const m = headers.match(/^Date:\s*(.+)$/m)
  if (m) {
    const d = new Date(m[1].trim())
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}

// Resolve sent_at for orphan paths that don't go through parseMessageDate.
// Uses the shared resolveSentAt helper for consistent fallback behavior.
function resolveOrphanSentAt(headers: string): { date: string; sentAt: string } {
  const m = headers.match(/^Date:\s*(.+)$/m)
  if (m) {
    const d = new Date(m[1].trim())
    if (!isNaN(d.getTime())) return { date: d.toISOString().split('T')[0], sentAt: d.toISOString() }
  }
  const today = new Date().toISOString().split('T')[0]
  return { date: today, sentAt: resolveSentAt(null, null, today) }
}


// Format a Date as "Apr 19, 2026 at 11:23 AM" in USER_TIMEZONE.
// This exact format is what parseSRPaste's date parser expects — it will
// re-parse the string and extract the Denver-local date correctly.
function formatDateForParser(d: Date): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: USER_TIMEZONE,
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
  const parts = fmt.formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return `${get('month')} ${get('day')}, ${get('year')} at ${get('hour')}:${get('minute')} ${get('dayPeriod')}`
}

// ── Outbound CC handler ───────────────────────────────────────────────────────

async function handleOutboundCC(
  admin: Supabase,
  subject: string,
  body: string,
  headers: string,
  rawText: string,
  sourceMessageId: string | null,
  receivedAt: string
): Promise<void> {
  // 1. School from subject: "...CC'ed You on a Message to University of Rochester"
  const schoolMatch = subject.match(/CC'?ed You on a Message to (.+)$/i)
  const parsedSchoolName = schoolMatch ? schoolMatch[1].trim() : null

  // 2. Coach names from notification sentence ("to Coach X and Coach Y")
  const coachNames = extractCoachNamesFromCC(body)

  // 3. SR internal subject + Finn's message body
  const { srSubject, messageBody } = extractCCBody(body)

  // 4. Email date formatted as a paste-compatible string in Denver TZ
  const emailDate  = getEmailDate(headers)
  const dateStr    = formatDateForParser(emailDate)

  // 5. Build a paste-style block and run through parseSRPaste.
  //    This reuses all existing parser logic: date parsing (Denver TZ fix),
  //    body cleaning, sender/To detection, and normalizeSubject.
  const schoolForTo  = parsedSchoolName ?? 'Unknown School'
  const coachesForTo = coachNames.length > 0 ? coachNames : ['Unknown Coach']
  const pasteBlock   = [
    'Me',
    `To: ${coachesForTo.map(n => `${n} (${schoolForTo})`).join(', ')}`,
    srSubject ?? '',
    dateStr,
    '',
    messageBody,
  ].join('\n')

  const messages    = parseSRPaste(pasteBlock, true) // debug=true → logs to console.error
  const outboundMsg = messages.find(m => m.isOutbound) ?? null

  if (!outboundMsg) {
    console.error(`[sg-inbound] ${receivedAt} — outbound CC: parser returned no outbound message`)
    const { date: orphanDate, sentAt: orphanSentAt } = resolveOrphanSentAt(headers)
    await admin.from('contact_log').insert({
      school_id:         null,
      date:              orphanDate,
      sent_at:           orphanSentAt,
      channel:           'Sports Recruits',
      direction:         'Outbound',
      coach_name:        coachNames.join('; ') || null,
      summary:           messageBody || srSubject || subject,
      raw_source:        rawText,
      source_message_id: sourceMessageId,
      parse_status:      'orphan',
      parse_notes:       'Outbound CC: parseSRPaste found no outbound message — no school match possible',
      created_by:        null,
    })
    return
  }

  const isoDate: string = outboundMsg.isoDate ?? new Date().toISOString().split('T')[0]
  const ccSentAt: string = resolveSentAt(headers, null, isoDate)
  const notes: string[] = []
  let parseStatus: 'full' | 'partial' = 'full'

  // 6. School matching (reuses existing matchSchool — 5-level hierarchy)
  let schoolId: string | null = null
  if (!parsedSchoolName) {
    notes.push('Could not extract school name from CC subject')
    parseStatus = 'partial'
  } else {
    const { school, matchType } = await matchSchool(admin, parsedSchoolName)
    if (school) {
      schoolId = school.id
      if (matchType !== 'exact') {
        notes.push(`School matched via ${matchType}: "${parsedSchoolName}" → "${school.name}"`)
      }
    } else {
      notes.push(`No school match for "${parsedSchoolName}"`)
      parseStatus = 'partial'
    }
  }

  // 7. Coach matching — one call per name (multi-coach supported)
  type CoachResult = { coachId: string | null; name: string }
  const coachResults: CoachResult[] = []
  for (const name of coachNames) {
    if (schoolId) {
      const { coachId, matchType } = await matchCoach(admin, schoolId, name)
      coachResults.push({ coachId, name })
      if (coachId && matchType !== 'exact') {
        notes.push(`Coach matched via ${matchType}: "${name}"`)
      } else if (!coachId) {
        notes.push(`No coach match for "${name}"`)
        parseStatus = 'partial'
      }
    } else {
      coachResults.push({ coachId: null, name })
    }
  }

  const matchedCoachIds = coachResults
    .map(r => r.coachId)
    .filter((id): id is string => id !== null)
  const primaryCoachId  = matchedCoachIds[0] ?? null
  const coachNameJoined = coachNames.join('; ')

  // 8. Thread key — hybrid tokens (coach:<uuid> or name:<normalized>),
  //    same algorithm as bulk importer so threads align across both paths
  const normSubject  = srSubject ? normalizeSubject(srSubject) : null
  const coachTokens  = coachResults.map(r =>
    r.coachId
      ? `coach:${r.coachId}`
      : `name:${r.name.toLowerCase().replace(/\s+/g, ' ').trim()}`
  )
  const threadKey = normSubject && coachTokens.length > 0
    ? computeThreadKey(normSubject, coachTokens)
    : null

  // 9. Content hash + dedup check against contact_log.content_hash
  let contentHash: string | null = null
  if (schoolId) {
    const hashTokens = coachResults.map(r =>
      r.coachId
        ? `coach:${r.coachId}`
        : `name:${r.name.toLowerCase().replace(/\s+/g, ' ').trim()}`
    )
    contentHash = computeContentHash(isoDate, schoolId, hashTokens, outboundMsg.body)

    const { data: existing } = await admin
      .from('contact_log')
      .select('id')
      .eq('content_hash', contentHash)
      .limit(1)
    if (existing && existing.length > 0) {
      console.log(`[sg-inbound] ${receivedAt} — outbound CC: duplicate (content_hash), skipping`)
      return
    }
  }

  // 10. Insert
  const parseNotes = notes.length > 0 ? notes.join('; ') : null
  const { data: insertedRow, error: insertError } = await admin.from('contact_log').insert({
    school_id:         schoolId,
    date:              isoDate,
    sent_at:           ccSentAt,
    channel:           'Sports Recruits',
    direction:         'Outbound',
    coach_name:        coachNameJoined || null,
    coach_id:          primaryCoachId,
    summary:           outboundMsg.body || srSubject || subject,
    raw_source:        rawText,
    source_thread_id:  threadKey,
    source_message_id: sourceMessageId,
    parse_status:      parseStatus,
    parse_notes:       parseNotes,
    content_hash:      contentHash,
    created_by:        null,
  }).select('id').single()

  if (insertError) {
    console.error(`[sg-inbound] ${receivedAt} — outbound CC insert error: ${insertError.message}`)
    return
  }

  // 10a. Fire-and-forget: link outbound to campaign_schools if applicable
  if (insertedRow?.id && schoolId) {
    import('@/lib/campaigns').then(({ linkOutboundToCampaign }) =>
      linkOutboundToCampaign(admin, insertedRow.id)
    ).catch(err => console.error(`[sg-inbound] campaign-link import failed:`, err))
  }

  console.log(
    `[sg-inbound] ${receivedAt} — outbound CC: ${parseStatus}` +
    ` | school="${parsedSchoolName ?? '?'}" → id=${schoolId ?? 'null'}` +
    ` | coaches="${coachNameJoined}" (${matchedCoachIds.length}/${coachNames.length} matched)` +
    ` | date=${isoDate}` +
    ` | thread=${threadKey ? threadKey.slice(0, 8) + '…' : 'null'}`
  )
  if (parseNotes) console.log(`[sg-inbound] notes: ${parseNotes}`)
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const receivedAt = new Date().toISOString()

  // 1. Query-param secret check
  const providedKey = req.nextUrl.searchParams.get('key')
  if (!process.env.SENDGRID_INBOUND_SECRET || providedKey !== process.env.SENDGRID_INBOUND_SECRET) {
    console.log(`[sg-inbound] ${receivedAt} — rejected: invalid secret`)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = serviceClient()

  // 2. Parse multipart/form-data (SendGrid's default payload format)
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    console.log(`[sg-inbound] ${receivedAt} — failed to parse multipart body`)
    // Still return 200 — malformed payload won't improve on retry
    return NextResponse.json({ ok: true })
  }

  const from    = (form.get('from')    as string | null) ?? ''
  const to      = (form.get('to')      as string | null) ?? ''
  const subject = (form.get('subject') as string | null) ?? ''
  const spf     = (form.get('SPF')     as string | null) ?? ''
  const dkim    = (form.get('dkim')    as string | null) ?? ''
  const headers = (form.get('headers') as string | null) ?? ''
  const rawText = (form.get('text')    as string | null) ?? ''
  const rawHtml = (form.get('html')    as string | null) ?? ''

  const fullBodyText = rawText.trim() || stripHtml(rawHtml)

  console.log(`[sg-inbound] ${receivedAt} | from="${from}" | to="${to}" | subject="${subject}"`)

  // 3. SPF / DKIM — reject only if both fail (forwarded emails may fail DKIM)
  if (!spfPasses(spf) && !dkimPasses(dkim)) {
    console.log(`[sg-inbound] ${receivedAt} — rejected: SPF="${spf}" DKIM="${dkim}"`)
    return NextResponse.json({ error: 'Auth failed' }, { status: 400 })
  }

  // 4. Extract source identifiers
  const sourceMessageId = extractMessageId(headers)

  // 5. Unwrap Gmail forward wrapper to get the original SR notification body
  const { body: innerBody, forwardDate } = extractForwardedContent(fullBodyText)

  // 5b. Outbound CC intercept — must run BEFORE isSRNotification().
  //     CC notifications ("Finn Almond CC'ed You on a Message to ...") use different
  //     action phrases and don't pass the inbound SR check, so we catch them first.
  if (isOutboundCC(subject, innerBody)) {
    console.log(`[sg-inbound] ${receivedAt} — outbound CC detected, routing to outbound handler`)
    await handleOutboundCC(admin, subject, innerBody, headers, fullBodyText, sourceMessageId, receivedAt)
    return NextResponse.json({ ok: true })
  }

  // 6a. SR product notifications (view alerts) — drop silently, no coach content
  if (/college coach just viewed your/i.test(subject)) {
    console.log(`[orphan-drop] ${receivedAt} — skipping SR product notification: ${subject}`)
    return NextResponse.json({ ok: true })
  }

  // 6b. Non-SR detection — drop silently (non-recruiting email forwarded from Gmail)
  if (!isSRNotification(subject, innerBody)) {
    console.log(`[orphan-drop] ${receivedAt} — skipping non-recruiting email from ${from}: ${subject || '(no subject)'}`)
    return NextResponse.json({ ok: true })
  }

  // 7. SR-specific extraction
  const threadId = extractThreadId(innerBody)
  const { schoolName: parsedSchoolName, coachName: parsedCoachName, srSubject } =
    extractSchoolAndCoach(subject, innerBody)
  const messageBody = extractMessageBody(innerBody)
  const { date: messageDate, sentAt: messageSentAt, isEstimated: dateEstimated } =
    parseMessageDate(forwardDate, headers)

  // 8. Deduplication — skip if we've already stored this exact message
  if (threadId && sourceMessageId) {
    const { data: existing } = await admin
      .from('contact_log')
      .select('id')
      .eq('source_thread_id', threadId)
      .eq('source_message_id', sourceMessageId)
      .limit(1)
    if (existing && existing.length > 0) {
      console.log(`[sg-inbound] ${receivedAt} — duplicate, skipping (thread=${threadId})`)
      return NextResponse.json({ ok: true })
    }
  }

  // 9. School matching
  const notes: string[] = []
  let schoolId: string | null = null
  let parseStatus: 'full' | 'partial' | 'orphan' = 'full'

  if (!parsedSchoolName) {
    notes.push('Could not extract school name from SR notification')
    parseStatus = 'orphan'
  } else {
    const { school, matchType } = await matchSchool(admin, parsedSchoolName)
    if (school) {
      schoolId = school.id
      if (matchType !== 'exact') {
        notes.push(`School matched via ${matchType}: "${parsedSchoolName}" → "${school.name}"`)
      }
    } else {
      notes.push(`No school match for parsed name "${parsedSchoolName}"`)
      parseStatus = 'orphan'
    }
  }

  // 10. Coach matching
  let coachId: string | null = null
  if (schoolId && parsedCoachName) {
    const { coachId: matched, matchType } = await matchCoach(admin, schoolId, parsedCoachName)
    coachId = matched
    if (matched && matchType !== 'exact') {
      notes.push(`Coach matched via ${matchType}: "${parsedCoachName}"`)
    } else if (!matched) {
      notes.push(`No coach match for "${parsedCoachName}" — may be new coach; review manually`)
    }
  }

  if (dateEstimated) {
    notes.push('Message date could not be parsed; used today as fallback')
    if (parseStatus === 'full') parseStatus = 'partial'
  }

  const parseNotes = notes.length > 0 ? notes.join('; ') : null

  // 11. Write contact_log entry
  const summary = messageBody || srSubject || subject
  const { data: insertedRow, error: insertError } = await admin.from('contact_log').insert({
    school_id:        schoolId,
    date:             messageDate,
    sent_at:          messageSentAt,
    channel:          'Sports Recruits',
    direction:        'Inbound',
    coach_name:       parsedCoachName ?? null,
    coach_id:         coachId,
    summary,
    raw_source:       fullBodyText,
    source_thread_id: threadId,
    source_message_id: sourceMessageId,
    parse_status:     parseStatus,
    parse_notes:      parseNotes,
    created_by:       null,
  }).select('id').single()

  if (insertError) {
    console.log(`[sg-inbound] ${receivedAt} — DB insert error: ${insertError.message}`)
    // Return 200 anyway — non-2xx triggers SendGrid retries
    return NextResponse.json({ ok: true })
  }

  console.log(
    `[sg-inbound] ${receivedAt} — ${parseStatus}` +
    ` | school_id=${schoolId ?? 'null'} coach_id=${coachId ?? 'null'}` +
    ` | thread=${threadId ?? 'null'}` +
    ` | school="${parsedSchoolName ?? '?'}" coach="${parsedCoachName ?? '?'}"`
  )
  if (parseNotes) console.log(`[sg-inbound] notes: ${parseNotes}`)

  // Fire-and-forget inbound classification — only for rows with a matched school
  if (insertedRow?.id && schoolId) {
    const rowId = insertedRow.id
    const classifyInput = {
      summary,
      coach_name: parsedCoachName ?? null,
      raw_source: fullBodyText,
      channel:    'Sports Recruits',
    }
    import('@/lib/classify-inbound').then(({ classifyAndUpdate }) =>
      classifyAndUpdate(admin, rowId, classifyInput)
    ).catch(err => console.error(`[sg-inbound] classify import failed:`, err))

    // Fire-and-forget: extract camp proposals from inbound emails
    import('@/lib/camp-extractor').then(({ extractAndProposeCamps }) =>
      extractAndProposeCamps(rowId, admin)
    ).catch(err => console.error(`[sg-inbound] camp-extract import failed:`, err))
  }

  return NextResponse.json({ ok: true })
}

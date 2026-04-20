import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

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
  const forwardMarker = /[-]{5,}\s*Forwarded message\s*[-]{5,}/i
  const match = text.match(forwardMarker)
  if (match) {
    const afterMarker = text.slice(match.index! + match[0].length)
    // The forward header block ends at the first blank line
    const headerEnd = afterMarker.indexOf('\n\n')
    const forwardHeaders = headerEnd !== -1 ? afterMarker.slice(0, headerEnd) : ''
    const innerBody = (headerEnd !== -1 ? afterMarker.slice(headerEnd + 2) : afterMarker).trim()
    const dateMatch = forwardHeaders.match(/^Date:\s*(.+)$/m)
    return { body: innerBody, forwardDate: dateMatch ? dateMatch[1].trim() : null }
  }
  return { body: text.trim(), forwardDate: null }
}

// ── SR detection ──────────────────────────────────────────────────────────────

function isSRNotification(subject: string, body: string): boolean {
  const hasSRDomain = body.includes('sportsrecruits.com') || subject.toLowerCase().includes('sportsrecruits')
  const hasSRAction = /just sent|replied to|sent you a message/i.test(body)
  const hasSRThread = /messages\/thread\/\d+/.test(body)
  const hasSRSubject = /sent (?:you|finn) a message/i.test(subject)
  return hasSRDomain && (hasSRAction || hasSRSubject) && (hasSRThread || hasSRSubject)
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

// Extract just the coach's message body from the SR notification
function extractMessageBody(body: string): string {
  // Start: after the SR internal subject line "*Subject: ...*\n"
  const subjectMatch = body.match(/\*?Subject:[^\n]+\*?\n+/i)
  const startIdx = subjectMatch
    ? body.indexOf(subjectMatch[0]) + subjectMatch[0].length
    : 0

  // End: "Reply on SportsRecruits", footer disclaimer, or horizontal rule
  let endIdx = body.length
  const candidates = [
    body.indexOf('Reply on SportsRecruits'),
    body.indexOf('Please do not reply to this notification email'),
    body.indexOf('\n---\n', startIdx),
    // Format A: body sometimes ends with just the thread link
    body.indexOf('View the full message on SportsRecruits'),
  ]
  for (const idx of candidates) {
    if (idx !== -1 && idx > startIdx) endIdx = Math.min(endIdx, idx)
  }

  return body.slice(startIdx, endIdx).trim()
}

function parseMessageDate(
  forwardDate: string | null,
  headers: string
): { date: string; isEstimated: boolean } {
  // Prefer the Date from inside the Gmail forward preamble (= when SR sent it)
  if (forwardDate) {
    const d = new Date(forwardDate)
    if (!isNaN(d.getTime())) return { date: d.toISOString().split('T')[0], isEstimated: false }
  }
  // Fall back to the email headers Date field
  const headerMatch = headers.match(/^Date:\s*(.+)$/m)
  if (headerMatch) {
    const d = new Date(headerMatch[1].trim())
    if (!isNaN(d.getTime())) return { date: d.toISOString().split('T')[0], isEstimated: false }
  }
  // Last resort: today
  return { date: new Date().toISOString().split('T')[0], isEstimated: true }
}

// ── School & coach matching ───────────────────────────────────────────────────

type SchoolRow = { id: string; name: string; short_name: string | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase  = ReturnType<typeof createServiceClient<any>>

async function matchSchool(
  admin: Supabase,
  parsedName: string
): Promise<{ school: SchoolRow | null; matchType: string }> {
  const { data } = await admin.from('schools').select('id, name, short_name')
  const schools  = (data ?? []) as SchoolRow[]
  const lower    = parsedName.toLowerCase().trim()

  const exact       = schools.find(s => s.name.toLowerCase() === lower)
  if (exact) return { school: exact, matchType: 'exact' }

  const shortExact  = schools.find(s => s.short_name?.toLowerCase() === lower)
  if (shortExact) return { school: shortExact, matchType: 'short_name_exact' }

  // school.name contains the parsed token (e.g. "Amherst" → "Amherst College")
  const nameContains = schools.find(s => s.name.toLowerCase().includes(lower))
  if (nameContains) return { school: nameContains, matchType: 'name_contains_parsed' }

  // parsed token contains school.name (e.g. "University of Rochester" contains "Rochester")
  const parsedContainsName = schools.find(s => lower.includes(s.name.toLowerCase()))
  if (parsedContainsName) return { school: parsedContainsName, matchType: 'parsed_contains_name' }

  // parsed token contains short_name
  const parsedContainsShort = schools.find(
    s => s.short_name && lower.includes(s.short_name.toLowerCase())
  )
  if (parsedContainsShort) return { school: parsedContainsShort, matchType: 'parsed_contains_short_name' }

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

  // 6. Non-SR detection — write a partial entry and return
  if (!isSRNotification(subject, innerBody)) {
    console.log(`[sg-inbound] ${receivedAt} — not an SR notification, writing partial entry`)
    await admin.from('contact_log').insert({
      school_id:        null,
      date:             new Date().toISOString().split('T')[0],
      channel:          'Email',
      direction:        'Inbound',
      coach_name:       null,
      summary:          `Non-SR email: ${subject || '(no subject)'}`,
      raw_source:       fullBodyText,
      source_message_id: sourceMessageId,
      parse_status:     'partial',
      parse_notes:      'Not a SportsRecruits notification; manual review needed',
      created_by:       null,
    })
    return NextResponse.json({ ok: true })
  }

  // 7. SR-specific extraction
  const threadId = extractThreadId(innerBody)
  const { schoolName: parsedSchoolName, coachName: parsedCoachName, srSubject } =
    extractSchoolAndCoach(subject, innerBody)
  const messageBody = extractMessageBody(innerBody)
  const { date: messageDate, isEstimated: dateEstimated } =
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
  let parseStatus: 'parsed' | 'partial' | 'failed' = 'parsed'

  if (!parsedSchoolName) {
    notes.push('Could not extract school name from SR notification')
    parseStatus = 'partial'
  } else {
    const { school, matchType } = await matchSchool(admin, parsedSchoolName)
    if (school) {
      schoolId = school.id
      if (matchType !== 'exact') {
        notes.push(`School matched via ${matchType}: "${parsedSchoolName}" → "${school.name}"`)
      }
    } else {
      notes.push(`No school match for parsed name "${parsedSchoolName}"`)
      parseStatus = 'partial'
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
    if (parseStatus === 'parsed') parseStatus = 'partial'
  }

  const parseNotes = notes.length > 0 ? notes.join('; ') : null

  // 11. Write contact_log entry
  const summary = messageBody || srSubject || subject
  const { error: insertError } = await admin.from('contact_log').insert({
    school_id:        schoolId,
    date:             messageDate,
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
  })

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

  return NextResponse.json({ ok: true })
}

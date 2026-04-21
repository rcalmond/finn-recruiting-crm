/**
 * test-outbound-cc.ts
 *
 * Simulates the Part 3a outbound CC detection + extraction pipeline
 * against the Apr 19 Rochester fixture, WITHOUT making any DB calls.
 *
 * Reports:
 *   1. Detection result
 *   2. Extracted school / coaches / date / body
 *   3. Paste block sent to parseSRPaste
 *   4. Parser output (isoDate, recipients, body)
 *   5. Computed content_hash (using placeholder UUIDs for school/coaches)
 *   6. Comparison against the known bulk-imported hash
 *
 * Usage:
 *   npx tsx scripts/test-outbound-cc.ts
 */

import {
  parseSRPaste,
  computeContentHash,
  computeThreadKey,
  normalizeSubject,
  cleanBody,
  USER_TIMEZONE,
} from '../src/lib/sr-paste-parser'

// ─── Fixture ──────────────────────────────────────────────────────────────────

const FIXTURE_SUBJECT = "Finn Almond CC'ed You on a Message to University of Rochester"

const FIXTURE_HEADERS = `
From: SportsRecruits <no-reply@sportsrecruits.com>
To: finn@in.finnsoccer.com
Subject: Finn Almond CC'ed You on a Message to University of Rochester
Date: Sat, 19 Apr 2026 21:54:00 +0000
`.trim()

// Body as it would arrive after extractForwardedContent (no Gmail forward wrapper)
const FIXTURE_BODY = `You were CC'd on a SportsRecruits message

Finn Almond used his SportsRecruits account to send a message to Coach Sean Streb and Coach Ben Cross. Finn uses SportsRecruits to manage their recruiting process and wanted to loop you in on this conversation.

This is only a message notification. Do not reply to this email.

Subject: [EXT] Finn Almond | Left Wingback | Class of 2027 | University of Rochester

Hi Coach,

I wanted to follow up on this thread below. I'm very interested in Rochester and I would love to hop on a call this week. I can be available most anytime Monday the 20th, anytime after 12pm MT on Wednesday the 22nd, or most anytime Thursday the 23rd.

Best,
Finn Almond

From student-athletes, to college coaches, to club and high school staff, SportsRecruits was built to maximize recruiting efforts, amplify exposure, and unlock opportunity for everyone in the recruiting process.

Learn More About SportsRecruits

You received this notification because Finn Almond CC'd you on a message via their SportsRecruits account.

© 2026 SportsRecruits. 41 Schermerhorn Street #1062, Brooklyn, NY 11201.`

// The hash from the bulk-imported Apr 19 Rochester row
const KNOWN_BULK_HASH = '0b6e6d5f82987268c6253e505d9cd4465da63e55ae6a32bed6dfbb0c72e1a7df'

// Placeholder UUIDs — in prod these come from DB; for hash comparison we need the real values.
// Run the script once with these, then we'll know if the body alignment is the issue.
// Once we have the real school/coach UUIDs from the DB, plug them in and re-run.
const PLACEHOLDER_SCHOOL_ID = 'ROCHESTER_SCHOOL_UUID'
const PLACEHOLDER_BEN_CROSS_ID = 'BEN_CROSS_COACH_UUID'
const PLACEHOLDER_SEAN_STREB_ID = 'SEAN_STREB_COACH_UUID' // or null if unmatched

// ─── Mirror the webhook helper functions exactly ───────────────────────────────

function isOutboundCC(subject: string, body: string): boolean {
  return (
    /CC'?ed You on a Message to /i.test(subject) ||
    /You were CC'?d on a SportsRecruits message/i.test(body)
  )
}

function extractCoachNamesFromCC(body: string): string[] {
  const m = body.match(/send a message to (.+?)\.(?:\s|$)/i)
  if (!m) return []
  return m[1]
    .split(/\s+and\s+/i)
    .map((s: string) => s.replace(/^Coach\s+/i, '').trim())
    .filter(Boolean)
}

function extractCCBody(body: string): { srSubject: string | null; messageBody: string } {
  const normalized = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const subjectMatch = normalized.match(/^Subject:\s*(.+)$/im)

  if (!subjectMatch || subjectMatch.index === undefined) {
    return { srSubject: null, messageBody: cleanBody(normalized) }
  }

  const srSubject = subjectMatch[1].trim()
  const afterSubject = normalized
    .slice(subjectMatch.index + subjectMatch[0].length)
    .replace(/^\n+/, '')

  return { srSubject, messageBody: cleanBody(afterSubject) }
}

function getEmailDate(headers: string): Date {
  const m = headers.match(/^Date:\s*(.+)$/m)
  if (m) {
    const d = new Date(m[1].trim())
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}

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

// ─── Run the test ─────────────────────────────────────────────────────────────

console.log('═'.repeat(60))
console.log('PART 3A — OUTBOUND CC FIXTURE TEST')
console.log('═'.repeat(60))
console.log()

// 1. Detection
const detected = isOutboundCC(FIXTURE_SUBJECT, FIXTURE_BODY)
console.log(`1. DETECTION: ${detected ? '✅ YES — outbound CC' : '❌ NO — not detected'}`)
console.log()

// 2. Extraction
const parsedSchoolName = (FIXTURE_SUBJECT.match(/CC'?ed You on a Message to (.+)$/i) ?? [])[1]?.trim() ?? null
const coachNames = extractCoachNamesFromCC(FIXTURE_BODY)
const { srSubject, messageBody } = extractCCBody(FIXTURE_BODY)
const emailDate = getEmailDate(FIXTURE_HEADERS)
const dateStr = formatDateForParser(emailDate)

console.log('2. EXTRACTION:')
console.log(`   School (from subject): "${parsedSchoolName}"`)
console.log(`   Coaches (from body):   ${JSON.stringify(coachNames)}`)
console.log(`   SR subject:            "${srSubject}"`)
console.log(`   Email Date (raw):      ${emailDate.toISOString()}`)
console.log(`   Date (Denver format):  "${dateStr}"`)
console.log(`   Message body:`)
console.log(messageBody.split('\n').map(l => '     ' + l).join('\n'))
console.log()

// 3. Paste block
const schoolForTo = parsedSchoolName ?? 'Unknown School'
const coachesForTo = coachNames.length > 0 ? coachNames : ['Unknown Coach']
const pasteBlock = [
  'Me',
  `To: ${coachesForTo.map(n => `${n} (${schoolForTo})`).join(', ')}`,
  srSubject ?? '',
  dateStr,
  '',
  messageBody,
].join('\n')

console.log('3. PASTE BLOCK (sent to parseSRPaste):')
console.log('   ' + '-'.repeat(50))
pasteBlock.split('\n').forEach(l => console.log('   ' + l))
console.log('   ' + '-'.repeat(50))
console.log()

// 4. Parser output
const messages = parseSRPaste(pasteBlock)
const outboundMsg = messages.find(m => m.isOutbound) ?? null

console.log('4. PARSER OUTPUT:')
if (!outboundMsg) {
  console.log('   ❌ parseSRPaste returned NO outbound message')
} else {
  console.log(`   ✅ outbound message found`)
  console.log(`   isoDate:    ${outboundMsg.isoDate}`)
  console.log(`   recipients: ${JSON.stringify(outboundMsg.recipients)}`)
  console.log(`   subject:    ${outboundMsg.subject}`)
  console.log(`   body (first 120 chars): "${outboundMsg.body.slice(0, 120).replace(/\n/g, '↵')}"`)
}
console.log()

// 5. Content hash (with placeholder IDs — shows what the structure looks like)
if (outboundMsg) {
  const isoDate = outboundMsg.isoDate ?? ''
  const body    = outboundMsg.body

  // Case A: Both coaches matched (both have UUIDs)
  const tokensA = [
    `coach:${PLACEHOLDER_BEN_CROSS_ID}`,
    `coach:${PLACEHOLDER_SEAN_STREB_ID}`,
  ]
  const hashA = computeContentHash(isoDate, PLACEHOLDER_SCHOOL_ID, tokensA, body)

  // Case B: Sean Streb unmatched (name fallback)
  const tokensB = [
    `coach:${PLACEHOLDER_BEN_CROSS_ID}`,
    `name:sean streb`,
  ]
  const hashB = computeContentHash(isoDate, PLACEHOLDER_SCHOOL_ID, tokensB, body)

  // Case C: Show the pre-hash input string so we can see if body alignment is off
  const normalizedTokensA = [...tokensA].map(s => s.toLowerCase().trim()).sort().join(',')
  const preHashInputA = `${isoDate}|${PLACEHOLDER_SCHOOL_ID}|${normalizedTokensA}|${body}`

  console.log('5. CONTENT HASH INPUTS:')
  console.log(`   isoDate:  "${isoDate}"`)
  console.log(`   body len: ${body.length} chars`)
  console.log(`   body (repr): "${body.slice(0, 60).replace(/\n/g, '\\n')}"`)
  console.log()
  console.log('   Hash A (both coaches matched):')
  console.log(`     tokens: ${JSON.stringify(tokensA.sort())}`)
  console.log(`     hash:   ${hashA}`)
  console.log()
  console.log('   Hash B (Sean Streb unmatched → name fallback):')
  console.log(`     tokens: ${JSON.stringify(tokensB.sort())}`)
  console.log(`     hash:   ${hashB}`)
  console.log()
  console.log(`   Known bulk hash: ${KNOWN_BULK_HASH}`)
  console.log()

  if (hashA === KNOWN_BULK_HASH) {
    console.log('   ✅ Hash A MATCHES bulk import → dedup works (both coaches matched in both paths)')
  } else if (hashB === KNOWN_BULK_HASH) {
    console.log('   ✅ Hash B MATCHES bulk import → dedup works (Sean Streb unmatched in both paths)')
  } else {
    console.log('   ❌ Neither hash matches — body or token mismatch between webhook and bulk importer')
    console.log()
    console.log('   Diagnosis: body content differs between SR paste and CC notification email.')
    console.log('   To debug, compare body repr above against the bulk-imported row\'s summary column.')
    console.log()
    console.log('   Pre-hash input (first 200 chars):')
    console.log('   ' + preHashInputA.slice(0, 200))
  }
}

// 6. Thread key
if (outboundMsg && srSubject) {
  const normSubj = normalizeSubject(srSubject)
  // Placeholder tokens
  const coachTokens = [
    `coach:${PLACEHOLDER_BEN_CROSS_ID}`,
    `coach:${PLACEHOLDER_SEAN_STREB_ID}`,
  ]
  const threadKey = computeThreadKey(normSubj, coachTokens)
  console.log()
  console.log('6. THREAD KEY:')
  console.log(`   normalizedSubject: "${normSubj}"`)
  console.log(`   coachTokens:       ${JSON.stringify(coachTokens)}`)
  console.log(`   threadKey:         ${threadKey}`)
}

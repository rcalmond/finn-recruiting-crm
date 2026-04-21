/**
 * POST /api/bulk-import/parse
 *
 * Accepts a raw SR Sent folder paste, parses it, runs school/coach matching,
 * checks for duplicates, and returns a preview payload for the UI.
 *
 * Body:  { text: string }
 * Response: { rows: PreviewRow[], stats: Stats }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  parseSRPaste,
  normalizeSubject,
  computeThreadKey,
  computeContentHash,
  sha256,
  type ParsedRecipient,
} from '@/lib/sr-paste-parser'

// ─── Types ────────────────────────────────────────────────────────────────────

type SchoolRow = {
  id: string
  name: string
  short_name: string | null
  aliases: string[]
}

type CoachRow = {
  id: string
  school_id: string
  name: string
  is_primary: boolean
}

export type MatchStatus = 'matched' | 'partial' | 'unmatched_school' | 'duplicate'

export interface PreviewCoach {
  coachId: string | null
  parsedName: string
  matchType: string
}

export interface PreviewRow {
  tempId: string                  // client-side key: sha256 of rawBlock
  isoDate: string | null
  schoolId: string | null
  schoolName: string | null       // matched DB name (or null)
  parsedSchoolName: string | null // as written in SR paste
  coaches: PreviewCoach[]
  coachName: string               // semicolon-joined for display & DB insert
  primaryCoachId: string | null
  subject: string | null
  normalizedSubject: string | null
  bodyExcerpt: string             // first 80 chars of body
  body: string
  threadKey: string | null
  contentHash: string | null
  matchStatus: MatchStatus
  schoolMatchType: string | null
}

interface Stats {
  total: number
  outbound: number
  inbound: number
  matched: number
  partial: number
  unmatched_school: number
  duplicate: number
  threadCount: number
  schoolCount: number
}

// ─── Supabase service client ──────────────────────────────────────────────────

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── School matching (mirrors webhook + reparse-partials logic) ───────────────

function matchSchool(
  parsedName: string,
  schools: SchoolRow[]
): { school: SchoolRow | null; matchType: string } {
  const lower = parsedName.toLowerCase().trim()

  const exact = schools.find(s => s.name.toLowerCase() === lower)
  if (exact) return { school: exact, matchType: 'exact' }

  const shortExact = schools.find(s => s.short_name?.toLowerCase() === lower)
  if (shortExact) return { school: shortExact, matchType: 'short_name_exact' }

  const aliasMatch = schools.find(s =>
    (s.aliases ?? []).some(a => a.toLowerCase() === lower)
  )
  if (aliasMatch) return { school: aliasMatch, matchType: 'alias' }

  const nameContains = schools.find(s => s.name.toLowerCase().includes(lower))
  if (nameContains) return { school: nameContains, matchType: 'name_contains_parsed' }

  const parsedContains = schools.find(s => lower.includes(s.name.toLowerCase()))
  if (parsedContains) return { school: parsedContains, matchType: 'parsed_contains_name' }

  return { school: null, matchType: 'none' }
}

// ─── Coach matching ───────────────────────────────────────────────────────────

function matchCoach(
  parsedName: string,
  schoolCoaches: CoachRow[]
): { coachId: string | null; matchType: string } {
  if (schoolCoaches.length === 0) return { coachId: null, matchType: 'no_coaches' }

  const lower = parsedName.toLowerCase().trim()
  const parsedLast = lower.split(/\s+/).at(-1) ?? ''

  const exact = schoolCoaches.find(c => c.name.toLowerCase() === lower)
  if (exact) return { coachId: exact.id, matchType: 'exact' }

  if (parsedLast.length > 1) {
    const lastMatch = schoolCoaches.find(
      c => c.name.toLowerCase().split(/\s+/).at(-1) === parsedLast
    )
    if (lastMatch) return { coachId: lastMatch.id, matchType: 'last_name' }
  }

  const contains = schoolCoaches.find(
    c => c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())
  )
  if (contains) return { coachId: contains.id, matchType: 'contains' }

  return { coachId: null, matchType: 'none' }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth ──
  const admin = serviceClient()
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse body ──
  let text: string
  try {
    const body = await req.json()
    if (typeof body?.text !== 'string' || body.text.trim().length === 0) {
      return NextResponse.json({ error: 'text field is required' }, { status: 400 })
    }
    text = body.text
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── Parse paste ──
  // debug=true writes block-level traces to console.error (visible in server/Vercel logs)
  const allMessages = parseSRPaste(text, true)
  const outbound = allMessages.filter(m => m.isOutbound)
  const inbound  = allMessages.filter(m => !m.isOutbound)

  // ── Fetch reference data in parallel ──
  const [{ data: schoolData }, { data: coachData }] = await Promise.all([
    admin.from('schools').select('id, name, short_name, aliases'),
    admin.from('coaches').select('id, school_id, name, is_primary'),
  ])
  const schools = (schoolData ?? []) as SchoolRow[]
  const allCoaches = (coachData ?? []) as CoachRow[]

  // ── Build preview rows for outbound messages ──
  const rows: PreviewRow[] = []

  for (const msg of outbound) {
    const tempId = sha256(msg.rawBlock.slice(0, 500))

    // School matching: try each recipient's school, take first match
    let matchedSchool: SchoolRow | null = null
    let schoolMatchType: string | null = null
    let parsedSchoolName: string | null = null

    for (const r of msg.recipients) {
      const { school, matchType } = matchSchool(r.school, schools)
      if (school) {
        matchedSchool = school
        schoolMatchType = matchType
        parsedSchoolName = r.school
        break
      }
    }

    // Fallback: try matching subject's last segment after "|" (e.g. "Introduction | Rochester")
    if (!matchedSchool && msg.subject) {
      const parts = msg.subject.split('|')
      const lastPart = parts.at(-1)?.trim() ?? ''
      if (lastPart) {
        const { school, matchType } = matchSchool(lastPart, schools)
        if (school) {
          matchedSchool = school
          schoolMatchType = matchType
          parsedSchoolName = lastPart
        }
      }
    }

    if (!parsedSchoolName && msg.recipients.length > 0) {
      parsedSchoolName = msg.recipients[0]?.school ?? null
    }

    // Coach matching per recipient
    const schoolCoaches = matchedSchool
      ? allCoaches.filter(c => c.school_id === matchedSchool!.id)
      : []

    const coaches: PreviewCoach[] = msg.recipients.map((r: ParsedRecipient) => {
      if (!matchedSchool) return { coachId: null, parsedName: r.name, matchType: 'no_school' }
      const { coachId, matchType } = matchCoach(r.name, schoolCoaches)
      return { coachId, parsedName: r.name, matchType }
    })

    const primaryCoachId =
      coaches.find(c => {
        if (!c.coachId) return false
        const dbCoach = schoolCoaches.find(sc => sc.id === c.coachId)
        return dbCoach?.is_primary ?? false
      })?.coachId ??
      coaches.find(c => c.coachId !== null)?.coachId ??
      null

    const coachName = coaches.map(c => c.parsedName).join('; ')
    const normSubject = msg.subject ? normalizeSubject(msg.subject) : null

    // Thread key uses hybrid identity tokens:
    //   matched coaches → "coach:<uuid>"  (stable across name variations)
    //   unmatched       → "name:<normalized>" (lowercased, whitespace collapsed)
    const coachTokensForThread = coaches.map(c =>
      c.coachId
        ? `coach:${c.coachId}`
        : `name:${c.parsedName.toLowerCase().replace(/\s+/g, ' ').trim()}`
    )
    const threadKey = normSubject
      ? computeThreadKey(normSubject, coachTokensForThread)
      : null

    // Content hash (null if school or date unresolved — can't dedup without both)
    let contentHash: string | null = null
    if (matchedSchool && msg.isoDate) {
      const coachIdsOrNames = coaches.map(c => c.coachId ?? c.parsedName)
      contentHash = computeContentHash(
        msg.isoDate,
        matchedSchool.id,
        coachIdsOrNames,
        msg.body
      )
    }

    const bodyExcerpt = msg.body.slice(0, 80).replace(/\n/g, ' ')

    rows.push({
      tempId,
      isoDate: msg.isoDate,
      schoolId: matchedSchool?.id ?? null,
      schoolName: matchedSchool?.name ?? null,
      parsedSchoolName,
      coaches,
      coachName,
      primaryCoachId,
      subject: msg.subject,
      normalizedSubject: normSubject,
      bodyExcerpt,
      body: msg.body,
      threadKey,
      contentHash,
      matchStatus: 'matched',  // will be updated below
      schoolMatchType,
    })
  }

  // ── Bulk dedup check ──
  const hashes = rows.map(r => r.contentHash).filter((h): h is string => h !== null)
  const existingHashes = new Set<string>()

  if (hashes.length > 0) {
    const { data: existing } = await admin
      .from('contact_log')
      .select('content_hash')
      .in('content_hash', hashes)
    for (const row of existing ?? []) {
      if (row.content_hash) existingHashes.add(row.content_hash)
    }
  }

  // ── Assign match status ──
  for (const row of rows) {
    if (row.contentHash && existingHashes.has(row.contentHash)) {
      row.matchStatus = 'duplicate'
    } else if (!row.schoolId) {
      row.matchStatus = 'unmatched_school'
    } else if (row.coaches.some(c => c.coachId === null)) {
      row.matchStatus = 'partial'
    } else {
      row.matchStatus = 'matched'
    }
  }

  // ── Stats ──
  const threadKeys = new Set(rows.map(r => r.threadKey).filter(Boolean))
  const matchedSchoolIds = new Set(rows.map(r => r.schoolId).filter(Boolean))

  const stats: Stats = {
    total: allMessages.length,
    outbound: outbound.length,
    inbound: inbound.length,
    matched:           rows.filter(r => r.matchStatus === 'matched').length,
    partial:           rows.filter(r => r.matchStatus === 'partial').length,
    unmatched_school:  rows.filter(r => r.matchStatus === 'unmatched_school').length,
    duplicate:         rows.filter(r => r.matchStatus === 'duplicate').length,
    threadCount:       threadKeys.size,
    schoolCount:       matchedSchoolIds.size,
  }

  return NextResponse.json({ rows, stats })
}

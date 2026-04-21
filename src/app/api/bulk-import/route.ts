/**
 * POST /api/bulk-import
 *
 * Accepts an array of user-reviewed rows and writes them to contact_log.
 *
 * Server-side responsibilities:
 *   1. Validate all fields
 *   2. Verify school IDs exist
 *   3. Re-run coach matching (exact → last name → contains) against the
 *      actual coaches table for the row's school — this ensures manual
 *      school corrections produce correct coach linkage, not stale/empty
 *      coachIds from the parse step
 *   4. Compute content_hash from authoritative data (post-re-match)
 *   5. Final dedup check
 *   6. Insert with correct parse_status (parsed/partial)
 *
 * Body:  { rows: ImportRow[] }
 * Response: { inserted, skipped, errors, skippedRows }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeContentHash } from '@/lib/sr-paste-parser'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportRow {
  isoDate: string             // YYYY-MM-DD
  schoolId: string            // valid school UUID
  coachName: string           // semicolon-joined display string (used for DB insert + re-match)
  coachIds: string[]          // matched coach UUIDs from parse step (re-matched server-side)
  primaryCoachId: string | null
  body: string
  subject: string | null
  threadKey: string | null
}

export interface SkippedRow {
  isoDate: string
  schoolName: string | null
  coachName: string
  reason: 'duplicate'
}

type CoachRow = {
  id: string
  school_id: string
  name: string
  is_primary: boolean
}

// ─── Coach matching (mirrors webhook + reparse-partials logic) ─────────────────

function matchCoachByName(
  parsedName: string,
  schoolCoaches: CoachRow[]
): { coachId: string | null; matched: boolean } {
  if (schoolCoaches.length === 0) return { coachId: null, matched: false }

  const lower = parsedName.toLowerCase().trim()
  const parsedLast = lower.split(/\s+/).at(-1) ?? ''

  const exact = schoolCoaches.find(c => c.name.toLowerCase() === lower)
  if (exact) return { coachId: exact.id, matched: true }

  if (parsedLast.length > 1) {
    const lastMatch = schoolCoaches.find(
      c => c.name.toLowerCase().split(/\s+/).at(-1) === parsedLast
    )
    if (lastMatch) return { coachId: lastMatch.id, matched: true }
  }

  const contains = schoolCoaches.find(
    c => c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())
  )
  if (contains) return { coachId: contains.id, matched: true }

  return { coachId: null, matched: false }
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isValidUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

function isValidISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))
}

function validateRow(
  row: unknown,
  index: number
): { valid: ImportRow; error: null } | { valid: null; error: string } {
  if (typeof row !== 'object' || row === null)
    return { valid: null, error: `Row ${index}: not an object` }

  const r = row as Record<string, unknown>

  if (typeof r.isoDate !== 'string' || !isValidISODate(r.isoDate))
    return { valid: null, error: `Row ${index}: invalid isoDate "${r.isoDate}"` }

  if (typeof r.schoolId !== 'string' || !isValidUUID(r.schoolId))
    return { valid: null, error: `Row ${index}: invalid schoolId "${r.schoolId}"` }

  if (typeof r.coachName !== 'string')
    return { valid: null, error: `Row ${index}: coachName must be a string` }

  if (typeof r.body !== 'string')
    return { valid: null, error: `Row ${index}: body must be a string` }

  if (!Array.isArray(r.coachIds) || r.coachIds.some(id => typeof id !== 'string'))
    return { valid: null, error: `Row ${index}: coachIds must be string[]` }

  if (r.primaryCoachId != null && !isValidUUID(r.primaryCoachId as string))
    return { valid: null, error: `Row ${index}: primaryCoachId is not a valid UUID` }

  return {
    valid: {
      isoDate:        r.isoDate as string,
      schoolId:       r.schoolId as string,
      coachName:      r.coachName as string,
      coachIds:       r.coachIds as string[],
      primaryCoachId: (r.primaryCoachId as string | null | undefined) ?? null,
      body:           r.body as string,
      subject:        (r.subject as string | null | undefined) ?? null,
      threadKey:      (r.threadKey as string | null | undefined) ?? null,
    },
    error: null,
  }
}

// ─── Supabase service client ──────────────────────────────────────────────────

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth ──
  const admin = serviceClient()
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Parse body ──
  let rawRows: unknown[]
  try {
    const body = await req.json()
    if (!Array.isArray(body?.rows))
      return NextResponse.json({ error: 'rows must be an array' }, { status: 400 })
    rawRows = body.rows
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (rawRows.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: 0, errors: [], skippedRows: [] })
  }
  if (rawRows.length > 500) {
    return NextResponse.json(
      { error: `Too many rows: ${rawRows.length} (max 500 per request)` },
      { status: 400 }
    )
  }

  // ── Validate all rows (reject batch on any error) ──
  const validRows: ImportRow[] = []
  const errors: string[] = []
  for (let i = 0; i < rawRows.length; i++) {
    const result = validateRow(rawRows[i], i)
    if (result.error) errors.push(result.error)
    else validRows.push(result.valid!)
  }
  if (errors.length > 0) {
    return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 422 })
  }

  // ── Verify school IDs exist; build schoolId → name map ──
  const schoolIdSet: Record<string, true> = {}
  for (const r of validRows) schoolIdSet[r.schoolId] = true
  const schoolIds = Object.keys(schoolIdSet)

  const { data: foundSchools } = await admin
    .from('schools')
    .select('id, name')
    .in('id', schoolIds)
  const schoolMap: Record<string, string> = {}
  for (const s of (foundSchools ?? []) as { id: string; name: string }[]) {
    schoolMap[s.id] = s.name
  }
  const missingSchools = schoolIds.filter(id => !(id in schoolMap))
  if (missingSchools.length > 0) {
    return NextResponse.json(
      { error: `Unknown school IDs: ${missingSchools.join(', ')}` },
      { status: 422 }
    )
  }

  // ── Fetch coaches for all schools in batch ──
  const { data: coachData } = await admin
    .from('coaches')
    .select('id, school_id, name, is_primary')
    .in('school_id', schoolIds)
  const allCoaches = (coachData ?? []) as CoachRow[]

  // Build schoolId → CoachRow[] map
  const coachesBySchool: Record<string, CoachRow[]> = {}
  for (const c of allCoaches) {
    if (!coachesBySchool[c.school_id]) coachesBySchool[c.school_id] = []
    coachesBySchool[c.school_id].push(c)
  }

  // ── Re-match coaches server-side for every row ──
  //
  // coachName is a semicolon-joined string of parsed names (e.g. "Justin Serpone; Jane Doe").
  // We split and re-match each name against the school's coaches table. This ensures that
  // manual school corrections in the UI produce correct coach linkage — not stale or empty
  // coachIds from the parse step, which was done against the originally matched school.
  //
  // parse_status:
  //   'parsed'  — school matched AND all coaches resolved to a DB record (or school has no coaches)
  //   'partial' — school matched but at least one coach name didn't find a DB match

  interface ResolvedRow {
    row: ImportRow
    resolvedCoachIds: string[]
    primaryCoachId: string | null
    parseStatus: 'parsed' | 'partial'
  }

  const resolvedRows: ResolvedRow[] = validRows.map(row => {
    const schoolCoaches = coachesBySchool[row.schoolId] ?? []
    const parsedNames = row.coachName
      ? row.coachName.split(/;\s*/).map(n => n.trim()).filter(Boolean)
      : []

    if (parsedNames.length === 0) {
      // No coach names to match — mark parsed if school has no coaches, partial if it does
      return {
        row,
        resolvedCoachIds: [],
        primaryCoachId: null,
        parseStatus: schoolCoaches.length === 0 ? 'parsed' : 'partial',
      }
    }

    const matchResults = parsedNames.map(name => matchCoachByName(name, schoolCoaches))
    const resolvedCoachIds = matchResults
      .map(r => r.coachId)
      .filter((id): id is string => id !== null)

    const allMatched = matchResults.every(r => r.matched)
    const parseStatus: 'parsed' | 'partial' = allMatched ? 'parsed' : 'partial'

    // Primary: prefer a DB coach flagged is_primary; fall back to first matched
    const primaryCoachId =
      resolvedCoachIds.find(id => {
        const coach = schoolCoaches.find(c => c.id === id)
        return coach?.is_primary ?? false
      }) ??
      resolvedCoachIds[0] ??
      null

    return { row, resolvedCoachIds, primaryCoachId, parseStatus }
  })

  // ── Compute content hashes from authoritative post-re-match data ──
  //
  // Use hybrid tokens: "coach:<uuid>" for matched coaches, "name:<normalized>"
  // for any that still didn't match (partial case). This keeps the hash stable
  // if the same import is re-attempted after adding missing coaches to the DB.

  interface HashedRow extends ResolvedRow {
    contentHash: string
  }

  const hashedRows: HashedRow[] = resolvedRows.map(resolved => {
    const { row, resolvedCoachIds } = resolved
    const parsedNames = row.coachName
      ? row.coachName.split(/;\s*/).map(n => n.trim()).filter(Boolean)
      : []

    // Build token list: matched coaches get UUID token; unmatched get name token
    const schoolCoaches = coachesBySchool[row.schoolId] ?? []
    const coachTokens: string[] = parsedNames.map(name => {
      const { coachId } = matchCoachByName(name, schoolCoaches)
      return coachId
        ? `coach:${coachId}`
        : `name:${name.toLowerCase().replace(/\s+/g, ' ').trim()}`
    })

    // Fallback if no names at all
    const tokensForHash = coachTokens.length > 0
      ? coachTokens
      : resolvedCoachIds.length > 0
        ? resolvedCoachIds.map(id => `coach:${id}`)
        : ['unknown']

    const contentHash = computeContentHash(row.isoDate, row.schoolId, tokensForHash, row.body)
    return { ...resolved, contentHash }
  })

  // ── Final authoritative dedup check ──
  const hashes = hashedRows.map(r => r.contentHash)
  const { data: existing } = await admin
    .from('contact_log')
    .select('content_hash')
    .in('content_hash', hashes)

  const existingHashSet: Record<string, true> = {}
  for (const e of (existing ?? []) as { content_hash: string }[]) {
    existingHashSet[e.content_hash] = true
  }

  const toInsert   = hashedRows.filter(r => !(r.contentHash in existingHashSet))
  const skippedItems = hashedRows.filter(r => r.contentHash in existingHashSet)

  const skippedRows: SkippedRow[] = skippedItems.map(({ row }) => ({
    isoDate:    row.isoDate,
    schoolName: schoolMap[row.schoolId] ?? null,
    coachName:  row.coachName,
    reason:     'duplicate' as const,
  }))

  if (toInsert.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: skippedItems.length, errors: [], skippedRows })
  }

  // ── Insert ──
  const insertPayload = toInsert.map(({ row, resolvedCoachIds, primaryCoachId, parseStatus, contentHash }) => ({
    school_id:         row.schoolId,
    date:              row.isoDate,
    channel:           'Sports Recruits' as const,
    direction:         'Outbound' as const,
    coach_name:        row.coachName || null,
    coach_id:          primaryCoachId,
    summary:           row.body,
    created_by:        user.id,
    raw_source:        null,
    source_thread_id:  row.threadKey,
    source_message_id: null,
    parse_status:      parseStatus,
    parse_notes:       resolvedCoachIds.length < (row.coachName ? row.coachName.split(/;\s*/).filter(Boolean).length : 0)
                         ? `${row.coachName.split(/;\s*/).filter(Boolean).length - resolvedCoachIds.length} coach(es) unmatched — review needed`
                         : null,
    content_hash:      contentHash,
  }))

  const { error: insertError } = await admin.from('contact_log').insert(insertPayload)

  if (insertError) {
    console.error('[bulk-import] insert error:', insertError)
    return NextResponse.json({ error: 'Insert failed', details: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    inserted:    toInsert.length,
    skipped:     skippedItems.length,
    errors:      [],
    skippedRows,
  })
}

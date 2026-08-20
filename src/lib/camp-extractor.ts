/**
 * camp-extractor.ts
 *
 * Extracts camp data from email body text or web page content using Claude Haiku.
 * Also provides dedup logic to avoid re-proposing rejected camps.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { scopeOf } from '@/lib/tenant-db'

/** Concurrent enqueue of the same (proposal, family) is expected and benign. */
const PG_UNIQUE_VIOLATION = '23505'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExtractedCamp {
  name: string
  start_date: string             // YYYY-MM-DD
  end_date: string | null
  location: string | null
  registration_url: string | null
  registration_deadline: string | null
  cost: string | null
  notes: string | null
  attendee_school_ids: string[]
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
}

interface ExtractionInput {
  text: string
  sourceContext: string
  hostSchoolName: string
  hostSchoolId: string
  candidateAttendeeSchools: Array<{ id: string; name: string; aliases: string[] }>
  currentDate: string            // YYYY-MM-DD
}

// ─── Anthropic client ────────────────────────────────────────────────────────

let _anthropic: Anthropic | null = null
function getClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  return _anthropic
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

function buildPrompt(input: ExtractionInput): string {
  const schoolList = input.candidateAttendeeSchools
    .map(s => `${s.id}: ${s.name}${s.aliases.length > 0 ? ` (${s.aliases.join(', ')})` : ''}`)
    .join('\n')

  return `You are extracting men's soccer ID camp data from text. The host school is "${input.hostSchoolName}".

Today's date: ${input.currentDate}

Source context: ${input.sourceContext}

RULES:
1. Extract zero or more camps from the text. Return an empty array if no camp info is present.
2. Each camp must have at minimum a name and start_date.
3. Date validation:
   - Reject any camp with start_date before ${input.currentDate} (past camps).
   - Reject any camp with start_date more than 18 months from ${input.currentDate}.
   - If only one date is mentioned, set end_date = start_date.
   - If year is ambiguous, use ${input.currentDate.slice(0, 4)} if the month hasn't passed, otherwise next year.
4. If text mentions other schools attending, match against this list and include their IDs in attendee_school_ids.
   The list below has format "uuid: school name (alias1, alias2, ...)" — match by name OR any alias:
${schoolList || '(no candidate schools)'}
   Only include schools that are explicitly mentioned. Skip unmatched names.
5. Confidence rubric:
   - high: explicit dates, location, host school clear
   - medium: dates clear but some details ambiguous
   - low: camp mentioned but specifics unclear
6. If a field is NOT stated in the source text, return null. Do NOT infer cost, deadline, or URL.
7. Return ONLY valid JSON — no preamble, no markdown, no explanation outside the JSON.

OUTPUT FORMAT — JSON array:
[
  {
    "name": "string",
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD or null",
    "location": "string or null",
    "registration_url": "string or null",
    "registration_deadline": "YYYY-MM-DD or null",
    "cost": "string or null",
    "notes": "string or null",
    "attendee_school_ids": ["uuid", ...],
    "confidence": "high|medium|low",
    "reasoning": "1-2 sentence explanation of what was extracted and confidence level"
  }
]

EXAMPLES:

Example 1 — Full camp details:
Text: "We will be hosting an ID camp on May 9-10 that you can attend. Register at https://example.com/camp. Cost is $295."
Output: [{"name":"${input.hostSchoolName} ID Camp","start_date":"2026-05-09","end_date":"2026-05-10","location":null,"registration_url":"https://example.com/camp","registration_deadline":null,"cost":"$295","notes":null,"attendee_school_ids":[],"confidence":"high","reasoning":"Explicit dates, registration URL, and cost provided."}]

Example 2 — Multiple camps:
Text: "Please see our summer ID camp dates: May 9 & 10, 2026 and August 1 & 2, 2026. Register at https://example.com"
Output: [{"name":"${input.hostSchoolName} ID Camp","start_date":"2026-05-09","end_date":"2026-05-10","location":null,"registration_url":"https://example.com","registration_deadline":null,"cost":null,"notes":null,"attendee_school_ids":[],"confidence":"high","reasoning":"Two camps with explicit dates and shared registration URL."},{"name":"${input.hostSchoolName} ID Camp","start_date":"2026-08-01","end_date":"2026-08-02","location":null,"registration_url":"https://example.com","registration_deadline":null,"cost":null,"notes":null,"attendee_school_ids":[],"confidence":"high","reasoning":"Second camp from same email."}]

Example 3 — Vague mention without concrete date:
Text: "Want to come out to our camp in May? I can share the link if you need it."
Output: []
(Camp is mentioned but no specific date is provided. Without a start_date, we cannot propose a camp.)

Example 4 — No camp content:
Text: "Thanks for reaching out! Let's plan to connect in May."
Output: []

Example 5 — Attendee schools:
Text: "Our ID camp June 15-16 will feature coaches from Hopkins and Tufts evaluating talent."
Output: [{"name":"${input.hostSchoolName} ID Camp","start_date":"2026-06-15","end_date":"2026-06-16","location":null,"registration_url":null,"registration_deadline":null,"cost":null,"notes":"Hopkins and Tufts coaches attending","attendee_school_ids":["abc-123-uuid","def-456-uuid"],"confidence":"medium","reasoning":"Dates clear, attendee schools mentioned but no registration details."}]
(The uuid values come from matching "Hopkins" and "Tufts" against the candidate school list above.)

Example 6 — Camp with date but minimal other info:
Text: "Looking forward to seeing you at the June 14 ID camp."
Output: [{"name":"${input.hostSchoolName} ID Camp","start_date":"2026-06-14","end_date":"2026-06-14","location":null,"registration_url":null,"registration_deadline":null,"cost":null,"notes":null,"attendee_school_ids":[],"confidence":"low","reasoning":"Single date provided with no other details. Camp is real but specifics need to be filled in manually."}]

TEXT TO ANALYZE:
${input.text}`
}

// ─── Extractor ───────────────────────────────────────────────────────────────

export async function extractCampsFromText(input: ExtractionInput): Promise<ExtractedCamp[]> {
  try {
    const truncatedText = input.text.slice(0, 4000)
    const prompt = buildPrompt({ ...input, text: truncatedText })

    const response = await getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = response.content[0]
    if (content.type !== 'text') return []

    // Strip markdown code fences and trailing commentary.
    // Haiku sometimes returns: ```json\n[...]\n```\n\n**Reasoning:** ...
    let raw = content.text.trim()
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```(?:json)?\s*/, '').replace(/```[\s\S]*$/, '').trim()
    }
    // If there's trailing text after the JSON array close, strip it
    const lastBracket = raw.lastIndexOf(']')
    if (lastBracket !== -1 && lastBracket < raw.length - 1) {
      raw = raw.slice(0, lastBracket + 1)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (parseErr) {
      console.error('[camp-extractor] JSON parse failed.')
      console.error('[camp-extractor] Raw response (first 500 chars):')
      console.error(raw.slice(0, 500))
      console.error('[camp-extractor] Raw response (last 200 chars):')
      console.error(raw.slice(-200))
      return []
    }

    if (!Array.isArray(parsed)) return []

    // Validate each camp has required fields + enforce past-date rejection
    // (model doesn't always comply with the prompt rule)
    return (parsed as ExtractedCamp[]).filter((c: ExtractedCamp) =>
      c.name && c.start_date && /^\d{4}-\d{2}-\d{2}$/.test(c.start_date) &&
      c.start_date >= input.currentDate
    )
  } catch (err) {
    console.error('[camp-extractor] extraction failed:', err)
    return []
  }
}

// ─── Dedup ───────────────────────────────────────────────────────────────────

export interface ProposalDedupInput {
  /** REQUIRED, and deliberately not optional. An optional family recreates the
   *  defect the first time a caller omits it: camp_proposals is a SHARED catalog
   *  table, so suppression decided without a family is suppression for everyone.
   *  Required means the compiler finds every call site. */
  familyId: string
  hostSchoolId: string
  startDate: string
  endDate: string | null
}

export interface ProposalDedupResult {
  skip: boolean
  reason?: string
  matchedCampId?: string
  /** Set when a SHARED pending proposal already existed and this family had no
   *  decision row, so one was created and the proposal entered their queue. */
  enqueuedProposalId?: string
}

/**
 * Should this proposed camp be skipped for THIS FAMILY?
 *
 * THE MODEL: the PROPOSAL is shared so it is reviewed once; the DECISION is
 * per-family. Before this split, one family rejecting a camp set a global
 * status and silently suppressed that camp for every other family, forever,
 * with no surface anywhere. The camp-discovery cron's ALMOND_FAMILY_ID pin was
 * the only thing keeping that from firing, which was an accident, not a control.
 *
 * The checks, in order:
 *   1. An existing camps row with a matching signature — matched, not skipped.
 *   2a. status 'invalid' — a bad extraction, never a real camp. Skips for EVERYONE.
 *   2b. THIS family dismissed a proposal with this signature. Skips for them ONLY.
 *   3. A shared PENDING proposal exists. Never insert a duplicate — but if this
 *      family has no decision row, CREATE one so the proposal enters their queue.
 *      The dangerous inversion is treating "no decision row" as "already handled":
 *      that is the original bug wearing a new schema.
 */
export async function shouldSkipProposal(
  supabase: SupabaseClient,
  input: ProposalDedupInput,
): Promise<ProposalDedupResult> {
  const { familyId, hostSchoolId, startDate, endDate } = input
  const effectiveEnd = endDate ?? startDate

  // The family argument must agree with the client's own scope. A Testerson id
  // on an Almond-scoped client would read Almond's decisions and write Almond's
  // rows — a mismatch the wrapper would only catch on write, and only sometimes.
  const clientScope = scopeOf(supabase)
  if (clientScope && clientScope !== familyId) {
    throw new Error(
      `shouldSkipProposal: familyId ${familyId} disagrees with the client scope ${clientScope}`
    )
  }

  // Check 1: existing camps row with matching signature (±2 days tolerance)
  const startLow = shiftDate(startDate, -2)
  const startHigh = shiftDate(startDate, 2)
  const endLow = shiftDate(effectiveEnd, -2)
  const endHigh = shiftDate(effectiveEnd, 2)

  const { data: existingCamps } = await supabase
    .from('camps')
    .select('id, start_date, end_date')
    .eq('host_school_id', hostSchoolId)
    .gte('start_date', startLow)
    .lte('start_date', startHigh)
    .gte('end_date', endLow)
    .lte('end_date', endHigh)
    .limit(1)

  if (existingCamps && existingCamps.length > 0) {
    return { skip: false, matchedCampId: existingCamps[0].id }
  }

  // Every proposal carrying this signature, any status. One read serves 2a, 2b
  // and 3 — and reading the statuses together is what makes the per-family split
  // expressible at all.
  const { data: signatureProposals, error: sigErr } = await supabase
    .from('camp_proposals')
    .select('id, status, created_at')
    .eq('host_school_id', hostSchoolId)
    .contains('proposed_data', { start_date: startDate })
    .order('created_at', { ascending: false })

  if (sigErr) {
    // Fail CLOSED on a failed read: a dedup check that errors must not be read
    // as "nothing found, go ahead and insert" — that duplicates proposals.
    console.error('[camp-dedup] signature read failed:', sigErr.message)
    return { skip: true, reason: `dedup read failed: ${sigErr.message}` }
  }

  const proposals = signatureProposals ?? []
  if (proposals.length === 0) return { skip: false }

  // Check 2a: marked invalid by an admin — a bad extraction, not a real camp.
  // The ONE suppression that is correctly global.
  if (proposals.some(p => p.status === 'invalid')) {
    return { skip: true, reason: 'proposal marked invalid — suppressed for every family' }
  }

  // This family's decisions on those proposals.
  const { data: decisionRows, error: decErr } = await supabase
    .from('camp_proposal_decisions')
    .select('proposal_id, decision')
    .eq('family_id', familyId)
    .in('proposal_id', proposals.map(p => p.id))

  if (decErr) {
    console.error('[camp-dedup] decision read failed:', decErr.message)
    return { skip: true, reason: `dedup read failed: ${decErr.message}` }
  }

  const decisions = decisionRows ?? []

  // Check 2b: THIS family dismissed it. Skips for them and nobody else.
  if (decisions.some(d => d.decision === 'dismissed')) {
    return { skip: true, reason: 'dismissed by this family' }
  }

  // Check 3: a shared pending proposal already exists — never duplicate it.
  const pending = proposals.find(p => p.status === 'pending')
  if (pending) {
    const decided = new Set(decisions.map(d => d.proposal_id))
    if (decided.has(pending.id)) {
      return { skip: true, reason: 'pending proposal already in this family queue' }
    }

    // No decision row: the proposal exists but this family has never been
    // offered it. Create the row rather than silently doing nothing — absence
    // of a decision is NOT evidence the family already saw it.
    const { error: insErr } = await supabase
      .from('camp_proposal_decisions')
      .insert({ proposal_id: pending.id, family_id: familyId, decision: 'pending' })

    if (insErr && insErr.code !== PG_UNIQUE_VIOLATION) {
      console.error('[camp-dedup] could not enqueue for family:', insErr.message)
    }
    return {
      skip: true,
      reason: 'shared pending proposal — surfaced to this family',
      enqueuedProposalId: pending.id,
    }
  }

  // Terminal proposals exist for this signature, but none is invalid, none was
  // dismissed by this family, and none is pending. This family has never been
  // offered this camp — propose it.
  return { skip: false }
}

// ─── Materiality classifier ─────────────────────────────────────────────────

export interface CampUpdateMateriality {
  material: boolean
  reason?: string
  updateSummary?: string
  newSchools?: Array<{ schoolId: string; shortName: string; role: 'host' | 'attendee' }>
}

/**
 * Determines whether an update to an existing camp is worth surfacing
 * in the proposal queue. Only "new tracked school associated" counts
 * as material. Date/description/URL/cost changes are not material.
 */
export async function classifyCampUpdate(
  supabase: SupabaseClient,
  matchedCampId: string,
  proposedData: {
    attendee_school_ids: string[]
  },
  proposedHostSchoolId: string,
): Promise<CampUpdateMateriality> {
  // Fetch existing camp's host + current attendee schools
  const [campResult, attendeesResult] = await Promise.all([
    supabase.from('camps').select('host_school_id').eq('id', matchedCampId).single(),
    supabase.from('camp_school_attendees').select('school_id').eq('camp_id', matchedCampId),
  ])

  const existingHostId = (campResult.data as { host_school_id: string } | null)?.host_school_id
  const existingAttendeeIds = new Set(
    ((attendeesResult.data ?? []) as Array<{ school_id: string }>).map(a => a.school_id)
  )

  // Compute newly-associated schools
  const candidateNew: Array<{ schoolId: string; role: 'host' | 'attendee' }> = []

  // Check if proposed host is different from existing host
  if (proposedHostSchoolId !== existingHostId) {
    candidateNew.push({ schoolId: proposedHostSchoolId, role: 'host' })
  }

  // Check proposed attendees not already on the camp
  for (const sid of proposedData.attendee_school_ids) {
    if (!existingAttendeeIds.has(sid) && sid !== existingHostId) {
      candidateNew.push({ schoolId: sid, role: 'attendee' })
    }
  }

  if (candidateNew.length === 0) {
    return { material: false }
  }

  // Filter to A/B/C active schools only
  const candidateIds = candidateNew.map(c => c.schoolId)
  const { data: trackedSchools } = await supabase
    .from('schools')
    .select('id, short_name, name, category, status')
    .in('id', candidateIds)

  const tracked = new Map(
    ((trackedSchools ?? []) as Array<{ id: string; short_name: string | null; name: string; category: string; status: string }>)
      .filter(s => ['A', 'B', 'C'].includes(s.category) && s.status !== 'Inactive')
      .map(s => [s.id, s])
  )

  const newSchools = candidateNew
    .filter(c => tracked.has(c.schoolId))
    .map(c => {
      const s = tracked.get(c.schoolId)!
      return { schoolId: c.schoolId, shortName: s.short_name || s.name, role: c.role }
    })

  if (newSchools.length === 0) {
    return { material: false }
  }

  // Build human-readable summary
  const hostSchools = newSchools.filter(s => s.role === 'host')
  const attendeeSchools = newSchools.filter(s => s.role === 'attendee')
  const parts: string[] = []
  if (hostSchools.length > 0) {
    parts.push(`${hostSchools.map(s => s.shortName).join(' and ')} added as host`)
  }
  if (attendeeSchools.length > 0) {
    const names = attendeeSchools.map(s => s.shortName)
    const label = names.length === 1 ? 'attending school' : 'attending schools'
    parts.push(`${names.join(', ')} added as ${label}`)
  }
  const updateSummary = parts.join('; ')

  return {
    material: true,
    reason: updateSummary,
    updateSummary,
    newSchools,
  }
}

// ─── Live trigger ────────────────────────────────────────────────────────────

const CAMP_PATTERN = /\b(camp|clinic|showcase|ID camp|prospect day|elite training)\b/i

/**
 * Fire-and-forget hook for inbound contact_log rows.
 * Extracts camp data and inserts camp_proposals for review.
 * Never throws — all errors are logged and swallowed.
 */
export async function extractAndProposeCamps(
  rowId: string,
  admin: SupabaseClient
): Promise<void> {
  try {
    // The family comes from the CLIENT'S OWN SCOPE, not a parameter. A parameter
    // could disagree with the client that reads and writes the rows; a derived
    // value cannot. Fail closed when there is no scope: a proposal with no family
    // is a proposal nobody owns, and under a shared proposals table that is
    // exactly how one family's decision leaks onto everyone.
    const familyId = scopeOf(admin)
    if (!familyId) {
      console.error('[camp-extract] refusing to propose: client has no family scope')
      return
    }

    // 1. Load the contact_log row with school join
    const { data: row, error } = await admin
      .from('contact_log')
      .select('id, school_id, direction, coach_name, channel, summary, raw_source, sent_at, date, parse_status, schools!inner(id, name, short_name, category)')
      .eq('id', rowId)
      .single()

    if (error || !row) {
      console.error('[camp-extract] row not found:', rowId, error?.message)
      return
    }

    // 2. Filter — return early if not eligible
    if (row.direction !== 'Inbound') return
    if (!row.school_id) return
    if (!row.parse_status || !['full', 'partial'].includes(row.parse_status)) return

    const school = (row as Record<string, unknown>).schools as { id: string; name: string; short_name: string | null; category: string }
    if (!['A', 'B', 'C'].includes(school.category)) return

    const text = row.raw_source || row.summary || ''
    if (!CAMP_PATTERN.test(text)) return

    // 3. Idempotency — skip if already proposed from this row
    const { data: existing } = await admin
      .from('camp_proposals')
      .select('id')
      .eq('source_ref', rowId)
      .limit(1)

    if (existing && existing.length > 0) return

    // 4. Load candidate attendee schools
    const { data: allSchools } = await admin
      .from('schools')
      .select('id, name, short_name, aliases')
      .in('category', ['A', 'B', 'C'])
      .neq('status', 'Inactive')

    const candidateSchools = (allSchools ?? [])
      .filter(s => s.id !== school.id)
      .map(s => ({ id: s.id, name: s.short_name || s.name, aliases: s.aliases ?? [] }))

    const today = new Date().toISOString().split('T')[0]
    const dateLabel = row.date || row.sent_at?.split('T')[0] || 'unknown'
    const schoolName = school.short_name || school.name

    // 5. Extract camps
    const extracted = await extractCampsFromText({
      text,
      sourceContext: `Email from ${row.coach_name ?? 'unknown coach'} via ${row.channel} on ${dateLabel}`,
      hostSchoolName: schoolName,
      hostSchoolId: school.id,
      candidateAttendeeSchools: candidateSchools,
      currentDate: today,
    })

    if (extracted.length === 0) return

    // 6. Insert proposals with dedup + materiality gate
    for (const camp of extracted) {
      const dedup = await shouldSkipProposal(admin, {
        familyId,
        hostSchoolId: school.id,
        startDate: camp.start_date,
        endDate: camp.end_date,
      })

      if (dedup.skip) continue

      // Materiality gate: for matched existing camps, only surface if
      // a new tracked school is associated (host or attendee)
      let updateSummary: string | null = null
      if (dedup.matchedCampId) {
        const materiality = await classifyCampUpdate(
          admin, dedup.matchedCampId,
          { attendee_school_ids: camp.attendee_school_ids },
          school.id,
        )
        if (!materiality.material) continue
        updateSummary = materiality.updateSummary ?? null
      }

      await admin.from('camp_proposals').insert({
        source: 'email_extract',
        source_ref: rowId,
        host_school_id: school.id,
        proposed_data: {
          name: camp.name,
          start_date: camp.start_date,
          end_date: camp.end_date,
          location: camp.location,
          registration_url: camp.registration_url,
          registration_deadline: camp.registration_deadline,
          cost: camp.cost,
          notes: camp.notes,
          attendee_school_ids: camp.attendee_school_ids,
        },
        matched_camp_id: dedup.matchedCampId ?? null,
        update_summary: updateSummary,
        confidence: camp.confidence,
        notes: camp.reasoning,
      })
    }

    console.log(`[camp-extract] ${schoolName}: ${extracted.length} camp(s) from row ${rowId}`)
  } catch (err) {
    console.error('[camp-extract] failed for row', rowId, err)
  }
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

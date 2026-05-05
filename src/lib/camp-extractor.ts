/**
 * camp-extractor.ts
 *
 * Extracts camp data from email body text or web page content using Claude Haiku.
 * Also provides dedup logic to avoid re-proposing rejected camps.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

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

/**
 * Check whether a proposed camp should be skipped (previously rejected)
 * or matched to an existing camp.
 */
export async function shouldSkipProposal(
  supabase: SupabaseClient,
  input: {
    hostSchoolId: string
    startDate: string
    endDate: string | null
  }
): Promise<{ skip: boolean; reason?: string; matchedCampId?: string }> {
  const { hostSchoolId, startDate, endDate } = input
  const effectiveEnd = endDate ?? startDate

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

  // Check 2: most recent terminal camp_proposal with matching date signature
  // Use contains on jsonb to match start_date (exact — ±2 day tolerance handled
  // by checking multiple dates if needed in future, but exact match is sufficient
  // for dedup of the same extractor output)
  const { data: priorProposals } = await supabase
    .from('camp_proposals')
    .select('status')
    .eq('host_school_id', hostSchoolId)
    .in('status', ['applied', 'rejected'])
    .contains('proposed_data', { start_date: startDate })
    .order('created_at', { ascending: false })
    .limit(1)

  if (priorProposals && priorProposals.length > 0 && priorProposals[0].status === 'rejected') {
    return { skip: true, reason: 'previously rejected' }
  }

  // Check 3: pending proposal with matching signature already in queue
  const { data: pendingProposals } = await supabase
    .from('camp_proposals')
    .select('id')
    .eq('host_school_id', hostSchoolId)
    .eq('status', 'pending')
    .contains('proposed_data', { start_date: startDate })
    .limit(1)

  if (pendingProposals && pendingProposals.length > 0) {
    return { skip: true, reason: 'pending proposal already exists' }
  }

  return { skip: false }
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

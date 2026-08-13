/**
 * camp-prep.ts
 *
 * Types + the extraction prompt for camp prep docs (Phases 3-4). The user pastes
 * the camp email verbatim plus travel prose; Sonnet EXTRACTS a structured schedule
 * + hard constraints + travel + a timezone delta. No judgment here — extraction
 * only. The user confirms/edits the extraction before it is persisted.
 */

export const CAMP_EXTRACTION_MODEL = 'claude-sonnet-4-6'

// ─── Inputs (persisted verbatim in prep_docs.inputs) ─────────────────────────

export interface CampPrepInputs {
  camp_email_raw: string
  travel_prose: string
  extra_notes: string
}

// ─── Extraction (becomes prep_docs.extracted_schedule after the user confirms) ─

export interface CampScheduleBlock {
  time: string | null       // verbatim as given; null if the email gives none
  activity: string
  location: string | null
}

export interface CampDay {
  label: string             // e.g. "Saturday, August 15"
  check_in_time: string | null
  check_in_location: string | null
  blocks: CampScheduleBlock[]
}

export interface CampConstraint {
  text: string              // one hard constraint, as the email states it
}

export interface CampTravelSegment {
  mode: string              // "flight" | "drive" | other, as given
  detail: string            // e.g. "DEN -> BTV, United 1234"
  time: string | null       // departure/arrival as given
}

export interface CampCommitment {
  text: string              // a competing commitment
  time: string | null
  date: string | null       // YYYY-MM-DD if the prose dates it (explicit, or a relative
                            // day-word resolved against the reference date); null if undated.
                            // An undated commitment MUST NOT be placed on a specific plan day.
}

export interface CampExtraction {
  venue: string | null
  surface: string | null           // e.g. "turf", "natural grass"
  days: CampDay[]
  hard_constraints: CampConstraint[]
  travel: {
    segments: CampTravelSegment[]
    lodging: string | null
    lodging_breakfast_window: string | null
    meal_windows: string[]
    competing_commitments: CampCommitment[]
    who_traveling: string | null
  }
  timezone: {
    home_tz: string                // echoed from player_profile.home_timezone
    venue_tz: string | null        // inferred from the venue location
    delta: string | null           // human-readable, e.g. "Venue is 2 hours ahead of home (Mountain -> Eastern)"
  }
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

export function buildCampExtractionSystemPrompt(): string {
  return `You are an extraction engine for a college-soccer camp prep tool. You are given a camp email (pasted verbatim) and a family's travel/logistics notes. Your ONLY job is to EXTRACT what is present into structured JSON. You do NOT plan, advise, judge, or add anything the sources don't say.

ABSOLUTE RULES
- Extract ONLY what the text actually states. If a time, location, or fact is not given, it is null — NEVER guess or infer a time that wasn't written.
- Do not normalize away detail. Keep times, room names, and instructions as written.
- Do not editorialize. No advice, no "you should" — that is a downstream step.

WHAT TO EXTRACT

From the CAMP EMAIL:
- Day-by-day schedule blocks: for each day, each block's time, activity, and location (as given).
- The venue, the playing SURFACE if stated (turf / natural grass / etc.), and per-day CHECK-IN time and location.
- HARD CONSTRAINTS: operational facts the family must plan around that are NOT part of the on-field session schedule. This is the highest-value, most-missed output. The CLASS of thing (illustrative, NOT a checklist to match against): administrative requirements (e.g. a form that must be turned in on paper and cannot be submitted electronically), whether an athletic trainer / medical is on site, required equipment, any UNSTRUCTURED or UNSUPERVISED time (breaks, gaps), timing CAVEATS the email itself flags (e.g. "the schedule often runs late"), OPTIONAL sessions (parent/family Q&A, tours), and logistics that SHIFT when a player's session starts (e.g. staggered check-in or tours). Extract whatever THIS email states in that spirit — do not invent items that aren't there, and do not skip a real one just because it isn't in the examples.

From the TRAVEL / LOGISTICS notes:
- Travel segments (flights, drives) with their times as given.
- Lodging, and the lodging's breakfast availability window if stated.
- Meal availability windows.
- Competing commitments (other events that weekend) with their times AND their date.
  * DATE each commitment when — and ONLY when — the prose actually dates it: an explicit date, OR a relative day-word ("yesterday", "today", "tomorrow", "this morning") resolved against the REFERENCE DATE provided below (yesterday = reference minus 1 day, tomorrow = reference plus 1 day). Output the resolved calendar date as YYYY-MM-DD.
  * If the prose gives NO date for a commitment, set date to null. Do NOT infer a date from a tee time, from ordering, or from proximity to other events. An undated commitment stays undated.
- Who is travelling.

TIME-ZONE DELTA:
- The family's home timezone is provided (IANA). Infer the VENUE's timezone from the venue location, then state the delta in plain language and direction (e.g. "Venue is 2 hours ahead of home — Mountain to Eastern"). If you cannot determine the venue timezone confidently, set venue_tz and delta to null. Do NOT hardcode or assume a home timezone — use the one provided.

Return ONLY this JSON, no markdown fences, no commentary:
{
  "venue": "... or null",
  "surface": "... or null",
  "days": [
    { "label": "...", "check_in_time": "... or null", "check_in_location": "... or null",
      "blocks": [ { "time": "... or null", "activity": "...", "location": "... or null" } ] }
  ],
  "hard_constraints": [ { "text": "..." } ],
  "travel": {
    "segments": [ { "mode": "flight|drive|...", "detail": "...", "time": "... or null" } ],
    "lodging": "... or null",
    "lodging_breakfast_window": "... or null",
    "meal_windows": ["..."],
    "competing_commitments": [ { "text": "...", "time": "... or null", "date": "YYYY-MM-DD or null" } ],
    "who_traveling": "... or null"
  },
  "timezone": { "home_tz": "<echo the provided home tz>", "venue_tz": "... or null", "delta": "... or null" }
}`
}

export function buildCampExtractionUserPrompt(params: {
  campName: string
  campDates: string
  campLocation: string | null
  hostSchoolLocation: string | null
  homeTimezone: string
  referenceDate: string    // YYYY-MM-DD in the home tz — anchor for resolving "today"/"yesterday"/"tomorrow"
  inputs: CampPrepInputs
}): string {
  const { campName, campDates, campLocation, hostSchoolLocation, homeTimezone, referenceDate, inputs } = params
  const lines: string[] = []
  lines.push('=== CAMP (from our records — context only; the email is authoritative) ===')
  lines.push(`Name: ${campName}`)
  lines.push(`Dates: ${campDates}`)
  if (campLocation) lines.push(`Location on file: ${campLocation}`)
  if (hostSchoolLocation) lines.push(`Host school location: ${hostSchoolLocation}`)
  lines.push('')
  lines.push(`=== HOME TIMEZONE (use this exact value for the delta) ===`)
  lines.push(homeTimezone)
  lines.push('')
  lines.push(`=== REFERENCE DATE (today, home tz — resolve "today"/"yesterday"/"tomorrow" in the prose against THIS date; do not date anything the prose leaves undated) ===`)
  lines.push(referenceDate)
  lines.push('')
  lines.push('=== CAMP EMAIL (verbatim — extract the schedule, check-in, surface, and hard constraints from here) ===')
  lines.push(inputs.camp_email_raw || '(none provided)')
  lines.push('')
  lines.push('=== TRAVEL / TIMING / LOGISTICS NOTES (prose) ===')
  lines.push(inputs.travel_prose || '(none provided)')
  if (inputs.extra_notes.trim()) {
    lines.push('')
    lines.push('=== ANYTHING ELSE TO ACCOUNT FOR ===')
    lines.push(inputs.extra_notes)
  }
  return lines.join('\n')
}

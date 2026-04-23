/**
 * coach-scraper.ts
 *
 * Core scraping + diffing library for coach roster sync.
 * Imported by both:
 *   - scripts/scrape-coach-rosters.ts  (CLI with --dry-run, --initial-seed)
 *   - src/app/api/cron/coach-roster-sync/route.ts  (forward-looking cron)
 *
 * Responsibilities:
 *   1. Fetch a school's coach_page_url
 *   2. Strip HTML, send to Claude Haiku for structured extraction
 *   3. Validate + normalize the LLM response
 *   4. Diff extracted roster against coaches table
 *   5. Optionally apply changes to coaches + coach_changes tables
 *
 * Not responsible for: rate limiting, CLI flags, env loading, iteration
 * over multiple schools — those belong in the caller.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Supabase = ReturnType<typeof createServiceClient<any>>

export type CoachRole =
  | 'Head Coach'
  | 'Interim Head Coach'
  | 'Associate Head Coach'
  | 'Assistant Coach'
  | 'Interim Assistant Coach'
  | 'Other'

export const VALID_ROLES: CoachRole[] = [
  'Head Coach', 'Interim Head Coach', 'Associate Head Coach',
  'Assistant Coach', 'Interim Assistant Coach', 'Other',
]

export type ChangeType =
  | 'coach_added'
  | 'coach_departed'
  | 'email_added'
  | 'email_changed'
  | 'role_changed'
  | 'name_changed'

/** A coach as extracted by Haiku from page HTML. */
export interface ScrapedCoach {
  name:          string
  role:          CoachRole
  email:         string | null
  phone:         string | null
  endowedTitle:  string | null  // e.g. "Bobby Clark" from "Bobby Clark Head Coach of Men's Soccer"
}

/** A coach row from the coaches DB table. */
export interface DbCoach {
  id:         string
  school_id:  string
  name:       string
  role:       string
  email:      string | null
  is_primary: boolean
  sort_order: number
}

/**
 * One detected difference between the scraped roster and the DB.
 * The `wouldStatus` field indicates what coach_changes.status would be written:
 *   'seed'   → --initial-seed run: bulk-apply without review
 *   'auto'   → email_added on normal run: safe to auto-apply
 *   'manual' → everything else: requires human review
 */
export interface DetectedChange {
  changeType:  ChangeType
  coachId:     string | null  // null for coach_added before the row is created
  coachName:   string
  details:     Record<string, unknown>
  wouldApply:  boolean        // true = this change is written to coaches table
  wouldStatus: 'auto' | 'manual' | 'seed'
}

export interface ScrapeOptions {
  dryRun:      boolean   // fetch + diff, no DB writes
  initialSeed: boolean   // bulk-apply all changes as 'seed'
}

export interface ScrapeResult {
  schoolId:       string
  schoolName:     string
  url:            string
  scrapedCoaches: ScrapedCoach[]   // raw Haiku output before diffing
  scrapedCount:   number
  dbCount:        number
  dbCoaches:      DbCoach[]        // current DB roster before diffing
  changes:        DetectedChange[]
  appliedCount:   number           // changes actually written to DB (0 if dryRun)
  error:          string | null
}

// ── Haiku client (module-level singleton) ─────────────────────────────────────

let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  return _anthropic
}

// ── Extraction prompt ─────────────────────────────────────────────────────────
//
// Sent to claude-haiku-4-5-20251001 with the stripped page text.
//
// Design notes:
//   - Asks for exactly the 6 valid role strings. If Haiku returns something
//     else (e.g. "Goalkeeper Coach"), normalizeRole() maps it to 'Other'.
//   - Anti-spam obfuscation is explicitly called out — athletics sites commonly
//     use "[at]" or "(dot)" formatting to prevent bots harvesting emails.
//   - Skip list is precise: avoids pulling in SIDs, volunteers, grad assistants.
//   - Response is strict JSON — no prose, no markdown. We validate the shape.

const EXTRACTION_SYSTEM =
  'You are a data extraction assistant. You extract structured coach roster data ' +
  'from college athletics webpages. Respond only with valid JSON — no prose, no markdown.'

function buildExtractionPrompt(pageText: string): string {
  return `Extract all men's soccer coaches listed on this athletics webpage.

For each coach return:
  name  — full name in "First Last" format. Strip titles ("Dr.", "Coach") from the stored value.
  role  — EXACTLY one of these strings (choose the closest match):
            "Head Coach"
            "Interim Head Coach"
            "Associate Head Coach"
            "Assistant Coach"
            "Interim Assistant Coach"
            "Other"
  email — email address, or null if not shown.
          Resolve anti-spam obfuscation: "name [at] school [dot] edu" → "name@school.edu"
  phone — phone number string, or null if not shown.
  endowed_title — (optional) if the role includes an endowed chair or benefactor prefix,
          extract only that prefix here. Otherwise omit the field entirely.

IMPORTANT — endowed chair titles: Some coaches hold endowed positions where the role
field on the page reads like "Bobby Clark Head Coach of Men's Soccer" or
"The John Smith Assistant Coach". The endowed name (e.g. "Bobby Clark", "John Smith")
is NOT a person on the roster — it is a named gift designation, like an endowed
professorship. The actual coach's name is always in a separate name/heading field.
  - Extract role as the BASE coaching title only, stripping the endowed prefix.
  - Capture the endowed prefix in the endowed_title field.
  - Example: name="Connor Klekota", title on page="Bobby Clark Head Coach of Men's Soccer"
             → role="Head Coach", endowed_title="Bobby Clark"

SKIP these people (do not include them):
  - Athletic directors, SIDs (sports information directors), team managers
  - Administrators without a coaching title
  - Volunteers listed without the word "Coach" in their title
  - Graduate assistants listed without the word "Coach"
  - Camp counselors

Return ONLY this JSON structure (no markdown fences, no explanation):
{
  "coaches": [
    { "name": "First Last", "role": "Head Coach", "email": "email@school.edu", "phone": null, "endowed_title": "Bobby Clark" },
    { "name": "Second Coach", "role": "Assistant Coach", "email": null, "phone": null }
  ]
}

If no coaches are found, return: { "coaches": [] }

Page content:
---
${pageText.slice(0, 10_000)}
---`
}

// ── HTML → text for extraction ────────────────────────────────────────────────
//
// Less aggressive than the discovery validator — we keep more structure
// so that name/role/email groupings survive the strip. We do remove
// <script>, <style>, and navigation chrome to reduce noise.

function stripHtmlForExtraction(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6]|section|article|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Role normalization ────────────────────────────────────────────────────────
//
// Haiku is instructed to use exact role strings, but may deviate slightly
// (e.g. "Co-Head Coach", "Goalkeeper Coach", "First Assistant Coach").
// We map the most common variants; anything else → 'Other'.

function normalizeRole(raw: string): CoachRole {
  if ((VALID_ROLES as string[]).includes(raw)) return raw as CoachRole

  const lower = raw.toLowerCase().trim()
  if (lower.includes('interim') && lower.includes('head'))      return 'Interim Head Coach'
  if (lower.includes('interim') && lower.includes('assistant')) return 'Interim Assistant Coach'
  if (lower.includes('associate') || lower.includes('co-head')) return 'Associate Head Coach'
  if (lower.includes('head'))                                    return 'Head Coach'
  if (lower.includes('assistant') || lower.includes('first'))   return 'Assistant Coach'
  return 'Other'
}

// ── Name normalization for diff matching ──────────────────────────────────────
//
// Answers the user's question about "Dr. Brown" vs "Brown" vs "Michael Brown":
//
//   "Dr. Michael Brown"  →  normalizes to "michael brown"
//   "Coach Brown"        →  normalizes to "brown"
//   "Michael Brown"      →  normalizes to "michael brown"
//   "Brown"              →  normalizes to "brown"
//
// Matching strategy (applied in order, first hit wins):
//   Level 1 — Exact normalized full name: "michael brown" === "michael brown"
//   Level 2 — Last-name only: last word of normalized name equals last word of other.
//             Only used if exactly one DB coach at the school has that last name,
//             preventing false matches at schools with two coaches named "Smith".

const TITLE_PREFIXES = /^(dr\.?|coach|mr\.?|ms\.?|mrs\.?|prof\.?)\s+/i

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(TITLE_PREFIXES, '')
    .trim()
}

function lastName(normalizedName: string): string {
  return normalizedName.split(' ').at(-1) ?? normalizedName
}

function matchScrapedToDb(
  scraped: ScrapedCoach,
  dbCoaches: DbCoach[],
): DbCoach | null {
  const sNorm = normalizeName(scraped.name)
  const sLast = lastName(sNorm)

  // Level 1: exact normalized name
  const exact = dbCoaches.find(c => normalizeName(c.name) === sNorm)
  if (exact) return exact

  // Level 2: last-name only (only when unambiguous)
  const lastMatches = dbCoaches.filter(c => lastName(normalizeName(c.name)) === sLast)
  if (lastMatches.length === 1) return lastMatches[0]

  return null
}

// ── Haiku extraction ──────────────────────────────────────────────────────────
//
// JSON error handling: fail-fast, no retry.
//
// Rationale: if Haiku returns malformed JSON on one call, a retry on the same
// input is unlikely to succeed differently. The error is logged to
// coach_page_last_error; the next scheduled cron run will retry naturally.
// This keeps the scraper predictable and avoids burning extra API calls on
// pages that are genuinely unparseable (e.g. login walls, JS-rendered pages
// that our fetch can't execute).
//
// Validation steps:
//   1. Parse JSON — catch SyntaxError
//   2. Confirm `coaches` is an array
//   3. Filter out entries missing `name` or `role`
//   4. Normalize role values through normalizeRole()

async function extractCoachesFromHtml(html: string): Promise<ScrapedCoach[] | null> {
  const pageText = stripHtmlForExtraction(html)

  const msg = await getAnthropic().messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system:     EXTRACTION_SYSTEM,
    messages:   [{ role: 'user', content: buildExtractionPrompt(pageText) }],
  })

  const raw  = (msg.content[0] as { text: string }).text.trim()
  const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null  // malformed JSON — caller logs the error
  }

  if (
    typeof parsed !== 'object' || parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>).coaches)
  ) {
    return null  // unexpected shape
  }

  // Validate and normalize each entry
  const coaches: ScrapedCoach[] = []
  for (const raw of (parsed as { coaches: unknown[] }).coaches) {
    if (typeof raw !== 'object' || raw === null) continue
    const entry = raw as Record<string, unknown>
    if (typeof entry.name !== 'string' || !entry.name.trim()) continue
    if (typeof entry.role !== 'string' || !entry.role.trim()) continue

    coaches.push({
      name:         entry.name.trim(),
      role:         normalizeRole(entry.role as string),
      email:        typeof entry.email === 'string' ? entry.email.trim().toLowerCase() || null : null,
      phone:        typeof entry.phone === 'string' ? entry.phone.trim() || null : null,
      endowedTitle: typeof entry.endowed_title === 'string' ? entry.endowed_title.trim() || null : null,
    })
  }

  // Suppress shared team emails: if the same email appears on 2+ coaches,
  // it's a generic department mailbox (e.g. cmumsoccer@cmu.edu), not an
  // individual address. Overwriting a direct coach email with a shared inbox
  // is worse than leaving it null. Clear all instances and log a warning.
  const emailCounts = new Map<string, number>()
  for (const c of coaches) {
    if (c.email) emailCounts.set(c.email, (emailCounts.get(c.email) ?? 0) + 1)
  }
  for (const [email, count] of Array.from(emailCounts)) {
    if (count >= 2) {
      console.warn(`  [extract] Shared team email "${email}" detected on ${count} coaches — suppressed from individual records`)
      for (const c of coaches) {
        if (c.email === email) c.email = null
      }
    }
  }

  return coaches
}

// ── Diff algorithm ────────────────────────────────────────────────────────────
//
// Compares scraped roster against current DB coaches for a school.
// Returns a list of DetectedChange; does NOT write to DB (that's applyChanges).
//
// Change types and when they apply:
//
//   coach_added    — scraped coach has no match in DB
//   coach_departed — DB coach has no match in scraped roster
//   email_added    — matched coach: DB email is null, scraped has email
//   email_changed  — matched coach: both have email, they differ
//   role_changed   — matched coach: roles differ (after normalization)
//
// Notes:
//   - coach_departed is ALWAYS 'manual' — we never auto-delete
//   - email_changed is ALWAYS 'manual' — could be a typo fix or alias change
//   - role_changed is ALWAYS 'manual' — requires human judgment
//   - email_added is 'auto' on normal runs, 'seed' on --initial-seed
//   - coach_added is 'manual' on normal runs, 'seed' on --initial-seed

function diffRosters(
  scraped:     ScrapedCoach[],
  dbCoaches:   DbCoach[],
  initialSeed: boolean,
): DetectedChange[] {
  const changes: DetectedChange[] = []

  // Track which DB coaches matched something scraped
  const matchedDbIds = new Set<string>()

  for (const s of scraped) {
    const match = matchScrapedToDb(s, dbCoaches)

    if (!match) {
      // Coach not in DB — new addition
      const details: Record<string, unknown> = { name: s.name, role: s.role, email: s.email, phone: s.phone }
      if (s.endowedTitle) details.endowed_title = s.endowedTitle
      changes.push({
        changeType:  'coach_added',
        coachId:     null,
        coachName:   s.name,
        details,
        wouldApply:  initialSeed,   // seed: insert; normal: just log
        wouldStatus: initialSeed ? 'seed' : 'manual',
      })
      continue
    }

    matchedDbIds.add(match.id)

    // Check email
    if (!match.email && s.email) {
      changes.push({
        changeType:  'email_added',
        coachId:     match.id,
        coachName:   match.name,
        details:     { name: match.name, email_new: s.email },
        wouldApply:  true,  // always apply: email_added is safe to auto-update
        wouldStatus: initialSeed ? 'seed' : 'auto',
      })
    } else if (match.email && s.email && match.email.toLowerCase() !== s.email) {
      changes.push({
        changeType:  'email_changed',
        coachId:     match.id,
        coachName:   match.name,
        details:     { name: match.name, email_before: match.email, email_after: s.email },
        wouldApply:  false,   // never auto-apply email changes
        wouldStatus: 'manual',
      })
    }

    // Check role
    const normalizedDbRole = normalizeRole(match.role)
    if (normalizedDbRole !== s.role) {
      changes.push({
        changeType:  'role_changed',
        coachId:     match.id,
        coachName:   match.name,
        details:     { name: match.name, role_before: match.role, role_after: s.role },
        wouldApply:  false,
        wouldStatus: 'manual',
      })
    }
  }

  // DB coaches with no scraped match → departed
  for (const db of dbCoaches) {
    if (!matchedDbIds.has(db.id)) {
      changes.push({
        changeType:  'coach_departed',
        coachId:     db.id,
        coachName:   db.name,
        details:     { name: db.name, role: db.role, email: db.email },
        wouldApply:  false,   // never auto-delete
        wouldStatus: 'manual',
      })
    }
  }

  return changes
}

// ── Apply changes ─────────────────────────────────────────────────────────────
//
// Writes DetectedChanges to:
//   - coaches table: for coach_added (seed) and email_added (auto + seed)
//   - coach_changes table: for ALL detected changes (audit trail)
//
// Returns count of rows written to coaches table.

async function applyChanges(
  admin:    Supabase,
  schoolId: string,
  changes:  DetectedChange[],
): Promise<number> {
  let appliedToCoaches = 0

  for (const change of changes) {
    // ── Write to coaches table for applicable changes ─────────────────────────

    if (change.wouldApply) {
      if (change.changeType === 'coach_added') {
        const d = change.details as { name: string; role: string; email: string | null }

        // Determine sort_order: max existing + 1
        const { data: existing } = await admin
          .from('coaches')
          .select('sort_order')
          .eq('school_id', schoolId)
          .order('sort_order', { ascending: false })
          .limit(1)
        const nextSort = ((existing?.[0]?.sort_order as number | undefined) ?? 0) + 1

        // is_primary: set true for Head Coach only when no primary coach exists yet
        const { data: primaryCheck } = await admin
          .from('coaches')
          .select('id')
          .eq('school_id', schoolId)
          .eq('is_primary', true)
          .limit(1)
        const isPrimary = d.role === 'Head Coach' && (primaryCheck?.length ?? 0) === 0

        const { data: inserted, error: insertErr } = await admin
          .from('coaches')
          .insert({
            school_id:    schoolId,
            name:         d.name,
            role:         d.role,
            email:        d.email,
            is_primary:   isPrimary,
            needs_review: false,
            sort_order:   nextSort,
          })
          .select('id')
          .single()

        if (insertErr) {
          console.error(`  [apply] Failed to insert coach "${d.name}": ${insertErr.message}`)
        } else {
          change.coachId = inserted.id  // backfill for coach_changes log
          appliedToCoaches++
        }
      }

      if (change.changeType === 'email_added') {
        const d = change.details as { email_new: string }
        const { error: updateErr } = await admin
          .from('coaches')
          .update({ email: d.email_new })
          .eq('id', change.coachId!)

        if (updateErr) {
          console.error(`  [apply] Failed to update email for "${change.coachName}": ${updateErr.message}`)
        } else {
          appliedToCoaches++
        }
      }
    }

    // ── Write to coach_changes audit table (always, for all detected changes) ──

    const { error: logErr } = await admin.from('coach_changes').insert({
      school_id:   schoolId,
      change_type: change.changeType,
      coach_id:    change.coachId,
      details:     change.details,
      status:      change.wouldStatus,
    })

    if (logErr) {
      console.error(`  [log] Failed to log change "${change.changeType}" for "${change.coachName}": ${logErr.message}`)
    }
  }

  return appliedToCoaches
}

// ── Main export ───────────────────────────────────────────────────────────────

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; FinnRecruitingCRM/1.0; roster data collection)',
  'Accept': 'text/html,application/xhtml+xml',
}

export async function scrapeSchool(
  admin:    Supabase,
  schoolId: string,
  options:  ScrapeOptions,
): Promise<ScrapeResult> {
  // Fetch school row
  const { data: school, error: schoolErr } = await admin
    .from('schools')
    .select('id, name, coach_page_url')
    .eq('id', schoolId)
    .single()

  if (schoolErr || !school?.coach_page_url) {
    return {
      schoolId, schoolName: school?.name ?? schoolId,
      url: school?.coach_page_url ?? '',
      scrapedCoaches: [], scrapedCount: 0,
      dbCoaches: [], dbCount: 0,
      changes: [], appliedCount: 0,
      error: 'No coach_page_url set for this school',
    }
  }

  const url = school.coach_page_url as string

  // Fetch existing coaches from DB
  const { data: dbRows } = await admin
    .from('coaches')
    .select('id, school_id, name, role, email, is_primary, sort_order')
    .eq('school_id', schoolId)
  const dbCoaches = (dbRows ?? []) as DbCoach[]

  // Fetch HTML
  let html: string
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal:  AbortSignal.timeout(30_000),
      redirect: 'follow',
    })
    if (!res.ok) {
      const errMsg = `HTTP ${res.status} fetching ${url}`
      if (!options.dryRun) {
        await admin.from('schools').update({ coach_page_last_error: errMsg }).eq('id', schoolId)
      }
      return { schoolId, schoolName: school.name, url, scrapedCoaches: [], scrapedCount: 0, dbCoaches, dbCount: dbCoaches.length, changes: [], appliedCount: 0, error: errMsg }
    }
    html = await res.text()
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    if (!options.dryRun) {
      await admin.from('schools').update({ coach_page_last_error: `Fetch failed: ${errMsg}` }).eq('id', schoolId)
    }
    return { schoolId, schoolName: school.name, url, scrapedCoaches: [], scrapedCount: 0, dbCoaches, dbCount: dbCoaches.length, changes: [], appliedCount: 0, error: `Fetch failed: ${errMsg}` }
  }

  // Extract coaches via Haiku
  const scraped = await extractCoachesFromHtml(html)
  if (!scraped) {
    const errMsg = 'Haiku returned malformed or unparseable JSON — skipping'
    if (!options.dryRun) {
      await admin.from('schools').update({ coach_page_last_error: errMsg }).eq('id', schoolId)
    }
    return { schoolId, schoolName: school.name, url, scrapedCoaches: [], scrapedCount: 0, dbCoaches, dbCount: dbCoaches.length, changes: [], appliedCount: 0, error: errMsg }
  }

  // Diff
  const changes = diffRosters(scraped, dbCoaches, options.initialSeed)

  // Apply (skip in dry-run)
  let appliedCount = 0
  if (!options.dryRun && changes.length > 0) {
    appliedCount = await applyChanges(admin, schoolId, changes)
  }

  // Stamp last_scraped_at and clear any previous error (skip in dry-run)
  if (!options.dryRun) {
    await admin.from('schools').update({
      coach_page_last_scraped_at: new Date().toISOString(),
      coach_page_last_error:      null,
    }).eq('id', schoolId)
  }

  return {
    schoolId,
    schoolName:     school.name,
    url,
    scrapedCoaches: scraped,
    scrapedCount:   scraped.length,
    dbCoaches,
    dbCount:        dbCoaches.length,
    changes,
    appliedCount,
    error:          null,
  }
}

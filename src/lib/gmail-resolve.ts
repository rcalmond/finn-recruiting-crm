/**
 * gmail-resolve.ts
 *
 * Shared school-and-coach resolution logic for Gmail ingestion.
 * Used by both /api/cron/gmail-sync and /api/gmail/backfill.
 *
 * Bugs fixed vs. the original inline helpers:
 *   Bug 1 — Subject matching uses \b word boundaries, not substring .includes()
 *            "MIT" no longer matches "committed", "submitted", etc.
 *   Bug 2 — Outbound coach_name comes from To: header display names,
 *            not From: (= Finn Almond).
 *   Bug 3 — Generic team mailboxes ("Hopkins Mens Soccer", "Men's Soccer")
 *            are detected by keyword and skipped as coach_name.
 *   Bug 4 — Domain match sets school only. Coach requires a separate name
 *            match; the first-matching coach from the domain is never assigned.
 *   Bug 5 — parse_status='parsed' requires HIGH confidence on both school
 *            and coach. Fuzzy / display-name fallbacks produce 'partial'.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { ParsedGmailEntry } from './gmail-parser'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Supabase = ReturnType<typeof createServiceClient<any>>

export type SchoolRow = {
  id:         string
  name:       string
  short_name: string | null
  aliases:    string[]
  domains:    string[]
}

export type CoachRow = {
  id:        string
  name:      string
  email:     string | null
  school_id: string
}

export interface ResolveResult {
  schoolId:    string | null
  coachId:     string | null
  coachName:   string | null
  matchNotes:  string[]
  parseStatus: 'parsed' | 'partial'
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function resolveSchoolAndCoach(
  admin:  Supabase,
  parsed: ParsedGmailEntry,
): Promise<ResolveResult> {
  const notes: string[] = []
  let schoolId:         string | null = null
  let coachId:          string | null = null
  let coachName:        string | null = null
  let schoolConfidence: 'high' | 'low' | null = null
  let coachConfidence:  'high' | 'low' | null = null

  const { data: allCoaches } = await admin
    .from('coaches')
    .select('id, name, email, school_id')
  const coaches = (allCoaches ?? []) as CoachRow[]

  const { data: allSchools } = await admin
    .from('schools')
    .select('id, name, short_name, aliases, domains')
  const schools = (allSchools ?? []) as SchoolRow[]

  // ── Strategy 1: Exact email match ─────────────────────────────────────────
  //
  // Inbound:  check senderEmail against coaches.email.
  // Outbound: check each recipientEmail against coaches.email.
  //
  // Exact email match is authoritative — HIGH confidence on both.
  // Bug 2 fix: outbound uses recipientEmails, not senderEmail (= Finn).

  const emailsToCheck = parsed.direction === 'Inbound'
    ? [parsed.senderEmail]
    : parsed.recipientEmails

  for (const email of emailsToCheck) {
    if (!email) continue
    const exactCoach = coaches.find(
      c => c.email?.toLowerCase().trim() === email.toLowerCase()
    )
    if (exactCoach) {
      return {
        schoolId:    exactCoach.school_id,
        coachId:     exactCoach.id,
        coachName:   exactCoach.name,
        matchNotes:  notes,
        parseStatus: 'parsed',
      }
    }
  }

  // ── Strategy 2: Domain match → school only ────────────────────────────────
  //
  // The authoritative school signal is always a domain, never a subject.
  //
  // Inbound: sender domain identifies the school.
  //   a) Sender domain matches a coach in DB → school HIGH confidence.
  //   b) Sender domain is institutional (non-null, non-generic) but not in DB
  //      → block subject fallback. Subject is unreliable for inbound Re:/Fwd:
  //      chains ("MIT" in a jhu.edu reply is the thread origin, not the school).
  //   c) senderDomain === null (generic sender like gmail.com) → fall through
  //      to subject match with LOW confidence.
  //
  // Outbound: recipient domain(s) identify the school.
  //   Same three outcomes, mirrored — recipient domain is authoritative.
  //   If multiple institutional recipient domains are found, first DB match wins;
  //   a note is added so multi-school sends can be spotted and triaged.

  let institutionalDomainBlocked = false

  if (parsed.direction === 'Inbound') {
    if (parsed.senderDomain) {
      const domainCoach = coaches.find(
        c => c.email?.split('@')[1]?.toLowerCase() === parsed.senderDomain
      )
      if (domainCoach) {
        // (1a) Known sender domain via coaches.email — HIGH confidence
        schoolId         = domainCoach.school_id
        schoolConfidence = 'high'
        notes.push(`School identified via sender domain "${parsed.senderDomain}"`)
      } else {
        // (1b) Sender domain not in coaches — check schools.domains[] — HIGH confidence
        const domainSchool = schools.find(
          s => (s.domains ?? []).includes(parsed.senderDomain!)
        )
        if (domainSchool) {
          schoolId         = domainSchool.id
          schoolConfidence = 'high'
          notes.push(`School matched via schools.domains[]: "${parsed.senderDomain}"`)
        } else {
          // (2) Unknown institutional sender domain — block subject fallback
          institutionalDomainBlocked = true
          notes.push(
            `Sender domain "${parsed.senderDomain}" not in DB — ` +
            'school unknown; add coaches with this domain to expand coverage'
          )
        }
      }
    }
    // (3) senderDomain === null: generic sender, falls through to Strategy 3
  } else {
    // Outbound: use recipient domains as the authoritative signal
    const recipDomains = Array.from(new Set(
      parsed.recipientEmails
        .map(e => extractEmailDomain(e))
        .filter((d): d is string => d !== null && !isGenericEmailDomain(d))
    ))

    let matchedDomain: string | null = null
    for (const domain of recipDomains) {
      const domainCoach = coaches.find(
        c => c.email?.split('@')[1]?.toLowerCase() === domain
      )
      if (domainCoach) {
        schoolId         = domainCoach.school_id
        schoolConfidence = 'high'
        matchedDomain    = domain
        notes.push(`School identified via recipient domain "${domain}"`)
        break
      }
    }

    // (1b) Recipient domain not in coaches — check schools.domains[] — HIGH confidence
    if (!schoolId && recipDomains.length > 0) {
      for (const domain of recipDomains) {
        const domainSchool = schools.find(s => (s.domains ?? []).includes(domain))
        if (domainSchool) {
          schoolId         = domainSchool.id
          schoolConfidence = 'high'
          matchedDomain    = domain
          notes.push(`School matched via schools.domains[]: "${domain}"`)
          break
        }
      }
    }

    if (recipDomains.length > 1) {
      // Flag multi-school sends for triage — rare but possible
      notes.push(
        `Multiple institutional recipient domains: ${recipDomains.join(', ')}` +
        (matchedDomain ? ` — matched on "${matchedDomain}"` : ' — none in DB')
      )
    }

    if (!schoolId && recipDomains.length > 0) {
      // (2) All institutional recipient domains unknown — block subject fallback
      institutionalDomainBlocked = true
      notes.push(
        `Recipient domain(s) ${recipDomains.join(', ')} not in DB — ` +
        'school unknown; add coaches with these domains to expand coverage'
      )
    }
    // recipDomains.length === 0: all recipients on generic domains, falls through to Strategy 3
  }

  // ── Strategy 3: Subject word-boundary match ────────────────────────────────
  //
  // Only runs when:
  //   - Domain match produced no school (either generic sender/recipient, or
  //     institutionalDomainBlocked was set above)
  //   - institutionalDomainBlocked === false
  //
  // Confidence is always LOW — subject text is unreliable compared to domain.
  // Only domain match ever yields HIGH school confidence.

  if (!schoolId && !institutionalDomainBlocked && parsed.subject) {
    const result = matchSchoolFromSubjectWordBoundary(parsed.subject, schools)
    if (result === null) {
      // no match
    } else if (result.ambiguous) {
      notes.push('Multiple schools matched in subject — manual review needed')
    } else {
      schoolId         = result.school.id
      schoolConfidence = 'low'
      notes.push(
        `School matched from subject (word boundary): "${result.school.name}" — low confidence`
      )
    }
  }

  if (!schoolId) {
    notes.push('Could not match school — manual review needed')
  }

  // ── Coach resolution ───────────────────────────────────────────────────────
  //
  // Inbound: match sender display name against coaches at the identified school.
  //   Bug 3 fix: skip generic team mailbox names ("Hopkins Mens Soccer", etc.).
  //   Bug 4 fix: name match now returns an exact flag so we know confidence.
  //
  // Outbound: coach is the recipient — strategy 1 (exact email) already handled.
  //   Bug 2 fix: fall back to To: header display names, not senderName (= Finn).

  if (parsed.direction === 'Inbound') {
    // Normalize "LastName, FirstName" → "FirstName LastName" before any matching
    // or storage. Gmail sometimes delivers display names in last-first format
    // (e.g. "DeCoster, Rockne") which would otherwise fail all name matching.
    const rawSenderName = parsed.senderName
    const senderName    = rawSenderName ? normalizeDisplayName(rawSenderName) : null
    const nameNote      = senderName !== rawSenderName && rawSenderName
      ? ` (normalized from "${rawSenderName}")`
      : ''

    if (isGenericSender(senderName)) {
      // Bug 3: team/dept mailbox — skip; no individual coach
      notes.push(
        `Generic team email "${senderName ?? ''}" — no individual coach identified`
      )
    } else if (schoolId && senderName) {
      const schoolCoaches = coaches.filter(c => c.school_id === schoolId)
      const nameResult    = matchCoachByName(senderName, schoolCoaches)
      if (nameResult) {
        coachId         = nameResult.coach.id
        coachName       = nameResult.coach.name
        coachConfidence = nameResult.exact ? 'high' : 'low'
        notes.push(
          `Coach matched by name: "${senderName}"${nameNote} → "${nameResult.coach.name}"` +
          (nameResult.exact ? '' : ' (fuzzy)')
        )
      } else {
        // New coach not in DB — record normalized display name for manual review
        coachName       = senderName
        coachConfidence = 'low'
        notes.push(`Coach "${senderName}"${nameNote} not in DB — display name recorded`)
      }
    } else if (!schoolId && senderName && !isGenericSender(senderName)) {
      // School unknown — can't narrow to school coaches; still record name
      coachName       = senderName
      coachConfidence = 'low'
      notes.push(`Coach "${senderName}"${nameNote} recorded; school unknown — manual review needed`)
    }
  } else {
    // Outbound: derive coach name from To: header display names
    const toNames    = extractNamesFromToHeader(parsed.recipientRaw)
    const nonGeneric = toNames.filter(n => !isGenericSender(n))
    if (nonGeneric.length > 0) {
      coachName       = nonGeneric.join('; ')
      coachConfidence = 'low'
      notes.push('Outbound: coach name from To: header — not matched to DB entry')
    }
  }

  // ── Bug 5: confidence gate for parse_status ────────────────────────────────
  //
  // 'parsed' = HIGH confidence on both school AND coach:
  //   HIGH school: exact email (strategy 1), domain (strategy 2), or
  //                word-boundary subject match (strategy 3).
  //   HIGH coach:  exact email (strategy 1), or exact name match.
  //
  // Fuzzy name match, To: header display names, or new-coach display-name
  // fallback → coachConfidence='low' → parseStatus='partial'.

  const parseStatus: 'parsed' | 'partial' =
    schoolConfidence === 'high' && coachConfidence === 'high'
      ? 'parsed'
      : 'partial'

  return { schoolId, coachId, coachName, matchNotes: notes, parseStatus }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Escape special regex chars (handles "St. Mary's", "UNC-Chapel Hill", etc.)
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Bug 1 fix: word-boundary school name matching.
// Adjustment 2: collect ALL matches — if more than one school matches the
// subject, return null with an ambiguity note rather than silently picking
// the first. Domain match (Strategy 2) runs before this and short-circuits,
// so ambiguity is only possible when domain matching already failed.
function matchSchoolFromSubjectWordBoundary(
  subject: string,
  schools: SchoolRow[],
): { school: SchoolRow; ambiguous: false } | { school: null; ambiguous: true } | null {
  const matched: SchoolRow[] = []

  for (const school of schools) {
    const candidates = [school.name, school.short_name, ...(school.aliases ?? [])]
      .filter(Boolean) as string[]
    for (const candidate of candidates) {
      const pattern = new RegExp('\\b' + escapeRegex(candidate) + '\\b', 'i')
      if (pattern.test(subject)) {
        matched.push(school)
        break  // don't double-count a school that matches via multiple aliases
      }
    }
  }

  if (matched.length === 0)  return null
  if (matched.length === 1)  return { school: matched[0], ambiguous: false }
  return { school: null, ambiguous: true }
}

// Coach name matching: exact → last-name only.
// Level 3 (contains) was dropped — it matched "Ben" in "Ben Simmons (Assistant)"
// against any DB coach named "Ben", producing the same silent false-positive
// class as Bug 1. Returning null here sets parseStatus='partial', which is
// the correct outcome for an unconfident match.
function matchCoachByName(
  parsedName: string,
  coaches:    CoachRow[],
): { coach: CoachRow; exact: boolean } | null {
  if (coaches.length === 0) return null
  const lower      = parsedName.toLowerCase().trim()
  const parsedLast = lower.split(/\s+/).at(-1) ?? ''

  // Level 1: exact full-name match (case-insensitive)
  const exact = coaches.find(c => c.name.toLowerCase() === lower)
  if (exact) return { coach: exact, exact: true }

  // Level 2: last-name match — handles display names like "Coach Streb" or
  // "Streb" matching DB record "Sean Streb". Requires last token length > 1
  // to avoid matching single-letter initials.
  if (parsedLast.length > 1) {
    const lastMatch = coaches.find(
      c => c.name.toLowerCase().split(/\s+/).at(-1) === parsedLast
    )
    if (lastMatch) return { coach: lastMatch, exact: false }
  }

  return null
}

// Common personal email domains — recipient/sender on these don't identify a school.
// Mirrors GENERIC_EMAIL_DOMAINS in gmail-parser.ts; kept local to avoid cross-imports.
const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'icloud.com', 'me.com', 'aol.com', 'protonmail.com',
])

function isGenericEmailDomain(domain: string): boolean {
  return GENERIC_EMAIL_DOMAINS.has(domain.toLowerCase())
}

function extractEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  return email.slice(at + 1).toLowerCase()
}

// Normalize "LastName, FirstName" → "FirstName LastName".
// Gmail sometimes delivers display names in last-first comma format.
// Only swaps when there is exactly one comma and both sides are non-empty.
function normalizeDisplayName(name: string): string {
  const m = name.match(/^([^,]+),\s*(.+)$/)
  if (m) return `${m[2].trim()} ${m[1].trim()}`
  return name
}

// Bug 3: detect generic team / department mailbox display names.
const GENERIC_SENDER_RE =
  /\b(soccer|football|basketball|lacrosse|swimming|track|tennis|volleyball|wrestling|baseball|softball|rowing|cross\s*country|athletics|athletic|recruiting|admissions|office|department|team|coaching\s*staff)\b/i

function isGenericSender(name: string | null): boolean {
  if (!name) return false
  return GENERIC_SENDER_RE.test(name)
}

// Bug 2: extract display names from a raw To: header for outbound emails.
// Handles "Name <email>, Name2 <email2>" with commas inside angle brackets.
function extractNamesFromToHeader(toHeader: string): string[] {
  if (!toHeader) return []
  const names: string[] = []
  let current  = ''
  let inAngles = 0

  for (const ch of toHeader) {
    if      (ch === '<') { inAngles++;                            current += ch }
    else if (ch === '>') { inAngles = Math.max(0, inAngles - 1); current += ch }
    else if (ch === ',' && inAngles === 0) {
      const n = extractDisplayName(current.trim())
      if (n) names.push(n)
      current = ''
    } else { current += ch }
  }
  const last = extractDisplayName(current.trim())
  if (last) names.push(last)
  return names
}

function extractDisplayName(addrStr: string): string | null {
  const m = addrStr.match(/^(.*?)<[^>]+>/)
  if (!m) return null
  const name = m[1].trim().replace(/^["']|["']$/g, '').trim()
  return name || null
}

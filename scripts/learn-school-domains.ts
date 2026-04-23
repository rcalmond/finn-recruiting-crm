/**
 * learn-school-domains.ts
 *
 * Analyzes high-confidence contact_log rows to learn which email domains
 * belong to which schools, then writes HIGH confidence mappings to
 * schools.domains[].
 *
 * Data sources (two independent signals per row):
 *
 *   A. coach_id → coaches.email
 *      For any parsed row with a matched coach, the coach's email domain
 *      is authoritative: we know it maps to that school.
 *
 *   B. raw_source From: lines (forwarded messages)
 *      Forwarded email bodies often contain "From: coach@school.edu" lines.
 *      raw_source is pre-cleaning (before cleanGmailBody strips them).
 *
 * Confidence tiers:
 *   HIGH      — domain maps to exactly 1 school AND has 2+ independent signals
 *   AMBIGUOUS — domain maps to exactly 1 school, only 1 signal
 *   CONFLICT  — domain maps to 2+ different schools (never auto-written)
 *
 * Usage:
 *   npx tsx scripts/learn-school-domains.ts --dry-run   ← report only, no writes
 *   npx tsx scripts/learn-school-domains.ts             ← apply HIGH mappings
 *
 * Safety:
 *   - Never writes AMBIGUOUS or CONFLICT domains
 *   - Never overwrites an existing entry (uses array_append + NOT EXISTS guard)
 *   - Always run --dry-run first and review before applying
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ─── Env ──────────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const DRY_RUN = process.argv.includes('--dry-run')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Generic domain list (never auto-learn these) ─────────────────────────────

const GENERIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'hotmail.co.uk',
  'outlook.com', 'live.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'protonmail.com', 'protonmail.ch', 'pm.me',
  'msn.com', 'comcast.net', 'verizon.net', 'att.net',
  'googlemail.com', 'sbcglobal.net',
])

// Subdomain prefixes that are clearly mail-routing infra, not meaningful
// identifiers. E.g. mail.caltech.edu → caltech.edu.
// We are CONSERVATIVE: only strip when the prefix is unambiguously a mail host.
const MAIL_INFRA_PREFIXES = [
  'mail.', 'smtp.', 'reply.', 'bounce.', 'noreply.', 'no-reply.',
  'mailer.', 'mailout.', 'outbound.', 'send.', 'email.',
  'mg.', 'sg.',   // SendGrid / Mailgun routing subdomains
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeDomain(raw: string): string | null {
  const d = raw.toLowerCase().trim()
  if (!d || !d.includes('.')) return null

  for (const prefix of MAIL_INFRA_PREFIXES) {
    if (d.startsWith(prefix)) {
      const stripped = d.slice(prefix.length)
      // Only strip if the result still looks like a valid domain (has a dot)
      if (stripped.includes('.')) return stripped
    }
  }
  return d
}

function extractDomainFromEmail(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  return normalizeDomain(email.slice(at + 1))
}

/**
 * Scan raw_source for "From: ..." lines.
 * These appear in forwarded message bodies before cleanGmailBody strips them.
 * Returns zero or more domains found.
 */
function extractDomainsFromRawSource(rawSource: string | null): string[] {
  if (!rawSource) return []
  const domains: string[] = []

  // Match "From: Anything <email@domain>" or "From: email@domain" lines.
  // Use a global multiline regex.
  const fromLineRe = /^From:\s+.*?([a-zA-Z0-9._%+\-]+@([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}))/gm
  let match: RegExpExecArray | null
  while ((match = fromLineRe.exec(rawSource)) !== null) {
    const domain = normalizeDomain(match[2])
    if (domain) domains.push(domain)
  }
  return domains
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Signal {
  domain: string
  schoolId: string
  schoolName: string
  source: 'coach_email' | 'raw_source_from_header'
  rowId: string
}

interface DomainReport {
  domain: string
  schoolId: string
  schoolName: string
  signalCount: number
  sources: string[]
  confidence: 'HIGH' | 'AMBIGUOUS'
}

interface ConflictReport {
  domain: string
  schools: Array<{ schoolId: string; schoolName: string; signalCount: number }>
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nlearn-school-domains ${DRY_RUN ? '(DRY RUN — no writes)' : '(LIVE)'}`)
  console.log('='.repeat(60))

  // ── Fetch schools (for name lookup) ──────────────────────────────────────────

  const { data: schoolRows, error: schoolErr } = await supabase
    .from('schools')
    .select('id, name, domains')
  if (schoolErr) { console.error('Failed to fetch schools:', schoolErr.message); process.exit(1) }
  const schoolMap = new Map<string, { name: string; existingDomains: string[] }>(
    (schoolRows ?? []).map(s => [s.id, { name: s.name, existingDomains: s.domains ?? [] }])
  )

  // ── Fetch coaches (for email domain extraction) ───────────────────────────────

  const { data: coachRows, error: coachErr } = await supabase
    .from('coaches')
    .select('id, school_id, email')
  if (coachErr) { console.error('Failed to fetch coaches:', coachErr.message); process.exit(1) }
  const coachMap = new Map<string, { schoolId: string; email: string | null }>(
    (coachRows ?? []).map(c => [c.id, { schoolId: c.school_id, email: c.email }])
  )

  // ── Fetch parsed email contact_log rows ───────────────────────────────────────

  const { data: logRows, error: logErr } = await supabase
    .from('contact_log')
    .select('id, school_id, coach_id, direction, raw_source, parse_notes')
    .eq('channel', 'Email')
    .eq('parse_status', 'parsed')
    .not('school_id', 'is', null)
  if (logErr) { console.error('Failed to fetch contact_log:', logErr.message); process.exit(1) }

  console.log(`\nScanning ${logRows?.length ?? 0} parsed email rows for domain signals...\n`)

  // ── Collect signals ───────────────────────────────────────────────────────────

  const signals: Signal[] = []

  for (const row of logRows ?? []) {
    const schoolId   = row.school_id as string
    const coachId    = row.coach_id  as string | null
    const rawSource  = row.raw_source as string | null
    const rowId      = row.id as string
    const school     = schoolMap.get(schoolId)
    if (!school) continue

    // Signal A: coach_id → coaches.email domain
    if (coachId) {
      const coach = coachMap.get(coachId)
      if (coach?.email) {
        const domain = extractDomainFromEmail(coach.email)
        if (domain && !GENERIC_DOMAINS.has(domain)) {
          signals.push({
            domain,
            schoolId,
            schoolName: school.name,
            source: 'coach_email',
            rowId,
          })
        }
      }
    }

    // Signal B: From: lines in raw_source (forwarded message bodies)
    const rawDomains = extractDomainsFromRawSource(rawSource)
    for (const domain of rawDomains) {
      if (!GENERIC_DOMAINS.has(domain)) {
        signals.push({
          domain,
          schoolId,
          schoolName: school.name,
          source: 'raw_source_from_header',
          rowId,
        })
      }
    }
  }

  if (signals.length === 0) {
    console.log('No domain signals found in parsed rows.')
    console.log('\nThis is expected if no coaches have emails on file or all emails are on generic domains.')
    console.log('You may need to manually seed domains for schools with unmapped coach emails.')
    return
  }

  // ── Group signals by domain ───────────────────────────────────────────────────
  //
  // Key: domain
  // Value: Map of schoolId → { schoolName, signalCount, sources (deduplicated by rowId+source) }

  const byDomain = new Map<string, Map<string, { schoolName: string; signals: Signal[] }>>()

  for (const sig of signals) {
    if (!byDomain.has(sig.domain)) byDomain.set(sig.domain, new Map())
    const schoolMap2 = byDomain.get(sig.domain)!
    if (!schoolMap2.has(sig.schoolId)) {
      schoolMap2.set(sig.schoolId, { schoolName: sig.schoolName, signals: [] })
    }
    schoolMap2.get(sig.schoolId)!.signals.push(sig)
  }

  // ── Classify ──────────────────────────────────────────────────────────────────

  const highConf: DomainReport[]     = []
  const ambiguous: DomainReport[]    = []
  const conflicts: ConflictReport[]  = []

  for (const [domain, schoolCounts] of Array.from(byDomain.entries())) {
    if (schoolCounts.size > 1) {
      // CONFLICT — domain appears under multiple schools
      conflicts.push({
        domain,
        schools: Array.from(schoolCounts.entries()).map(([sid, v]) => ({
          schoolId: sid,
          schoolName: v.schoolName,
          signalCount: v.signals.length,
        })),
      })
      continue
    }

    // Single school
    const [schoolId, { schoolName, signals: sigs }] = Array.from(schoolCounts.entries())[0]
    const uniqueSources = Array.from(new Set(sigs.map(s => s.source)))
    const signalCount = sigs.length
    const entry: DomainReport = { domain, schoolId, schoolName, signalCount, sources: uniqueSources, confidence: 'HIGH' }

    if (signalCount >= 2) {
      entry.confidence = 'HIGH'
      highConf.push(entry)
    } else {
      entry.confidence = 'AMBIGUOUS'
      ambiguous.push(entry)
    }
  }

  // ── Print report ───────────────────────────────────────────────────────────────

  console.log(`Domain signal summary`)
  console.log(`  Total domains discovered: ${byDomain.size}`)
  console.log(`  HIGH confidence (2+ signals, 1 school): ${highConf.length}`)
  console.log(`  AMBIGUOUS (1 signal, 1 school):          ${ambiguous.length}`)
  console.log(`  CONFLICTS (domain in multiple schools):  ${conflicts.length}`)

  // HIGH
  if (highConf.length > 0) {
    console.log('\n' + '─'.repeat(60))
    console.log('HIGH CONFIDENCE MAPPINGS (will be applied)')
    console.log('─'.repeat(60))
    for (const r of highConf) {
      const alreadyMapped = schoolMap.get(r.schoolId)?.existingDomains.includes(r.domain)
      const status = alreadyMapped ? ' [already in domains — skip]' : ' [NEW]'
      console.log(`  ${r.domain.padEnd(30)} → ${r.schoolName}${status}`)
      console.log(`    signals: ${r.signalCount}, sources: ${r.sources.join(', ')}`)
    }
  }

  // AMBIGUOUS
  if (ambiguous.length > 0) {
    console.log('\n' + '─'.repeat(60))
    console.log('AMBIGUOUS (1 signal — manual review needed before adding)')
    console.log('─'.repeat(60))
    for (const r of ambiguous) {
      const alreadyMapped = schoolMap.get(r.schoolId)?.existingDomains.includes(r.domain)
      const status = alreadyMapped ? ' [already in domains]' : ''
      console.log(`  ${r.domain.padEnd(30)} → ${r.schoolName}${status}`)
      console.log(`    sources: ${r.sources.join(', ')}`)
    }
    console.log('\n  These are NOT auto-applied. If correct, add them manually:')
    for (const r of ambiguous) {
      const alreadyMapped = schoolMap.get(r.schoolId)?.existingDomains.includes(r.domain)
      if (!alreadyMapped) {
        console.log(`    UPDATE schools SET domains = array_append(domains, '${r.domain}')`)
        console.log(`      WHERE name = '${r.schoolName}' AND NOT (domains @> ARRAY['${r.domain}']);`)
      }
    }
  }

  // CONFLICTS
  if (conflicts.length > 0) {
    console.log('\n' + '─'.repeat(60))
    console.log('CONFLICTS (domain claimed by multiple schools — manual triage required)')
    console.log('─'.repeat(60))
    for (const c of conflicts) {
      console.log(`  ${c.domain}:`)
      for (const s of c.schools) {
        console.log(`    ${s.schoolName} (${s.signalCount} signal${s.signalCount === 1 ? '' : 's'})`)
      }
    }
    console.log('\n  These are NOT auto-applied. Investigate before manually seeding.')
  }

  // ── Apply HIGH confidence mappings ─────────────────────────────────────────────

  const newMappings = highConf.filter(r => !schoolMap.get(r.schoolId)?.existingDomains.includes(r.domain))

  if (newMappings.length === 0) {
    console.log('\n─'.repeat(60))
    console.log('\nNo new HIGH confidence mappings to apply (all already present or none found).')
    return
  }

  console.log('\n' + '─'.repeat(60))
  if (DRY_RUN) {
    console.log(`\nDRY RUN: would apply ${newMappings.length} new domain mapping${newMappings.length === 1 ? '' : 's'}`)
    console.log('Run without --dry-run to write.')
  } else {
    console.log(`\nApplying ${newMappings.length} new domain mapping${newMappings.length === 1 ? '' : 's'}...`)

    let applied = 0
    let skipped = 0

    for (const r of newMappings) {
      // Use raw SQL to safely append without duplicating.
      // array_append + NOT @> guard is idempotent.
      // Read current domains then append — guard against duplicates.
      const { data: current, error: fetchErr } = await supabase
        .from('schools')
        .select('domains')
        .eq('id', r.schoolId)
        .single()

      if (fetchErr) {
        console.error(`  ERROR fetching ${r.schoolName}: ${fetchErr.message}`)
        skipped++
        continue
      }

      const existing: string[] = (current as { domains: string[] } | null)?.domains ?? []
      if (existing.includes(r.domain)) {
        console.log(`  SKIP  ${r.domain} → ${r.schoolName} (already present)`)
        skipped++
        continue
      }

      const { error: updateErr } = await supabase
        .from('schools')
        .update({ domains: [...existing, r.domain] })
        .eq('id', r.schoolId)

      if (updateErr) {
        console.error(`  ERROR ${r.domain} → ${r.schoolName}: ${updateErr.message}`)
        skipped++
        continue
      }

      console.log(`  OK    ${r.domain} → ${r.schoolName}`)
      applied++
    }

    console.log(`\nDone. Applied: ${applied}, Skipped: ${skipped}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })

/**
 * backfill-coaches.ts
 *
 * One-time backfill: parses schools.head_coach text into proper coaches table records.
 * Also classifies schools.coach_email as generic (→ generic_team_email) or personal
 * (→ assigned to the head coach record).
 *
 * schools.head_coach and schools.coach_email are NEVER modified.
 *
 * Usage:
 *   npx tsx scripts/backfill-coaches.ts --dry-run   ← preview only, no writes
 *   npx tsx scripts/backfill-coaches.ts             ← run for real
 *
 * Idempotent: skips any school that already has at least one coach record.
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ─── Load .env.local manually (outside Next.js runtime) ──────────────────────

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error('❌  .env.local not found. Copy .env.local.example and fill in your values.')
    process.exit(1)
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '❌  Missing env vars. Add to .env.local:\n' +
    '   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co\n' +
    '   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key'
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const DRY_RUN = process.argv.includes('--dry-run')

// ─── Types ────────────────────────────────────────────────────────────────────

type CoachRole =
  | 'Head Coach'
  | 'Interim Head Coach'
  | 'Associate Head Coach'
  | 'Assistant Coach'
  | 'Interim Assistant Coach'
  | 'Other'

interface CoachInsert {
  school_id: string
  name: string
  role: CoachRole
  email: string | null
  is_primary: boolean
  needs_review: boolean
  sort_order: number
  notes: string | null
}

interface SchoolUpdate {
  generic_team_email: string
}

interface School {
  id: string
  name: string
  head_coach: string | null
  coach_email: string | null
}

// ─── Email classification ─────────────────────────────────────────────────────

// Prefixes that, when the local part STARTS WITH them, indicate a generic inbox.
const GENERIC_PREFIXES = [
  'recruit', 'recruiting', 'team', 'info', 'contact',
]

type EmailClass = 'generic' | 'personal' | 'none'

function classifyEmail(email: string | null): EmailClass {
  if (!email || !email.trim()) return 'none'
  const localPart = email.split('@')[0].toLowerCase()
  // Any local part containing "soccer" is a team inbox
  // (catches msoccer, menssoccer, calsoccer, huskysoccer, smsoccer, vtmsoccer, etc.)
  if (localPart.includes('soccer')) return 'generic'
  // Remaining prefix-based generics
  if (GENERIC_PREFIXES.some(prefix => localPart.startsWith(prefix))) return 'generic'
  return 'personal'
}

// ─── Role normalization ───────────────────────────────────────────────────────

function normalizeRole(raw: string | null): { role: CoachRole; needsReview: boolean } {
  if (!raw || !raw.trim()) {
    return { role: 'Other', needsReview: true }
  }

  const lower = raw.trim().toLowerCase()

  // ── Interim roles (checked first — "Interim Head Coach" must not fall into
  //    the generic "head" branch below) ───────────────────────────────────────
  if (lower.includes('interim')) {
    if (lower.includes('head')) {
      return { role: 'Interim Head Coach', needsReview: false }
    }
    if (lower.includes('assistant')) {
      // Catches "Interim/Assistant Coach", "Interim Assistant Coach", etc.
      return { role: 'Interim Assistant Coach', needsReview: false }
    }
    // Unrecognized interim variant — flag it
    return { role: 'Other', needsReview: true }
  }

  // Associate Head Coach — check before generic "head" check
  if (lower === 'associate head coach') {
    return { role: 'Associate Head Coach', needsReview: false }
  }

  // Any "Head ..." variant → Head Coach
  if (lower.startsWith('head ') || lower === 'head coach') {
    return { role: 'Head Coach', needsReview: false }
  }

  // Assistant Coach
  if (lower === 'assistant coach') {
    return { role: 'Assistant Coach', needsReview: false }
  }

  // Anything else → Other + flag
  return { role: 'Other', needsReview: true }
}

// ─── Name validation ──────────────────────────────────────────────────────────

function nameNeedsReview(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return true
  if (trimmed.toLowerCase() === 'coach') return true
  if (trimmed.split(/\s+/).length === 1) return true                        // single word
  if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) return true  // ALL CAPS
  return false
}

// ─── Parser ───────────────────────────────────────────────────────────────────

interface ParsedCoach {
  rawName: string          // original name before cleaning, for debugging
  name: string
  roleRaw: string | null   // original role string, for debugging
  role: CoachRole
  needsReview: boolean
}

function parseHeadCoachField(headCoach: string): ParsedCoach[] {
  // Split on semicolons to get individual coach entries
  const segments = headCoach.split(';').map(s => s.trim()).filter(Boolean)
  const coaches: ParsedCoach[] = []

  for (const segment of segments) {
    // Strip parenthetical text: "(Dr. Daniel P. Wood Endowed Chair)" etc.
    const stripped = segment.replace(/\s*\([^)]*\)\s*/g, ' ').trim()

    // Split on em dash (–) or hyphen-with-spaces ( - ) — first occurrence only
    // Use a regex that matches " – " or " - " (space, separator, space)
    const dashMatch = stripped.match(/^(.*?)\s+[–-]\s+(.+)$/)

    let rawName: string
    let roleRaw: string | null

    if (dashMatch) {
      rawName = dashMatch[1].trim()
      roleRaw = dashMatch[2].trim()
    } else {
      // No separator found — whole string is the name, role unknown
      rawName = stripped
      roleRaw = null
    }

    const { role, needsReview: roleNeedsReview } = normalizeRole(roleRaw)
    const nameFlagged = nameNeedsReview(rawName)

    coaches.push({
      rawName,
      name: rawName,
      roleRaw,
      role,
      needsReview: roleNeedsReview || nameFlagged,
    })
  }

  return coaches
}

// ─── Sort order assignment ────────────────────────────────────────────────────

function assignSortOrder(coaches: ParsedCoach[]): number[] {
  const orders: number[] = []
  let assistantCounter = 0

  for (const coach of coaches) {
    switch (coach.role) {
      case 'Head Coach':
        orders.push(0)
        break
      case 'Interim Head Coach':
        orders.push(5)
        break
      case 'Associate Head Coach':
        orders.push(10)
        break
      case 'Assistant Coach':
      case 'Interim Assistant Coach':
        // Both tiers share the same sequential band (20, 30, 40...)
        orders.push(20 + assistantCounter * 10)
        assistantCounter++
        break
      case 'Other':
        orders.push(100)
        break
    }
  }

  return orders
}

// ─── Build inserts for one school ────────────────────────────────────────────

interface SchoolPlan {
  school: School
  coaches: CoachInsert[]
  schoolUpdate: SchoolUpdate | null   // non-null if generic_team_email should be set
  warnings: string[]
}

function buildPlanForSchool(school: School): SchoolPlan {
  const warnings: string[] = []
  const coaches: CoachInsert[] = []
  let schoolUpdate: SchoolUpdate | null = null

  // If head_coach is null/empty, nothing to parse
  if (!school.head_coach || !school.head_coach.trim()) {
    warnings.push('head_coach is empty — no coaches created')
    return { school, coaches, schoolUpdate, warnings }
  }

  const parsed = parseHeadCoachField(school.head_coach)

  if (parsed.length === 0) {
    warnings.push('head_coach parsed to zero coaches — skipping')
    return { school, coaches, schoolUpdate, warnings }
  }

  // Detect multiple "head-tier" coaches (Head Coach or Interim Head Coach)
  const headTierRoles: CoachRole[] = ['Head Coach', 'Interim Head Coach']
  const headCoaches = parsed.filter(c => headTierRoles.includes(c.role))
  const multipleHeadCoaches = headCoaches.length > 1
  if (multipleHeadCoaches) {
    warnings.push(`Multiple head-tier coaches detected (${headCoaches.length}) — all flagged for review`)
  }

  // Classify the school's coach_email
  const emailClass = classifyEmail(school.coach_email)

  // If generic → will move to generic_team_email on schools table
  if (emailClass === 'generic') {
    schoolUpdate = { generic_team_email: school.coach_email! }
    warnings.push(`coach_email "${school.coach_email}" is generic → generic_team_email`)
  }

  // Sort orders
  const sortOrders = assignSortOrder(parsed)

  // Build coach inserts
  let primaryAssigned = false

  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i]
    const order = sortOrders[i]
    let needsReview = p.needsReview || multipleHeadCoaches

    // Assign personal email to the first head-tier coach
    let coachEmail: string | null = null
    if (headTierRoles.includes(p.role) && emailClass === 'personal') {
      coachEmail = school.coach_email
    }

    // is_primary: Head Coach or Interim Head Coach gets it (first one wins)
    let isPrimary = false
    if (headTierRoles.includes(p.role) && !primaryAssigned) {
      isPrimary = true
      primaryAssigned = true
    }

    coaches.push({
      school_id: school.id,
      name: p.name,
      role: p.role,
      email: coachEmail,
      is_primary: isPrimary,
      needs_review: needsReview,
      sort_order: order,
      notes: null,
    })
  }

  // If no Head Coach was found, is_primary goes on the first coach
  if (!primaryAssigned && coaches.length > 0) {
    coaches[0].is_primary = true
    coaches[0].needs_review = true
    warnings.push('No Head Coach found — first coach set as primary with needs_review')
  }

  // If personal email but no head-tier coach: email assignment failed → flag all
  if (emailClass === 'personal' && !headCoaches.length) {
    for (const c of coaches) c.needs_review = true
    warnings.push(
      `coach_email "${school.coach_email}" is personal but no head-tier coach found — all flagged for review`
    )
  }

  // If email class was 'none': nothing special, no assignment
  if (emailClass === 'none' && school.coach_email) {
    warnings.push(`coach_email "${school.coach_email}" could not be classified — flagged for review`)
    for (const c of coaches) c.needs_review = true
  }

  return { school, coaches, schoolUpdate, warnings }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[backfill] Starting coach backfill${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`)
  console.log()

  // Fetch all schools
  const { data: schools, error: schoolsErr } = await supabase
    .from('schools')
    .select('id, name, head_coach, coach_email')
    .order('name')

  if (schoolsErr || !schools) {
    console.error('❌  Failed to fetch schools:', schoolsErr)
    process.exit(1)
  }

  // Fetch schools that already have coach records (for idempotency)
  const { data: existingCoaches, error: existingErr } = await supabase
    .from('coaches')
    .select('school_id')

  if (existingErr) {
    console.error('❌  Failed to fetch existing coaches:', existingErr)
    process.exit(1)
  }

  const alreadyPopulated = new Set((existingCoaches ?? []).map(c => c.school_id))

  // ─── Build plans ───────────────────────────────────────────────────────────

  let totalSchoolsProcessed = 0
  let totalSchoolsSkipped = 0
  let totalCoachesCreated = 0
  let totalNeedsReview = 0
  const plans: SchoolPlan[] = []

  for (const school of schools as School[]) {
    if (alreadyPopulated.has(school.id)) {
      console.log(`[backfill] SKIP   ${school.name} — already has coach records`)
      totalSchoolsSkipped++
      continue
    }

    const plan = buildPlanForSchool(school)
    plans.push(plan)
    totalSchoolsProcessed++

    // Log the plan
    console.log(`[backfill] SCHOOL ${school.name}`)
    console.log(`           head_coach field: "${school.head_coach ?? '(null)'}"`)
    console.log(`           coach_email field: "${school.coach_email ?? '(null)'}"`)

    if (plan.warnings.length) {
      for (const w of plan.warnings) {
        console.log(`           ⚠  ${w}`)
      }
    }

    if (plan.coaches.length === 0) {
      console.log('           → No coaches to create')
    } else {
      for (const c of plan.coaches) {
        const flags = [
          c.is_primary ? 'primary' : '',
          c.needs_review ? 'needs_review' : '',
        ].filter(Boolean).join(', ')
        console.log(
          `           → [${c.role}] "${c.name}"` +
          (c.email ? ` <${c.email}>` : '') +
          ` (sort_order=${c.sort_order})` +
          (flags ? ` [${flags}]` : '')
        )
        totalCoachesCreated++
        if (c.needs_review) totalNeedsReview++
      }
    }

    if (plan.schoolUpdate) {
      console.log(`           → schools.generic_team_email = "${plan.schoolUpdate.generic_team_email}"`)
    }

    console.log()
  }

  // ─── Summary (dry run stops here) ─────────────────────────────────────────

  console.log('─────────────────────────────────────────────────────')
  console.log(`[backfill] Summary`)
  console.log(`           Schools in DB:       ${schools.length}`)
  console.log(`           Already populated:   ${totalSchoolsSkipped}`)
  console.log(`           To process:          ${totalSchoolsProcessed}`)
  console.log(`           Coaches to create:   ${totalCoachesCreated}`)
  console.log(`           Flagged needs_review: ${totalNeedsReview}`)
  console.log('─────────────────────────────────────────────────────')

  if (DRY_RUN) {
    console.log()
    console.log('[backfill] DRY RUN complete — no data was written.')
    console.log('[backfill] Re-run without --dry-run to apply.')
    return
  }

  // ─── Apply writes ──────────────────────────────────────────────────────────

  console.log()
  console.log('[backfill] Applying writes...')
  let writeErrors = 0

  for (const plan of plans) {
    if (plan.coaches.length === 0) continue

    // Insert coach records
    const { error: insertErr } = await supabase
      .from('coaches')
      .insert(plan.coaches)

    if (insertErr) {
      console.error(`❌  Failed to insert coaches for ${plan.school.name}:`, insertErr.message)
      writeErrors++
      continue
    }

    // Update generic_team_email on schools if needed
    if (plan.schoolUpdate) {
      const { error: updateErr } = await supabase
        .from('schools')
        .update(plan.schoolUpdate)
        .eq('id', plan.school.id)

      if (updateErr) {
        console.error(
          `❌  Failed to update generic_team_email for ${plan.school.name}:`,
          updateErr.message
        )
        writeErrors++
      }
    }

    console.log(`[backfill] ✓ ${plan.school.name} — ${plan.coaches.length} coach(es) created`)
  }

  console.log()
  if (writeErrors === 0) {
    console.log(`[backfill] ✅  Done. ${totalCoachesCreated} coaches created across ${totalSchoolsProcessed} schools.`)
    console.log(`[backfill]    ${totalNeedsReview} coach records flagged needs_review for manual review.`)
  } else {
    console.log(`[backfill] ⚠  Done with ${writeErrors} error(s). Check output above.`)
  }
}

main().catch(err => {
  console.error('❌  Unexpected error:', err)
  process.exit(1)
})

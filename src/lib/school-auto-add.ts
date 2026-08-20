/**
 * school-auto-add.ts — a coach reaching out IS engagement.
 *
 * When inbound mail resolves to a school that is NOT on the family's list, add
 * it from the catalog at C-tier and file the message against it, rather than
 * orphaning a real coach contact.
 *
 * GUARDRAILS (all four are load-bearing):
 *  1. HIGH-CONFIDENCE SENDER EVIDENCE ONLY — an exact coach-email/domain match
 *     against the catalog, or SportsRecruits' own structured school assertion.
 *     NEVER the subject-word fallback, never the loose substring rules that
 *     matchSchool uses for already-listed schools.
 *  2. EXACTLY-ONE-OR-REFUSE catalog resolution. An ambiguous name resolves to
 *     nothing (the discovery matcher's rule: verify-program beats wrong-school).
 *  3. RATE LIMITED — a mass blast must not silently add forty schools.
 *  4. PROVENANCE RECORDED — origin, a human-readable evidence note, the
 *     triggering contact_log row, and the discovery linkage. Auditable in
 *     /unmatched and undoable.
 *
 * REVERSAL IS RE-TIERING, NOT DELETION: under Shape B the schools row IS the
 * relationship, and contact_log cascades from it — deleting an auto-added school
 * would delete the coach message that justified adding it.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { catalogAdmin } from '@/lib/tenant-db'
import { fetchAll } from '@/lib/fetch-all'
import { matchCatalog } from '@/lib/school-match'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>

const MAX_AUTO_ADDS_PER_DAY = 5

export interface CatalogRow {
  id: string
  name: string
  short_name: string | null
  division: string | null
  conference: string | null
  city: string | null
  state: string | null
  domains: string[] | null
}

const CATALOG_COLS = 'id, name, short_name, division, conference, city, state, domains'

/** Resolve a school NAME against the catalog — exactly one match or nothing.
 *
 *  Uses the SHARED matcher (school-match.ts), the same one E1 linkage, the
 *  add-a-school flow and admin review run, so all four agree about what a typed
 *  name means. Exactly-one-or-refuse is preserved and is stricter than the
 *  matcher's own contract: the matcher returns candidates for a human to
 *  confirm, and this path has no human, so anything ambiguous resolves to
 *  nothing. Only the EXACT tier is accepted here — the subset tier is for a
 *  person looking at division and state, not for an unattended write.
 *
 *  THE CATALOG READ IS PAGINATED AND ASSERTED. This used to be .limit(1200),
 *  which PostgREST silently capped at 1000 — so auto-add resolved against 1000
 *  of 1066 rows and a school in the missing 66 could never be matched. It
 *  failed CLOSED (a refusal, not a wrong add), so nothing looked broken. */
export async function strictCatalogMatchByName(name: string): Promise<CatalogRow | null> {
  const rows = await loadCatalog()
  const result = matchCatalog(name, rows)
  if (result.tier !== 'exact' || result.candidates.length !== 1) return null
  return rows.find(r => r.id === result.candidates[0].id) ?? null
}

/** One complete, assertion-checked read of the catalog. Throwing on a short
 *  read is correct here: a truncated catalog turns real schools into refusals,
 *  and a refusal is indistinguishable from "not a real school". */
async function loadCatalog(): Promise<CatalogRow[]> {
  return fetchAll<CatalogRow>(catalogAdmin(), 'discovery_schools', CATALOG_COLS, { orderBy: 'id' })
}

/** Resolve an email DOMAIN against the catalog — exactly one match or nothing. */
export async function catalogMatchByDomain(domain: string): Promise<CatalogRow | null> {
  const d = (domain ?? '').trim().toLowerCase()
  if (!d) return null
  const db = catalogAdmin()
  const { data } = await db.from('discovery_schools').select(CATALOG_COLS).contains('domains', [d])
  const rows = (data ?? []) as CatalogRow[]
  return rows.length === 1 ? rows[0] : null
}

/** Has this family already hit today's auto-add ceiling? */
async function underRateLimit(admin: Db): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count } = await admin
    .from('schools')
    .select('id', { count: 'exact', head: true })
    .eq('origin', 'inbound_auto')
    .gte('created_at', since)
  return (count ?? 0) < MAX_AUTO_ADDS_PER_DAY
}

export interface AutoAddResult {
  schoolId: string | null
  refusedBecause?: 'rate_limited' | 'insert_failed' | 'already_listed'
}

/**
 * Create the family's C-tier row for a catalog school, with provenance.
 * `admin` must be a familyAdmin client — family_id is injected by the wrapper.
 */
export async function autoAddSchoolFromInbound(
  admin: Db,
  catalog: CatalogRow,
  evidence: string,
  contactLogId: string | null,
): Promise<AutoAddResult> {
  // Never double-add: the caller has already failed to match, but a concurrent
  // message could have added it a moment ago.
  const { data: existing } = await admin
    .from('schools').select('id').eq('discovery_school_id', catalog.id).limit(1)
  if (existing && existing.length > 0) {
    return { schoolId: (existing[0] as { id: string }).id, refusedBecause: 'already_listed' }
  }

  if (!(await underRateLimit(admin))) {
    console.warn(`[auto-add] rate limit reached — refusing to add "${catalog.name}" (${evidence})`)
    return { schoolId: null, refusedBecause: 'rate_limited' }
  }

  const location = [catalog.city, catalog.state].filter(Boolean).join(', ') || null
  const { data, error } = await admin.from('schools').insert({
    name: catalog.name,
    short_name: catalog.short_name,
    category: 'C',                 // exploratory — the family re-tiers
    status: 'Not Contacted',
    division: catalog.division,
    conference: catalog.conference,
    location,
    recruiting_stage: 1,
    videos_sent: false,
    aliases: [],
    discovery_school_id: catalog.id,
    origin: 'inbound_auto',
    origin_note: evidence,
    origin_contact_log_id: contactLogId,
  }).select('id').single()

  if (error) {
    console.error(`[auto-add] insert failed for "${catalog.name}": ${error.message}`)
    return { schoolId: null, refusedBecause: 'insert_failed' }
  }
  console.log(`[auto-add] added "${catalog.name}" at C-tier — ${evidence}`)
  return { schoolId: (data as { id: string }).id }
}

/**
 * DOMAIN PROMOTION — a school's email domain is a fact about the SCHOOL, not
 * about a family. When a family's row carries a domain and is linked to a
 * catalog row, promote it so every family benefits (and so auto-add's
 * direct-email path stops being thin: only 7 catalog rows carried domains at
 * build time).
 *
 * Refuses on ambiguity: promotes ONLY when the family row has a
 * discovery_school_id, and never overwrites — it unions.
 */
export async function promoteDomainToCatalog(
  admin: Db,
  familySchoolId: string,
  domain: string,
): Promise<boolean> {
  const d = (domain ?? '').trim().toLowerCase()
  if (!d || d.includes(' ')) return false

  const { data: school } = await admin
    .from('schools').select('id, name, discovery_school_id').eq('id', familySchoolId).maybeSingle()
  const discoveryId = (school?.discovery_school_id as string | null) ?? null
  if (!discoveryId) return false   // no linkage → cannot attribute the domain

  const db = catalogAdmin()
  const { data: cat } = await db
    .from('discovery_schools').select('id, name, domains').eq('id', discoveryId).maybeSingle()
  if (!cat) return false

  const current = ((cat.domains as string[] | null) ?? []).map(x => x.toLowerCase())
  if (current.includes(d)) return false

  const { error } = await db
    .from('discovery_schools')
    .update({ domains: [...current, d] })
    .eq('id', discoveryId)
  if (error) {
    console.error(`[domain-promotion] failed for ${cat.name}: ${error.message}`)
    return false
  }
  console.log(`[domain-promotion] "${d}" → catalog row "${cat.name}"`)
  return true
}

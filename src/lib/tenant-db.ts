/**
 * tenant-db.ts — T1: the ONLY legal source of a service-role Supabase client.
 *
 * Doctrine (approved T1 design §4b): RLS enforces tenancy for user-client paths;
 * privileged paths (crons, webhooks, SSE generators) keep service role but every
 * query MUST carry an explicit family scope. An unscoped service-role query
 * against a family table is a THROWN ERROR, not a convention:
 *
 *   - familyAdmin(familyId)  — service client whose .from() auto-scopes every
 *     family-table query: reads/updates/deletes gain .eq('family_id', familyId),
 *     inserts/upserts get family_id injected (a mismatched explicit family_id
 *     throws). Catalog tables pass through untouched.
 *   - catalogAdmin()         — service client restricted to catalog/infra tables;
 *     touching a family table throws ("use familyAdmin").
 *   - rawService()           — the naked client, for storage/auth/rpc plumbing
 *     inside this module's callers ONLY where table access is not involved
 *     (streaming a storage object, auth.admin). Table access via .from() on a
 *     family table throws.
 *
 * player_profile is BLOCKED everywhere: frozen since the C6 sitting, dropped in
 * C7 — nothing new may read it.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

/** TODO(email-boundary): the inbound-email and cron paths hardcode family #1
 *  until per-family routing exists. Every use site carries this marker. */
export const ALMOND_FAMILY_ID = '00000000-0000-0000-0000-000000000001'

/** Tables that carry family_id — auto-scoped by familyAdmin, refused elsewhere.
 *  T2 Shape B: schools/coaches/camps/attendees joined this set — the 65-row
 *  schools table was the family's engaged list all along (discovery_schools is
 *  the true catalog). */
const FAMILY_TABLES = new Set([
  'contact_log', 'school_offers', 'school_milestones', 'school_status_updates',
  'school_message_plan', 'school_message_log', 'school_plan_questions',
  'school_conversation_summary', 'school_question_overrides', 'school_specific_questions',
  'camp_family_status', 'calendar_events', 'calendar_event_schools',
  'campaigns', 'campaign_schools', 'campaign_templates', 'campaign_email_drafts',
  'messages', 'prep_docs', 'assets', 'action_items', 'batch_reel_sends',
  'questions', 'gmail_tokens', 'players',
  'schools', 'coaches',
  // E2 private layer: what a family thinks about a coach, as distinct from what
  // the roster says. Stays a FAMILY table through the catalog re-point — it is
  // the whole point of the split (coaches goes shared, this does not).
  'coach_family_state',
  'family_sending_addresses',
  // The PROPOSAL is shared (catalog) so it is reviewed once; the DECISION is
  // per-family, so one family's dismissal never suppresses another's camp.
  'camp_proposal_decisions',
])

/** Shared catalog + tenancy/infra tables — passthrough. */
const CATALOG_TABLES = new Set([
  'discovery_schools', 'school_research', 'camp_proposals', 'coach_changes',
  'cron_runs', 'not_found_log', 'families', 'users',
  // E1.5: camps and their attendee rows are SHARED — a camp and the schools
  // attending it are facts about the world, not about a family. The per-family
  // layer is camp_family_status, which stays a FAMILY table. camp_coach_attendees
  // was dropped (chunk C) rather than migrated: it never held a row.
  'camps', 'camp_school_attendees',
  // A shared review queue, like camp_proposals: one admin decides whether a
  // school joins the catalog. It carries proposed_by_family_id and family RLS
  // so a family sees its own proposals on the user client, while review runs
  // service-role across all of them.
  'catalog_proposals',
])

/** CROSS-FAMILY BY DESIGN — service-role passthrough, and deliberately so:
 *  inbound routing must resolve WHICH family a message belongs to *before* a
 *  family scope can exist, so these cannot be family-scoped at the wrapper.
 *  Both are protected at the database instead —
 *    family_inbound_addresses: family RLS, so user-client reads see only their own
 *    inbound_quarantine:       RLS on with NO policies, service-role only, never
 *                              readable by any family under any circumstance
 *  Nothing else belongs in this set. Adding a table here opts it out of tenancy
 *  enforcement in code; do it only when cross-family reach is the table's purpose. */
const ROUTING_TABLES = new Set([
  'family_inbound_addresses', 'inbound_quarantine',
])

/** Frozen since the C6 sitting; dropped in C7. Nothing new may read it. */
const BLOCKED_TABLES = new Set(['player_profile', 'strategic_skips'])

function makeRaw(): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function classify(table: string): 'family' | 'catalog' | 'blocked' | 'unknown' {
  if (BLOCKED_TABLES.has(table)) return 'blocked'
  if (FAMILY_TABLES.has(table)) return 'family'
  if (CATALOG_TABLES.has(table)) return 'catalog'
  if (ROUTING_TABLES.has(table)) return 'catalog'  // cross-family by design — see above
  return 'unknown'
}

function refuse(table: string, kind: string): never {
  throw new Error(
    kind === 'blocked'
      ? `tenant-db: '${table}' is frozen (C7 drops it) — read players/nothing instead`
      : kind === 'unknown'
        ? `tenant-db: table '${table}' is unclassified — add it to FAMILY_TABLES or CATALOG_TABLES before querying`
        : `tenant-db: '${table}' is a family table — use familyAdmin(familyId), not catalogAdmin/rawService`,
  )
}

function injectFamily(values: any, familyId: string): any {
  const rows = Array.isArray(values) ? values : [values]
  const out = rows.map(v => {
    if (v && typeof v === 'object') {
      if (v.family_id && v.family_id !== familyId) {
        throw new Error(`tenant-db: family_id mismatch (row carries ${v.family_id}, scope is ${familyId})`)
      }
      return { ...v, family_id: familyId }
    }
    return v
  })
  return Array.isArray(values) ? out : out[0]
}

/** Wrap a query builder so every verb is family-scoped. */
function scopeBuilder(qb: any, familyId: string): any {
  return new Proxy(qb, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver)
      if (typeof orig !== 'function') return orig
      switch (prop) {
        case 'select':
          return (...args: any[]) => orig.apply(target, args).eq('family_id', familyId)
        case 'insert':
        case 'upsert':
          return (values: any, opts?: any) => orig.apply(target, [injectFamily(values, familyId), opts])
        case 'update':
          return (values: any, opts?: any) => orig.apply(target, [values, opts]).eq('family_id', familyId)
        case 'delete':
          return (opts?: any) => orig.apply(target, [opts]).eq('family_id', familyId)
        default:
          return orig.bind(target)
      }
    },
  })
}

function wrapClient(mode: 'family' | 'catalog' | 'raw', familyId?: string): SupabaseClient {
  const raw = makeRaw()
  return new Proxy(raw, {
    get(target, prop, receiver) {
      // The scope is introspectable so shared helpers (prompt builders) can pass
      // it to rpcs that take an explicit family parameter.
      if (prop === 'tenantFamilyId') return familyId ?? null
      if (prop === 'from') {
        return (table: string) => {
          const kind = classify(table)
          if (kind === 'blocked' || kind === 'unknown') refuse(table, kind)
          if (kind === 'family') {
            if (mode !== 'family') refuse(table, 'family-needed')
            return scopeBuilder(target.from(table), familyId!)
          }
          return target.from(table) // catalog passthrough in every mode
        }
      }
      const value = Reflect.get(target, prop, receiver)
      // Bind class methods (storage, auth, rpc, channel …) to the real client.
      return typeof value === 'function' ? (value as (...a: any[]) => any).bind(target) : value
    },
  }) as SupabaseClient
}

/** Service-role client with every family-table query pinned to one family. */
export function familyAdmin(familyId: string): SupabaseClient {
  if (!familyId) throw new Error('tenant-db: familyAdmin requires a familyId')
  return wrapClient('family', familyId)
}

/** Service-role client for catalog/infra work only — family tables refuse. */
export function catalogAdmin(): SupabaseClient {
  return wrapClient('catalog')
}

/** Naked service client for non-table plumbing (storage streams, auth.admin,
 *  rpc with explicit family params). Family-table .from() access still refuses. */
export function rawService(): SupabaseClient {
  return wrapClient('raw')
}

/** Read the family scope off a familyAdmin client (null on catalog/raw clients). */
export function scopeOf(client: SupabaseClient): string | null {
  return (client as unknown as { tenantFamilyId?: string | null }).tenantFamilyId ?? null
}

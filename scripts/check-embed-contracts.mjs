#!/usr/bin/env node
/**
 * check-embed-contracts.mjs — prebuild gate for PostgREST embed contracts.
 *
 * WHY THIS EXISTS
 * On 2026-08-19 a new foreign key (schools.origin_contact_log_id, the auto-add
 * provenance pointer) created a SECOND relationship between contact_log and
 * schools. Every `school:schools(...)` embed between them became ambiguous and
 * PostgREST refused them with HTTP 300 / PGRST201. The app rendered the entire
 * conversation history as an empty cold-start state while all 433 rows sat
 * intact in the database.
 *
 * NOTHING IN THE EXISTING GATES COULD CATCH IT:
 *   - Vercel logs saw nothing: these are client-side calls straight to Supabase.
 *   - The camp-doc harness saw nothing: generators use plain selects, no embeds.
 *   - tsc and the build saw nothing: the query is a string, valid TypeScript.
 *
 * WHAT THIS DOES
 * Extracts every `alias:table(...)` embed from src/, issues each against the
 * live PostgREST schema with the ANON key, and fails on a RELATIONSHIP error.
 * RLS returning zero rows is FINE and expected — this asserts the query can be
 * PLANNED, not that data is visible. No session, no data, ~2 seconds.
 *
 * Fails the build on:
 *   PGRST200 — no relationship found (renamed/dropped FK, or a typo'd embed)
 *   PGRST201 — MORE THAN ONE relationship found (the outage above)
 *
 * Skips silently (exit 0) when Supabase env vars are absent, so the build still
 * works in environments without them.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// scripts/ IS SCANNED TOO. It was not, and that made this the THIRD gate with
// the same blind spot — after the typechecker and the tenancy fence. A bare
// schools!inner embed sat in backfill-camp-extraction.ts, broken since the
// email boundary added schools.origin_contact_log_id and made that pair
// ambiguous, and no gate could see it because every gate stopped at src/.
const SRC_DIRS = ['src', 'scripts']
const URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_ENV = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

function loadEnvLocal() {
  // Vercel injects env vars; locally they live in .env.local.
  try {
    const raw = readFileSync('.env.local', 'utf8')
    const out = {}
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) out[m[1]] = m[2]
    }
    return out
  } catch { return {} }
}

const local = loadEnvLocal()
const SUPABASE_URL = URL_ENV || local.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = ANON_ENV || local.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !ANON_KEY) {
  console.log('… embed contracts: skipped (no Supabase env)')
  process.exit(0)
}

// ── Collect source files ─────────────────────────────────────────────────────
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, acc)
    else if (/\.(ts|tsx)$/.test(name)) acc.push(full)
  }
  return acc
}

// ── Extract (table, embed) pairs ─────────────────────────────────────────────
// Matches:  .from('contact_log')  ...  .select('*, school:schools!fk(id, name)')
// The select may sit on the same line or a following one.
const FROM_RE = /\.from\(\s*['"]([a-z_]+)['"]\s*\)/g
const SELECT_RE = /\.select\(\s*(['"`])([\s\S]*?)\1/g
// An embed is alias:table(...) or table(...) inside a select string. The hint
// suffix REPEATS — schools!contact_log_school_id_fkey!inner names a constraint
// AND an inner join — and matching only one !segment made every doubly-hinted
// embed invisible to this gate, which is how an ambiguous one survived.
const EMBED_RE = /(?:([A-Za-z_][\w]*)\s*:\s*)?([a-z_]+(?:![a-z_]+)*)\s*\(/g

const contracts = new Map() // key -> {table, select, files:Set}

for (const file of SRC_DIRS.flatMap(d => walk(d))) {
  const text = readFileSync(file, 'utf8')
  // Pair each .from(...) with the nearest following .select(...)
  // Collect .from() positions so a chain's select is never confused with the
  // NEXT query's select — a .from(...).delete() would otherwise borrow the
  // following query's embed and report a phantom failure.
  const froms = []
  let m
  FROM_RE.lastIndex = 0
  while ((m = FROM_RE.exec(text)) !== null) froms.push({ table: m[1], index: m.index })

  for (let i = 0; i < froms.length; i++) {
    const { table, index } = froms[i]
    const stop = i + 1 < froms.length ? froms[i + 1].index : Math.min(text.length, index + 1200)
    const rest = text.slice(index, stop)
    SELECT_RE.lastIndex = 0
    const sm = SELECT_RE.exec(rest)
    if (!sm) continue
    const select = sm[2].replace(/\s+/g, ' ').trim()
    if (!select.includes('(')) continue // no embed — nothing to verify

    // Skip TRUE aggregates only. The previous guard was /^(count|id)\b/ with no
    // alias — which silently dropped any select that merely STARTED with "id,"
    // and used an UNALIASED embed. That is a common shape, and it is how an
    // ambiguous schools!inner embed sat unverified: the gate had already
    // decided the line was a count shorthand. Count/head selects carry no "("
    // at all and are dropped by the check above.

    const key = `${table}::${select}`
    if (!contracts.has(key)) contracts.set(key, { table, select, files: new Set() })
    contracts.get(key).files.add(file)
  }
}

// ── Verify each contract against the live schema ─────────────────────────────
const failures = []
let checked = 0

for (const { table, select, files } of contracts.values()) {
  // Only the embedded relationships matter; ask for zero rows.
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=0`
  let res
  try {
    res = await fetch(url, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } })
  } catch (err) {
    console.log(`… embed contracts: skipped (network unreachable: ${err.message})`)
    process.exit(0)
  }
  checked++
  if (res.ok) continue

  const body = await res.text()
  // PGRST200 = relationship not found; PGRST201 = ambiguous (more than one).
  if (body.includes('PGRST200') || body.includes('PGRST201')) {
    let detail = body
    try {
      const j = JSON.parse(body)
      detail = `${j.code}: ${j.message}${j.hint ? ` | hint: ${j.hint}` : ''}`
    } catch { /* keep raw */ }
    failures.push({ table, select, files: [...files], detail })
  }
  // Any other status (401/403/404/400 on a column) is not a relationship
  // problem — this gate deliberately stays narrow.
}

if (failures.length > 0) {
  console.error('\n✗ embed contract check FAILED — PostgREST cannot plan these queries:\n')
  for (const f of failures) {
    console.error(`  ${f.table}.select("${f.select}")`)
    for (const file of f.files) console.error(`     used in: ${file}`)
    console.error(`     ${f.detail}\n`)
  }
  console.error('These queries return an HTTP 300/400 at runtime. Any code that')
  console.error('discards the error will render this as an EMPTY RESULT.')
  console.error('Fix by naming the constraint explicitly, e.g.')
  console.error('  school:schools!contact_log_school_id_fkey(id, name)\n')
  process.exit(1)
}

console.log(`✓ embed contracts: ${checked} PostgREST embed(s) verified against the live schema`)

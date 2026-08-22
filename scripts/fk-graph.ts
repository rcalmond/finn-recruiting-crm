/**
 * fk-graph.ts — Section 15, generated from the LIVE CATALOG.
 *
 * WHY THIS EXISTS. E2's blocker analysis was built by parsing
 * supabase/migrations/, and it missed campaign_schools.contact_log_id because
 * that blocker is TRANSITIVE — contact_log cascades from schools, and something
 * blocks the cascade one level down. The direct-reference sweep could not see
 * it. Worse, the files are a PARTIAL RECORD: T1, T2, the email boundary, E1.5
 * and every E2 chunk ran through the architect chat, so a third of the live
 * tables have no create-table statement in the repo, and the files still name
 * tables that were renamed or dropped. A closure built from them is incomplete
 * and stale, and reads authoritative either way.
 *
 * SO THE GRAPH IS REGENERATED, NOT AUTHORED. Three artefacts, because the raw
 * edge list is the least useful of them:
 *
 *   1. THE EDGE TABLE      — child.column -> parent [on delete]. The reference.
 *   2. THE CASCADE CLOSURE — for each root a chunk might delete, every table the
 *                            delete reaches, and every FK that BLOCKS it,
 *                            direct or transitive. This is the artefact that
 *                            was got wrong by hand, and it is pure derivation.
 *   3. THE DRIFT LINE      — tables live in PostgREST but absent from
 *                            supabase/migrations/. Printing the number every
 *                            regeneration is how a background fact stays visible.
 *
 * IT DEGRADES RATHER THAN FAILING. If public.fk_graph() is absent the section
 * says so in full and the rest of the doc still regenerates — an export that
 * dies because one RPC is missing would just get skipped, and then the doc goes
 * stale for a different reason.
 */
import * as fs from 'fs'
import * as path from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Roots a chunk might plausibly delete from. Closure is computed for each. */
const CLOSURE_ROOTS = ['schools', 'coaches', 'discovery_schools', 'camps', 'families', 'contact_log']

const DEL: Record<string, string> = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' }

export interface FkEdge {
  child: string
  col: string
  parent: string
  /** Single-char pg_constraint.confdeltype, or an already-expanded word. */
  on_delete: string
}

interface Graph {
  edges: FkEdge[]
  byParent: Map<string, FkEdge[]>
}

function expand(code: string): string {
  return DEL[code] ?? code.toUpperCase()
}

function build(edges: FkEdge[]): Graph {
  const byParent = new Map<string, FkEdge[]>()
  for (const e of edges) {
    const list = byParent.get(e.parent)
    if (list) list.push(e)
    else byParent.set(e.parent, [e])
  }
  return { edges, byParent }
}

/**
 * Every table a delete of `root` reaches by CASCADE, plus every FK that blocks
 * it. A blocker is any non-cascading FK pointing at the root OR at any table in
 * the cascade closure — the transitive ones are the whole point.
 */
function closure(g: Graph, root: string) {
  const reached = new Map<string, number>()   // table -> cascade depth
  const blockers: Array<FkEdge & { via: string; depth: number }> = []
  const nulled: Array<FkEdge & { via: string; depth: number }> = []
  let frontier = [root]
  let depth = 0

  // ONLY NO ACTION AND RESTRICT BLOCK. SET NULL and SET DEFAULT do not — they
  // let the delete through and quietly rewrite the referencing row. Reporting
  // them as blockers was this function's own first bug, caught by exercising it
  // against the known schools answer rather than reading the branch: it claimed
  // four blockers where the catalog has three.
  const BLOCKING = new Set(['NO ACTION', 'RESTRICT'])
  const collectBlockers = (table: string, d: number) => {
    for (const e of g.byParent.get(table) ?? []) {
      const od = expand(e.on_delete)
      if (BLOCKING.has(od)) blockers.push({ ...e, via: table, depth: d })
      else if (od === 'SET NULL' || od === 'SET DEFAULT') nulled.push({ ...e, via: table, depth: d })
    }
  }

  collectBlockers(root, 0)
  while (frontier.length > 0) {
    const next: string[] = []
    for (const parent of frontier) {
      for (const e of g.byParent.get(parent) ?? []) {
        if (expand(e.on_delete) !== 'CASCADE') continue
        if (reached.has(e.child) || e.child === root) continue
        reached.set(e.child, depth + 1)
        next.push(e.child)
        collectBlockers(e.child, depth + 1)
      }
    }
    frontier = next
    depth++
  }
  return { reached, blockers, nulled }
}

/** Live tables that have no `create table` anywhere in supabase/migrations/. */
function migrationDrift(liveTables: string[]): { missing: string[]; stale: string[] } {
  const dir = path.resolve(process.cwd(), 'supabase/migrations')
  const declared = new Set<string>()
  try {
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.sql'))) {
      const sql = fs.readFileSync(path.join(dir, f), 'utf8')
      for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)/gi)) {
        declared.add(m[1])
      }
    }
  } catch {
    return { missing: [], stale: [] }
  }
  const live = new Set(liveTables)
  return {
    missing: liveTables.filter(t => !declared.has(t)).sort(),
    stale: Array.from(declared).filter(t => !live.has(t)).sort(),
  }
}

export async function buildSection15(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
  liveTables: string[],
  generatedOn: string,
): Promise<string[]> {
  const L: string[] = []
  L.push(`## 15. Foreign Key Graph — Generated ${generatedOn}`)
  L.push('')
  L.push('<!-- GENERATED — do not hand-edit; regenerate with `npm run export-context` -->')
  L.push('')
  L.push('Read from the LIVE CATALOG via `public.fk_graph()`, never from `supabase/migrations/`.')
  L.push('**Before any chunk\'s SQL, paste the closure below for the tables that chunk touches into the sitting.**')
  L.push('That step is what turns this from available into consulted; it costs one paste.')
  L.push('')

  const { data, error } = await db.rpc('fk_graph')
  if (error || !Array.isArray(data)) {
    L.push('> **UNAVAILABLE this regeneration.** `public.fk_graph()` did not answer:')
    L.push(`> \`${error?.message ?? 'unexpected response shape'}\``)
    L.push('>')
    L.push('> Do NOT substitute a reading of `supabase/migrations/` — it is a partial record')
    L.push('> and answers this question wrongly with full confidence. Run the closure by hand')
    L.push('> against the catalog for the tables a chunk touches until the RPC is restored.')
    L.push('')
    return L
  }

  const edges: FkEdge[] = (data as FkEdge[])
    .map(e => ({ ...e, on_delete: expand(e.on_delete) }))
    .sort((a, b) => a.parent.localeCompare(b.parent) || a.child.localeCompare(b.child))
  const g = build(edges)

  // ── 2. Cascade closures (most useful first, so it reads before the raw list)
  L.push('### Cascade closures and their blockers')
  L.push('')
  L.push('A delete tests every FK pointing at the target **and at every table the delete')
  L.push('cascades into, recursively**. Transitive blockers are where the surprises live —')
  L.push('nothing in the delete statement mentions them.')
  L.push('')
  for (const root of CLOSURE_ROOTS) {
    if (!g.byParent.has(root)) continue
    const { reached, blockers, nulled } = closure(g, root)
    L.push(`**\`${root}\`** — cascades into ${reached.size} table(s); ${blockers.length} blocker(s); ${nulled.length} reference(s) silently nulled.`)
    L.push('')
    if (blockers.length === 0) {
      L.push('- no blockers: a delete here is unconstrained')
    } else {
      for (const b of blockers.sort((x, y) => x.depth - y.depth || x.child.localeCompare(y.child))) {
        const where = b.depth === 0 ? 'direct' : `transitive, L${b.depth} via \`${b.via}\``
        L.push(`- BLOCKS \`${b.child}.${b.col}\` → \`${b.parent}\` [${b.on_delete}] — ${where}`)
      }
    }
    if (nulled.length > 0) {
      // Not blockers, but worth seeing at a sitting: the delete succeeds and
      // these references become null without anything reporting it.
      L.push('')
      L.push(`  <sub>nulled on delete: ${nulled.map(n => `\`${n.child}.${n.col}\``).join(', ')}</sub>`)
    }
    L.push('')
  }

  // ── 1. The edge table
  L.push('### Every foreign key')
  L.push('')
  L.push('| child.column | → parent | on delete |')
  L.push('|---|---|---|')
  for (const e of edges) L.push(`| \`${e.child}.${e.col}\` | \`${e.parent}\` | ${e.on_delete} |`)
  L.push('')

  // ── 3. The drift line
  const { missing, stale } = migrationDrift(liveTables)
  L.push('### Migration drift')
  L.push('')
  L.push(`**${missing.length} of ${liveTables.length} live tables have no \`create table\` in \`supabase/migrations/\`.**`)
  L.push('')
  L.push('`supabase/migrations/` IS NOT A ROLLBACK MECHANISM AND NEVER WAS. Anyone reading it')
  L.push('as one is reading a fraction of the schema as absent. The live catalog is the source')
  L.push('of truth; the repo regenerates from it.')
  L.push('')
  if (missing.length > 0) {
    L.push(`- absent from the repo: ${missing.map(t => `\`${t}\``).join(', ')}`)
  }
  if (stale.length > 0) {
    L.push(`- named in the repo but NOT live (renamed or dropped): ${stale.map(t => `\`${t}\``).join(', ')}`)
  }
  L.push('')
  return L
}

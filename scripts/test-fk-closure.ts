/**
 * test-fk-closure.ts — does the Section 15 closure reproduce a known answer?
 *
 *   npx tsx scripts/test-fk-closure.ts
 *
 * Fed a small fixture it must find, on `schools`, exactly the three blockers
 * the live catalog reports: one DIRECT (campaign_schools.school_id) and two
 * TRANSITIVE (campaign_schools.coach_id via the coaches cascade,
 * campaign_schools.contact_log_id via the contact_log cascade). It must also
 * NOT report SET NULL as a blocker — that was this code's own first bug, and it
 * was caught here rather than by reading the branch.
 *
 * This tests the DERIVATION, not the data. The data comes from public.fk_graph().
 */
import { buildSection15 } from './fk-graph'

const edges = [
  { child: 'contact_log',      col: 'school_id',      parent: 'schools',     on_delete: 'c' },
  { child: 'coaches',          col: 'school_id',      parent: 'schools',     on_delete: 'c' },
  { child: 'action_items',     col: 'school_id',      parent: 'schools',     on_delete: 'c' },
  { child: 'campaign_schools', col: 'school_id',      parent: 'schools',     on_delete: 'a' },
  { child: 'campaign_schools', col: 'coach_id',       parent: 'coaches',     on_delete: 'a' },
  { child: 'campaign_schools', col: 'contact_log_id', parent: 'contact_log', on_delete: 'a' },
  { child: 'prep_docs',        col: 'coach_id',       parent: 'coaches',     on_delete: 'n' },
]

const fakeDb = { rpc: async () => ({ data: edges, error: null }) } as never
buildSection15(fakeDb, ['schools', 'coaches', 'contact_log', 'campaign_schools'], 'TEST').then(lines => {
  const txt = lines.join('\n')
  const block = txt.slice(txt.indexOf('**`schools`**'), txt.indexOf('**`coaches`**'))
  console.log('\n  --- closure for schools ---')
  console.log(block.trim().split('\n').map(l => '  ' + l).join('\n'))
  const checks: [string, boolean][] = [
    ['direct blocker campaign_schools.school_id',      /campaign_schools\.school_id`.*direct/.test(block)],
    ['transitive via coaches',                          /campaign_schools\.coach_id`.*transitive, L1 via `coaches`/.test(block)],
    ['transitive via contact_log',                      /campaign_schools\.contact_log_id`.*transitive, L1 via `contact_log`/.test(block)],
    ['SET NULL is not reported as a BLOCKER',           !/BLOCKS `prep_docs/.test(block)],
    ['SET NULL is reported as silently nulled',         /nulled on delete: `prep_docs\.coach_id`/.test(block)],
    ['exactly 3 blockers',                              (block.match(/BLOCKS/g) ?? []).length === 3],
  ]
  console.log('')
  let fail = 0
  for (const [name, ok] of checks) { if (!ok) fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`) }
  console.log(`\n  ${fail === 0 ? 'ALL PASS' : fail + ' FAILURE(S)'}\n`)
  process.exit(fail === 0 ? 0 : 1)
})

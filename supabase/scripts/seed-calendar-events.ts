/**
 * Seed: the known real fall outreach moments (migration 061 calendar_events).
 * Confirmed by Randy 2026-08-07. Idempotent — matches on name, inserts if absent.
 * No showcases/tournaments seeded: club fall dates are TBD, added via the UI when published.
 *
 * Run: npx tsx supabase/scripts/seed-calendar-events.ts
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const getEnv = (k: string) =>
  (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] || '').trim().replace(/^["']|["']$/g, '')
const sb = createClient(getEnv('NEXT_PUBLIC_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'))

const OUTREACH_MOMENTS = [
  { name: 'Senior season schedule release', start_date: '2026-09-01',
    note: 'Send the HS senior season schedule to every active school so coaches can plan to watch.' },
  { name: 'Fall reel drop + season update', start_date: '2026-10-01',
    note: 'The fall-film wave the parked schools (Lafayette, Rochester, Bowdoin) are waiting on — new reel + season update.' },
  { name: 'End of season HS update', start_date: '2026-11-11',
    note: 'End-of-season wrap: final stats, results, and next steps to every active school.' },
]

async function main() {
  let inserted = 0, skipped = 0
  for (const m of OUTREACH_MOMENTS) {
    const { data: existing } = await sb.from('calendar_events').select('id').eq('name', m.name).maybeSingle()
    if (existing) { skipped++; console.log(`  skip (exists): ${m.name}`); continue }
    const { error } = await sb.from('calendar_events').insert({
      kind: 'outreach_moment', name: m.name, start_date: m.start_date, end_date: null,
      location: null, note: m.note, status: 'planned',
    })
    if (error) { console.error(`  ERROR ${m.name}:`, error.message); process.exit(1) }
    inserted++; console.log(`  + ${m.start_date}  ${m.name}`)
  }
  console.log(`\n✅ Outreach moments: ${inserted} inserted, ${skipped} already present.`)
}

main()

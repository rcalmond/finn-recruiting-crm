/**
 * backfill-camp-extraction.ts
 *
 * Scans historical inbound contact_log for camp-related content,
 * extracts camp data via Claude Haiku, and inserts camp_proposals
 * for human review.
 *
 * Usage:
 *   npx tsx scripts/backfill-camp-extraction.ts
 *   npx tsx scripts/backfill-camp-extraction.ts --dry-run
 *   npx tsx scripts/backfill-camp-extraction.ts --school-id=<uuid>
 *   npx tsx scripts/backfill-camp-extraction.ts --since=2025-06-01
 */

import { createClient } from '@supabase/supabase-js'
import { extractCampsFromText, shouldSkipProposal } from '../src/lib/camp-extractor'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const schoolIdArg = args.find(a => a.startsWith('--school-id='))?.split('=')[1]
const sinceArg = args.find(a => a.startsWith('--since='))?.split('=')[1]

const CAMP_PATTERN = /\b(camp|clinic|showcase|ID camp|prospect day|elite training)\b/i
const RATE_LIMIT_MS = 200

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function run() {
  const today = new Date().toISOString().split('T')[0]
  const sinceDate = sinceArg ?? (() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 12)
    return d.toISOString().split('T')[0]
  })()

  console.log(`[backfill] mode=${dryRun ? 'DRY RUN' : 'LIVE'} since=${sinceDate} school=${schoolIdArg ?? 'all'}`)
  console.log()

  // Fetch candidate attendee schools (all active A/B/C)
  const { data: allSchools } = await supabase
    .from('schools')
    .select('id, name, short_name, category, aliases')
    .in('category', ['A', 'B', 'C'])
    .neq('status', 'Inactive')

  const candidateSchools = (allSchools ?? []).map(s => ({
    id: s.id,
    name: s.short_name || s.name,
    aliases: s.aliases ?? [],
  }))

  // Fetch inbound contact_log rows matching camp pattern
  let query = supabase
    .from('contact_log')
    .select('id, school_id, direction, coach_name, channel, summary, raw_source, sent_at, date, schools!inner(id, name, short_name, category)')
    .eq('direction', 'Inbound')
    .not('school_id', 'is', null)
    .in('parse_status', ['full', 'partial'])
    .gte('sent_at', sinceDate)
    .in('schools.category', ['A', 'B', 'C'])
    .order('sent_at', { ascending: true })

  if (schoolIdArg) {
    query = query.eq('school_id', schoolIdArg)
  }

  const { data: rows, error } = await query

  if (error) {
    console.error('[backfill] query error:', error.message)
    process.exit(1)
  }

  // Filter to rows with camp-related content
  const campRows = (rows ?? []).filter(r => {
    const text = r.raw_source || r.summary || ''
    return CAMP_PATTERN.test(text)
  })

  console.log(`[backfill] scanned ${rows?.length ?? 0} inbound rows, ${campRows.length} match camp pattern`)
  console.log()

  const stats = {
    scanned: rows?.length ?? 0,
    matched: campRows.length,
    extracted: 0,
    skipped: 0,
    matchedExisting: 0,
    inserted: 0,
    errors: 0,
    perSchool: new Map<string, number>(),
  }

  for (let i = 0; i < campRows.length; i++) {
    if (i > 0) await sleep(RATE_LIMIT_MS)

    const row = campRows[i]
    const school = (row as Record<string, unknown>).schools as { id: string; name: string; short_name: string | null; category: string }
    const schoolName = school.short_name || school.name
    const text = row.raw_source || row.summary || ''
    const dateLabel = row.date || row.sent_at?.split('T')[0] || 'unknown'

    console.log(`[${i + 1}/${campRows.length}] ${schoolName} — ${row.coach_name ?? 'unknown'} (${dateLabel})`)

    try {
      const extracted = await extractCampsFromText({
        text,
        sourceContext: `Email from ${row.coach_name ?? 'unknown coach'} via ${row.channel} ${dateLabel}`,
        hostSchoolName: schoolName,
        hostSchoolId: school.id,
        candidateAttendeeSchools: candidateSchools.filter(s => s.id !== school.id),
        currentDate: today,
      })

      if (extracted.length === 0) {
        console.log(`  → 0 camps extracted`)
        continue
      }

      stats.extracted += extracted.length
      console.log(`  → ${extracted.length} camp(s) extracted`)

      for (const camp of extracted) {
        // Dedup check
        const dedup = await shouldSkipProposal(supabase, {
          hostSchoolId: school.id,
          startDate: camp.start_date,
          endDate: camp.end_date,
        })

        if (dedup.skip) {
          console.log(`    SKIP: ${camp.name} ${camp.start_date} — ${dedup.reason}`)
          stats.skipped++
          continue
        }

        if (dedup.matchedCampId) {
          console.log(`    MATCH: ${camp.name} ${camp.start_date} → existing camp ${dedup.matchedCampId}`)
          stats.matchedExisting++
        } else {
          console.log(`    NEW: ${camp.name} ${camp.start_date} (${camp.confidence})`)
        }

        if (!dryRun) {
          const { error: insertErr } = await supabase
            .from('camp_proposals')
            .insert({
              source: 'email_extract_backfill',
              source_ref: row.id,
              host_school_id: school.id,
              proposed_data: {
                name: camp.name,
                start_date: camp.start_date,
                end_date: camp.end_date,
                location: camp.location,
                registration_url: camp.registration_url,
                registration_deadline: camp.registration_deadline,
                cost: camp.cost,
                notes: camp.notes,
                attendee_school_ids: camp.attendee_school_ids,
              },
              matched_camp_id: dedup.matchedCampId ?? null,
              confidence: camp.confidence,
              notes: camp.reasoning,
            })

          if (insertErr) {
            console.error(`    INSERT ERROR: ${insertErr.message}`)
            stats.errors++
          } else {
            stats.inserted++
          }
        } else {
          stats.inserted++
        }

        const key = schoolName
        stats.perSchool.set(key, (stats.perSchool.get(key) ?? 0) + 1)
      }
    } catch (err) {
      console.error(`  ERROR: ${err}`)
      stats.errors++
    }
  }

  // Summary
  console.log()
  console.log('═══ Summary ═══')
  console.log(`Rows scanned:      ${stats.scanned}`)
  console.log(`Matched pattern:   ${stats.matched}`)
  console.log(`Camps extracted:   ${stats.extracted}`)
  console.log(`Skipped (dedup):   ${stats.skipped}`)
  console.log(`Matched existing:  ${stats.matchedExisting}`)
  console.log(`${dryRun ? 'Would insert' : 'Inserted'}:      ${stats.inserted}`)
  console.log(`Errors:            ${stats.errors}`)

  if (stats.perSchool.size > 0) {
    console.log()
    console.log('Per-school breakdown:')
    for (const [school, count] of [...stats.perSchool.entries()].sort()) {
      console.log(`  ${school}: ${count}`)
    }
  }
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

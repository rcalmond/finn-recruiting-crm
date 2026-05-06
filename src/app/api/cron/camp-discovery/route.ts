/**
 * /api/cron/camp-discovery
 *
 * Weekly Saturday cron — searches Tavily for each A/B/C active school,
 * runs results through the camp extractor, generates camp_proposals.
 *
 * Schedule: Saturday 14:00 UTC (8 AM Mountain Time).
 * Auth: Bearer <CRON_SECRET> (same as coach-roster-sync).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { searchTavily } from '@/lib/tavily'
import { extractCampsFromText, shouldSkipProposal } from '@/lib/camp-extractor'
import { startRun, completeRun } from '@/lib/cron-runs'

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface SchoolStats {
  schoolId: string
  schoolName: string
  tavilyResults: number
  campsExtracted: number
  proposalsInserted: number
  proposalsSkipped: number
  errors: number
}

export async function GET(req: NextRequest) {
  const startedAt = new Date().toISOString()

  // Auth guard
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      console.warn(`[camp-discovery] ${startedAt} — rejected: invalid CRON_SECRET`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Check Tavily key
  if (!process.env.TAVILY_API_KEY) {
    console.log(`[camp-discovery] ${startedAt} — skipped: TAVILY_API_KEY not set`)
    return NextResponse.json({ skipped: true, reason: 'TAVILY_API_KEY not set' })
  }

  const admin = serviceClient()
  const runId = await startRun(admin, 'camp-discovery')
  const today = new Date().toISOString().split('T')[0]

  // Load all active A/B/C schools
  const { data: schools, error: schoolsErr } = await admin
    .from('schools')
    .select('id, name, short_name, category')
    .in('category', ['A', 'B', 'C'])
    .neq('status', 'Inactive')

  if (schoolsErr || !schools) {
    await completeRun(admin, runId, 'failed', {}, 'Failed to load schools')
    return NextResponse.json({ error: 'Failed to load schools' }, { status: 500 })
  }

  // Load candidate attendee schools (for extractor)
  const { data: allSchools } = await admin
    .from('schools')
    .select('id, name, short_name, aliases')
    .in('category', ['A', 'B', 'C'])
    .neq('status', 'Inactive')

  const candidateSchools = (allSchools ?? []).map(s => ({
    id: s.id,
    name: s.short_name || s.name,
    aliases: s.aliases ?? [],
  }))

  const perSchool: SchoolStats[] = []
  let totalInserted = 0
  let totalSkipped = 0
  let totalErrors = 0

  for (let i = 0; i < schools.length; i++) {
    if (i > 0) await sleep(2000)

    const school = schools[i]
    const schoolName = school.short_name || school.name
    const stats: SchoolStats = {
      schoolId: school.id,
      schoolName,
      tavilyResults: 0,
      campsExtracted: 0,
      proposalsInserted: 0,
      proposalsSkipped: 0,
      errors: 0,
    }

    try {
      const query = `${school.name} men's soccer ID camp`
      const results = await searchTavily({ query, maxResults: 5 })
      stats.tavilyResults = results.length

      for (const result of results) {
        if (!result.raw_content) continue

        // Belt-and-suspenders: skip if this URL was already proposed and is still pending
        const sourceRef = `web:${result.url}`
        const { data: existingRef } = await admin
          .from('camp_proposals')
          .select('id')
          .eq('source_ref', sourceRef)
          .eq('status', 'pending')
          .limit(1)

        if (existingRef && existingRef.length > 0) {
          stats.proposalsSkipped++
          continue
        }

        try {
          const extracted = await extractCampsFromText({
            text: result.raw_content,
            sourceContext: `Web page: ${result.title} (${result.url})`,
            hostSchoolName: schoolName,
            hostSchoolId: school.id,
            candidateAttendeeSchools: candidateSchools.filter(s => s.id !== school.id),
            currentDate: today,
          })

          stats.campsExtracted += extracted.length

          for (const camp of extracted) {
            const dedup = await shouldSkipProposal(admin, {
              hostSchoolId: school.id,
              startDate: camp.start_date,
              endDate: camp.end_date,
            })

            if (dedup.skip) {
              stats.proposalsSkipped++
              continue
            }

            const { error: insertErr } = await admin.from('camp_proposals').insert({
              source: 'web_search',
              source_ref: sourceRef,
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
              console.error(`[camp-discovery] insert failed for ${schoolName}:`, insertErr.message)
              stats.errors++
            } else {
              stats.proposalsInserted++
            }
          }
        } catch (extractErr) {
          console.error(`[camp-discovery] extractor failed for ${schoolName} (${result.url}):`, extractErr)
          stats.errors++
        }
      }
    } catch (tavilyErr) {
      console.error(`[camp-discovery] Tavily failed for ${schoolName}:`, tavilyErr)
      stats.errors++
    }

    perSchool.push(stats)
    totalInserted += stats.proposalsInserted
    totalSkipped += stats.proposalsSkipped
    totalErrors += stats.errors

    if (stats.proposalsInserted > 0 || stats.errors > 0) {
      console.log(`[camp-discovery] ${schoolName}: +${stats.proposalsInserted} proposals, ${stats.proposalsSkipped} skipped, ${stats.errors} errors`)
    }
  }

  const summary = {
    ranAt: startedAt,
    schoolsProcessed: schools.length,
    totalProposalsInserted: totalInserted,
    totalSkipped,
    totalErrors,
    perSchool: perSchool.filter(s => s.proposalsInserted > 0 || s.errors > 0),
  }

  console.log(`[camp-discovery] ${startedAt} — done: ${totalInserted} inserted, ${totalSkipped} skipped, ${totalErrors} errors across ${schools.length} schools`)

  const errorsPerSchool = perSchool.filter(s => s.errors > 0).map(s => ({
    school: s.schoolName,
    errors: s.errors,
  }))

  await completeRun(
    admin, runId,
    errorsPerSchool.length > 0 ? 'partial' : 'success',
    {
      schools_searched: schools.length,
      tavily_calls: perSchool.reduce((sum, s) => sum + (s.tavilyResults > 0 ? 1 : 0), 0),
      camps_extracted: perSchool.reduce((sum, s) => sum + s.campsExtracted, 0),
      proposals_inserted: totalInserted,
      proposals_skipped: totalSkipped,
      errors_per_school: errorsPerSchool,
    }
  )

  return NextResponse.json(summary)
}

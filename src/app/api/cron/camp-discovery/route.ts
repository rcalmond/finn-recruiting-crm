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
import { familyAdmin, catalogAdmin } from '@/lib/tenant-db'
import { searchTavily } from '@/lib/tavily'
import { extractCampsFromText, shouldSkipProposal, classifyCampUpdate } from '@/lib/camp-extractor'
import { startRun, completeRun, priorRunCount } from '@/lib/cron-runs'
import { buildFamilyScanSet, distinctTargets, interleaveByFamily, rotate } from '@/lib/cron-scan-set'
import { fetchAll } from '@/lib/fetch-all'

// The ALMOND_FAMILY_ID pin is GONE. It scanned one family's schools, which was
// correct while one family existed and silently wrong the moment a second one
// did. Removing it was made safe by the per-family proposal decision: a
// dismissal now suppresses for ONE family, so a shared scan can no longer let
// one family's reject decide for everybody.
//
// cron_runs is a catalog table, so the run record is written on catalogAdmin
// rather than borrowing some arbitrary family's client.
function runClient() {
  return catalogAdmin()
}

// The union scan set is (family x school) PAIRS, so removing the family pin
// multiplied this job's wall clock by the family count. Wall clock — not the
// 1000-row cap — is this cron's real ceiling: the per-family reads are each
// scoped to one family and nowhere near 1000 rows, while the loop is seconds
// per pair. Declared explicitly so the limit is a decision rather than a default.
export const maxDuration = 300

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface SchoolStats {
  familyId: string
  familyName: string | null
  schoolId: string
  schoolName: string
  tavilyResults: number
  campsExtracted: number
  proposalsInserted: number
  proposalsSkipped: number
  proposalsEnqueued: number
  errors: number
}

export async function GET(req: NextRequest) {
  const startedAt = new Date().toISOString()

  // Auth guard — an unset secret REFUSES in every environment (never falls open).
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error(`[camp-discovery] ${startedAt} — CRON_SECRET is not configured; refusing`)
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    console.warn(`[camp-discovery] ${startedAt} — rejected: invalid CRON_SECRET`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check Tavily key
  if (!process.env.TAVILY_API_KEY) {
    console.log(`[camp-discovery] ${startedAt} — skipped: TAVILY_API_KEY not set`)
    return NextResponse.json({ skipped: true, reason: 'TAVILY_API_KEY not set' })
  }

  const runDb = runClient()
  const runId = await startRun(runDb, 'camp-discovery')
  const today = new Date().toISOString().split('T')[0]

  // THE UNION SCAN SET: one entry per (family, school) pair, across every
  // family. Paginated and asserted inside fetchAll — a truncated scan set in an
  // unattended nightly job is a silent undercount nobody would ever read.
  interface ScanSchool { id: string; name: string; short_name: string | null; category: string }
  let scan
  try {
    scan = await buildFamilyScanSet<ScanSchool>(
      'id, name, short_name, category',
      q => q.in('category', ['A', 'B', 'C']).neq('status', 'Inactive'),
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load scan set'
    console.error(`[camp-discovery] ${startedAt} — scan set failed: ${message}`)
    await completeRun(runDb, runId, 'failed', {}, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // FAIRNESS: this run WILL probably be killed before it finishes (see the
  // wall-clock constraint in Section 9). Interleaving across families makes that
  // cost every family proportionally instead of starving whoever sorts last, and
  // rotating the start by the run counter moves the tail that keeps getting cut.
  // It does not make the run complete — it makes the incompleteness survivable.
  const rotation = await priorRunCount(runDb, 'camp-discovery')
  const entries = rotate(interleaveByFamily(scan.entries), rotation)
  const distinctSchools = distinctTargets(entries, s => s.short_name || s.name)
  console.log(
    `[camp-discovery] ${startedAt} — scan set: ${entries.length} (family, school) pair(s) ` +
    `across ${scan.families.length} family(ies); ${distinctSchools} distinct school(s); ` +
    `interleaved by family, rotated by ${rotation}. ` +
    `The pair-vs-distinct gap is duplicated external search.`
  )

  const perSchool: SchoolStats[] = []
  let totalInserted = 0
  let totalSkipped = 0
  let totalErrors = 0

  // Attendee-name resolution is per-family: the extractor resolves camp attendee
  // names against the schools THAT family tracks, so the candidate list cannot be
  // shared without leaking one family's list into another's extraction.
  const candidatesByFamily = new Map<string, Array<{ id: string; name: string; aliases: string[] }>>()
  async function candidatesFor(familyId: string) {
    const cached = candidatesByFamily.get(familyId)
    if (cached) return cached
    const rows = await fetchAll<{ id: string; name: string; short_name: string | null; aliases: string[] | null }>(
      familyAdmin(familyId), 'schools', 'id, name, short_name, aliases',
      { refine: q => q.in('category', ['A', 'B', 'C']).neq('status', 'Inactive'), orderBy: 'id' },
    )
    const list = rows.map(s => ({ id: s.id, name: s.short_name || s.name, aliases: s.aliases ?? [] }))
    candidatesByFamily.set(familyId, list)
    return list
  }

  for (let i = 0; i < entries.length; i++) {
    if (i > 0) await sleep(2000)

    const { familyId, familyName, school } = entries[i]
    const db = familyAdmin(familyId)
    const schoolName = school.short_name || school.name
    const stats: SchoolStats = {
      familyId,
      familyName,
      schoolId: school.id,
      schoolName,
      tavilyResults: 0,
      campsExtracted: 0,
      proposalsInserted: 0,
      proposalsSkipped: 0,
      proposalsEnqueued: 0,
      errors: 0,
    }

    try {
      const query = `${school.name} men's soccer ID camp`
      const results = await searchTavily({ query, maxResults: 5 })
      stats.tavilyResults = results.length

      for (const result of results) {
        if (!result.raw_content) continue

        // This URL may already be proposed. camp_proposals is SHARED, so the old
        // form of this check ("a pending proposal exists for this url -> skip")
        // let one family's queue suppress another's — the same defect the
        // per-family decision was built to close, reintroduced one layer up.
        // A pending proposal this family has NOT decided on is ENQUEUED for them
        // directly: they get the camp, and we skip a redundant extraction rather
        // than paying for a Haiku call to rediscover a proposal that exists.
        const sourceRef = `web:${result.url}`
        const { data: existingRef } = await db
          .from('camp_proposals')
          .select('id')
          .eq('source_ref', sourceRef)
          .eq('status', 'pending')

        const existingIds = (existingRef ?? []).map(p => p.id as string)
        if (existingIds.length > 0) {
          const { data: mine } = await db
            .from('camp_proposal_decisions')
            .select('proposal_id')
            .eq('family_id', familyId)
            .in('proposal_id', existingIds)
          const decided = new Set((mine ?? []).map(d => d.proposal_id as string))
          const undecided = existingIds.filter(id => !decided.has(id))

          for (const proposalId of undecided) {
            const { error: enqErr } = await db
              .from('camp_proposal_decisions')
              .insert({ proposal_id: proposalId, family_id: familyId, decision: 'pending' })
            if (!enqErr) stats.proposalsEnqueued++
          }
          stats.proposalsSkipped++
          continue
        }

        try {
          const extracted = await extractCampsFromText({
            text: result.raw_content,
            sourceContext: `Web page: ${result.title} (${result.url})`,
            hostSchoolName: schoolName,
            hostSchoolId: school.id,
            candidateAttendeeSchools: (await candidatesFor(familyId)).filter(s => s.id !== school.id),
            currentDate: today,
          })

          stats.campsExtracted += extracted.length

          for (const camp of extracted) {
            const dedup = await shouldSkipProposal(db, {
              familyId,
              hostSchoolId: school.id,
              startDate: camp.start_date,
              endDate: camp.end_date,
            })

            if (dedup.skip) {
              stats.proposalsSkipped++
              continue
            }

            // Materiality gate: for matched existing camps, only surface if
            // a new tracked school is associated (host or attendee)
            let updateSummary: string | null = null
            if (dedup.matchedCampId) {
              const materiality = await classifyCampUpdate(
                db, dedup.matchedCampId,
                { attendee_school_ids: camp.attendee_school_ids },
                school.id,
              )
              if (!materiality.material) {
                stats.proposalsSkipped++
                continue
              }
              updateSummary = materiality.updateSummary ?? null
            }

            const { error: insertErr } = await db.from('camp_proposals').insert({
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
              update_summary: updateSummary,
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

  const totalEnqueued = perSchool.reduce((sum, s) => sum + s.proposalsEnqueued, 0)

  const summary = {
    ranAt: startedAt,
    familiesScanned: scan.families.length,
    pairsProcessed: entries.length,
    distinctSchools,
    totalProposalsInserted: totalInserted,
    totalEnqueuedForFamily: totalEnqueued,
    totalSkipped,
    totalErrors,
    perSchool: perSchool.filter(s => s.proposalsInserted > 0 || s.errors > 0),
  }

  console.log(`[camp-discovery] ${startedAt} — done: ${totalInserted} inserted, ${totalEnqueued} enqueued for a family, ${totalSkipped} skipped, ${totalErrors} errors across ${entries.length} (family, school) pair(s)`)

  const errorsPerSchool = perSchool.filter(s => s.errors > 0).map(s => ({
    school: s.schoolName,
    family: s.familyName,
    errors: s.errors,
  }))

  await completeRun(
    runDb, runId,
    errorsPerSchool.length > 0 ? 'partial' : 'success',
    {
      families_scanned: scan.families.length,
      pairs_processed: entries.length,
      distinct_schools: distinctSchools,
      schools_searched: entries.length,
      tavily_calls: perSchool.reduce((sum, s) => sum + (s.tavilyResults > 0 ? 1 : 0), 0),
      camps_extracted: perSchool.reduce((sum, s) => sum + s.campsExtracted, 0),
      proposals_inserted: totalInserted,
      proposals_enqueued_for_family: totalEnqueued,
      proposals_skipped: totalSkipped,
      errors_per_school: errorsPerSchool,
    }
  )

  return NextResponse.json(summary)
}

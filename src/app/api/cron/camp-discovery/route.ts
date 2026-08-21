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
import { startRun, completeRun } from '@/lib/cron-runs'
import { buildFamilyScanSet, distinctTargets, interleaveByFamily } from '@/lib/cron-scan-set'
import { fetchAll } from '@/lib/fetch-all'
import { orderByBookmark, runWithBudget, stampScanned, DEFAULT_BUDGET_MS } from '@/lib/scan-budget'
import { campHostIdFor } from '@/lib/camp-host'

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
  // The budget is measured from the top of the request, not from the start of
  // the loop: the scan-set build is part of the 300s too.
  const startedAtMs = Date.now()

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
  interface ScanSchool {
    id: string; name: string; short_name: string | null; category: string
    /** Carried so camp dedup can match on either id form across E1.5's
     *  re-point — see camp-host.ts. */
    discovery_school_id: string | null
    // THE BOOKMARK. It lives on schools because schools is family-scoped, so the
    // grain is (family, school) — which is TEMPORARY. Two families tracking
    // Middlebury run two identical searches today, so this cost scales with
    // FAMILIES rather than with the world. When camps move to the catalog
    // (E1.5/E2) the scan unit becomes the DISTINCT SCHOOL and this bookmark
    // migrates to discovery_schools.camp_scan_last_at. The ordering and budget
    // logic in scan-budget.ts is grain-indifferent precisely so that migration
    // is a change here and nowhere else.
    camp_scan_last_at: string | null
  }
  let scan
  try {
    scan = await buildFamilyScanSet<ScanSchool>(
      'id, name, short_name, category, camp_scan_last_at, discovery_school_id',
      q => q.in('category', ['A', 'B', 'C']).neq('status', 'Inactive'),
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load scan set'
    console.error(`[camp-discovery] ${startedAt} — scan set failed: ${message}`)
    await completeRun(runDb, runId, 'failed', {}, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // ORDER: least-recently-scanned first, so a run that covers half the set
  // leaves the other half at the FRONT of the next run's queue. This replaces
  // the run-counter rotation — a bookmark responds to what actually completed
  // rather than assuming a fixed stride. Interleaving is kept as the tie-break
  // shape for the never-scanned block, where every bookmark is null and the
  // order would otherwise be all of one family then all of the next.
  const entries = orderByBookmark(interleaveByFamily(scan.entries), e => e.school.camp_scan_last_at)
  const distinctSchools = distinctTargets(entries, s => s.short_name || s.name)
  const duplicatedWork = entries.length - distinctSchools
  console.log(
    `[camp-discovery] ${startedAt} — scan set: ${entries.length} (family, school) pair(s) ` +
    `across ${scan.families.length} family(ies); ${distinctSchools} distinct school(s); ` +
    `${duplicatedWork} duplicated external search(es). ` +
    `THE DUPLICATION SERIES: this gap is what moving camps to the catalog would remove — ` +
    `recorded every run so the answer exists before it is needed.`
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

  // RESUMABLE: stop BEFORE the ceiling rather than being killed at it. A run
  // that stops has still made progress, stamped what it finished, and says how
  // much is left — which is what makes a completed-partial run distinguishable
  // from a killed one.
  const budget = await runWithBudget(entries, async (entry, i) => {
    if (i > 0) await sleep(2000)

    const { familyId, familyName, school } = entry
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
              hostDiscoverySchoolId: school.discovery_school_id,
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
              // Re-points with camps at E1.5 — see camp-host.ts.
              host_school_id: campHostIdFor(school),
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

    // Stamped AFTER the unit completes, so a unit cut off mid-flight keeps its
    // old bookmark and leads the next run's queue. Table and column are passed
    // explicitly — at E1.5/E2 this becomes discovery_schools and nothing else
    // in the budget layer changes.
    await stampScanned(db, 'schools', school.id, 'camp_scan_last_at')

    perSchool.push(stats)
    totalInserted += stats.proposalsInserted
    totalSkipped += stats.proposalsSkipped
    totalErrors += stats.errors

    if (stats.proposalsInserted > 0 || stats.errors > 0) {
      console.log(`[camp-discovery] ${schoolName}: +${stats.proposalsInserted} proposals, ${stats.proposalsSkipped} skipped, ${stats.errors} errors`)
    }
  }, { budgetMs: DEFAULT_BUDGET_MS, startedAtMs })

  if (budget.stoppedEarly) {
    console.warn(
      `[camp-discovery] ${startedAt} — STOPPED ON BUDGET after ${budget.processed} of ${entries.length} pair(s), ` +
      `${budget.remaining} remaining, ${(budget.elapsedMs / 1000).toFixed(0)}s elapsed, ` +
      `~${(budget.meanUnitMs / 1000).toFixed(1)}s per pair. The remainder leads the next run by bookmark.`
    )
  }

  const totalEnqueued = perSchool.reduce((sum, s) => sum + s.proposalsEnqueued, 0)

  const summary = {
    ranAt: startedAt,
    familiesScanned: scan.families.length,
    pairsInScanSet: entries.length,
    pairsProcessed: budget.processed,
    pairsRemaining: budget.remaining,
    stoppedEarly: budget.stoppedEarly,
    elapsedSeconds: Math.round(budget.elapsedMs / 1000),
    meanSecondsPerPair: Number((budget.meanUnitMs / 1000).toFixed(1)),
    distinctSchools,
    duplicatedWork,
    totalProposalsInserted: totalInserted,
    totalEnqueuedForFamily: totalEnqueued,
    totalSkipped,
    totalErrors,
    perSchool: perSchool.filter(s => s.proposalsInserted > 0 || s.errors > 0),
  }

  console.log(`[camp-discovery] ${startedAt} — done: ${totalInserted} inserted, ${totalEnqueued} enqueued for a family, ${totalSkipped} skipped, ${totalErrors} errors across ${budget.processed} of ${entries.length} (family, school) pair(s)${budget.stoppedEarly ? ` — PARTIAL, ${budget.remaining} remaining` : ''}`)

  const errorsPerSchool = perSchool.filter(s => s.errors > 0).map(s => ({
    school: s.schoolName,
    family: s.familyName,
    errors: s.errors,
  }))

  // Three outcomes, three distinguishable records: 'success' means the whole
  // scan set was covered; 'partial' means we stopped on budget (or a school
  // errored) and says how much is left; a run KILLED anyway stays 'running' and
  // is reaped to 'failed' by the next run. Killed and stopped-early must never
  // look alike — that is the defect underneath the timeout.
  await completeRun(
    runDb, runId,
    (budget.stoppedEarly || errorsPerSchool.length > 0) ? 'partial' : 'success',
    {
      families_scanned: scan.families.length,
      pairs_in_scan_set: entries.length,
      pairs_processed: budget.processed,
      pairs_remaining: budget.remaining,
      stopped_early: budget.stoppedEarly,
      elapsed_seconds: Math.round(budget.elapsedMs / 1000),
      mean_seconds_per_pair: Number((budget.meanUnitMs / 1000).toFixed(1)),
      distinct_schools: distinctSchools,
      // THE DUPLICATION SERIES — pairs minus distinct schools, recorded every
      // run. Today it is near zero and says nothing; at ten families it is the
      // number that says how much moving camps to the catalog would buy.
      duplicated_work: duplicatedWork,
      schools_searched: budget.processed,
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

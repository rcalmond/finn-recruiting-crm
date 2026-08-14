/**
 * /api/cron/summary-refresh
 *
 * Weekly Sunday cron — regenerates stale school_conversation_summary rows
 * for active A/B/C schools where generated_at is older than 7 days.
 *
 * Schedule: Sunday 13:00 UTC (7 AM Mountain Time).
 * Auth: Bearer <CRON_SECRET>.
 */

import { NextRequest, NextResponse } from 'next/server'
import { familyAdmin, ALMOND_FAMILY_ID } from '@/lib/tenant-db'
import { generateConversationSummary } from '@/lib/school-conversation-summary-generator'
import { startRun, completeRun } from '@/lib/cron-runs'

function serviceClient() {
  // TODO(email-boundary): single-mailbox interim — every query pinned to family #1
  // until per-family inbound routing exists. familyAdmin scopes family tables;
  // catalog tables (schools, cron_runs) pass through.
  return familyAdmin(ALMOND_FAMILY_ID) as unknown as ReturnType<typeof familyAdmin>
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function GET(req: NextRequest) {
  const startedAt = new Date().toISOString()

  // Auth guard — an unset secret REFUSES in every environment (never falls open).
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error(`[summary-refresh] ${startedAt} — CRON_SECRET is not configured; refusing`)
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    console.warn(`[summary-refresh] ${startedAt} — rejected: invalid CRON_SECRET`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = serviceClient()
  const runId = await startRun(admin, 'summary-refresh')

  // Load all active A/B/C schools
  const { data: schools, error: schoolsErr } = await admin
    .from('schools')
    .select('id, name, category')
    .in('category', ['A', 'B', 'C'])
    .neq('status', 'Inactive')

  if (schoolsErr || !schools) {
    console.error(`[summary-refresh] ${startedAt} — failed to load schools:`, schoolsErr?.message)
    await completeRun(admin, runId, 'failed', {}, schoolsErr?.message)
    return NextResponse.json({ error: 'Failed to load schools' }, { status: 500 })
  }

  // Load existing summaries to check staleness
  const { data: existingSummaries } = await admin
    .from('school_conversation_summary')
    .select('school_id, generated_at')

  const summaryMap = new Map(
    (existingSummaries ?? []).map((s: { school_id: string; generated_at: string }) => [s.school_id, s.generated_at])
  )

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  let schoolsChecked = 0
  let regenerated = 0
  let skipped = 0
  let failures = 0

  for (const school of schools) {
    schoolsChecked++
    const generatedAt = summaryMap.get(school.id)

    // Skip if summary is fresh (less than 7 days old)
    if (generatedAt && generatedAt > sevenDaysAgo) {
      skipped++
      continue
    }

    try {
      const result = await generateConversationSummary(admin, school.id)
      if (!result) {
        skipped++
        continue
      }

      // Find most recent contact_log id
      const { data: latestRow } = await admin
        .from('contact_log')
        .select('id')
        .eq('school_id', school.id)
        .not('parse_status', 'in', '("orphan","non_coach")')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { error: upsertErr } = await admin
        .from('school_conversation_summary')
        .upsert({
          school_id: school.id,
          summary: result.summary,
          recommended_action: result.recommended_action,
          last_contact_log_id: latestRow?.id ?? null,
          generated_at: new Date().toISOString(),
          model_used: 'claude-opus-4-7',
          input_tokens: result.input_tokens,
          output_tokens: result.output_tokens,
        }, { onConflict: 'school_id,family_id' })

      if (upsertErr) {
        console.error(`[summary-refresh] upsert failed for ${school.name}:`, upsertErr.message)
        failures++
      } else {
        regenerated++
      }
    } catch (err) {
      console.error(`[summary-refresh] generation failed for ${school.name}:`, err)
      failures++
    }

    // Rate limit: 1 call per second
    await sleep(1000)
  }

  const status = failures > 0 ? (regenerated > 0 ? 'partial' : 'failed') : 'success'
  const metadata = { schools_checked: schoolsChecked, regenerated, skipped, failures }

  await completeRun(admin, runId, status, metadata, failures > 0 ? `${failures} failures` : undefined)

  console.log(`[summary-refresh] ${startedAt} — ${status}: checked=${schoolsChecked} regenerated=${regenerated} skipped=${skipped} failures=${failures}`)

  return NextResponse.json({ status, ...metadata })
}

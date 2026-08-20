/**
 * cron-runs.ts
 *
 * Helpers for the cron_runs audit table. Both functions swallow their own
 * errors and log — they should NEVER cause a cron to fail. The audit log
 * is supplementary, not critical-path.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type CronName = 'gmail-sync' | 'coach-roster-sync' | 'camp-discovery' | 'summary-refresh'

/** Longer than any job's maxDuration (300s), short enough that a weekly job's
 *  death is visible the same day rather than at the next scheduled run. */
const STALE_RUN_MINUTES = 60

/**
 * A run that starts and never finishes must not look like a run in progress.
 *
 * When a function is KILLED — timeout, OOM, deploy mid-run — it never reaches
 * completeRun, so its row stays status='running' forever. There is no writer
 * left to record the failure, which is why nothing said so: camp-discovery has
 * three such rows (2026-07-18, 07-25, 08-01) that have read "running" for weeks
 * in a table nobody opens.
 *
 * Nobody can fix that from inside the dying run, so the NEXT run does it: any
 * 'running' row older than the threshold is reclassified as failed with an
 * explicit reason. Killed and completed-partial are now distinguishable, which
 * is the defect underneath the timeout itself.
 */
export async function reapStaleRuns(
  admin: SupabaseClient,
  cronName: CronName,
): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString()
    const { data, error } = await admin
      .from('cron_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: `no completion recorded within ${STALE_RUN_MINUTES}m — presumed killed (timeout, OOM, or deploy mid-run)`,
      })
      .eq('cron_name', cronName)
      .eq('status', 'running')
      .lt('started_at', cutoff)
      .select('id, started_at')

    if (error) {
      console.error(`[cron-runs] stale sweep failed for ${cronName}:`, error.message)
      return 0
    }
    const reaped = (data ?? []) as Array<{ id: string; started_at: string }>
    if (reaped.length > 0) {
      console.error(
        `[cron-runs] ${cronName}: ${reaped.length} PRESUMED-KILLED run(s) reclassified as failed — ` +
        reaped.map(r => r.started_at).join(', ')
      )
    }
    return reaped.length
  } catch (err) {
    console.error(`[cron-runs] stale sweep exception for ${cronName}:`, err)
    return 0
  }
}

/**
 * Insert a 'running' row at the start of a cron job.
 * Returns the row ID (used to complete it later), or empty string on failure.
 */
export async function startRun(
  admin: SupabaseClient,
  cronName: CronName
): Promise<string> {
  // Before claiming a new run, settle the corpses of old ones.
  await reapStaleRuns(admin, cronName)
  try {
    const { data, error } = await admin
      .from('cron_runs')
      .insert({ cron_name: cronName, status: 'running' })
      .select('id')
      .single()

    if (error || !data) {
      console.error(`[cron-runs] startRun failed for ${cronName}:`, error?.message)
      return ''
    }

    return (data as { id: string }).id
  } catch (err) {
    console.error(`[cron-runs] startRun exception for ${cronName}:`, err)
    return ''
  }
}

/**
 * How many times this job has run. Used ONLY as a rotation offset for scan-set
 * fairness — an approximate, monotonic-enough counter is all that needs. Returns
 * 0 on failure, which degrades to "no rotation" rather than to an error.
 */
export async function priorRunCount(
  admin: SupabaseClient,
  cronName: CronName,
): Promise<number> {
  try {
    const { count, error } = await admin
      .from('cron_runs')
      .select('id', { count: 'exact', head: true })
      .eq('cron_name', cronName)
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

/**
 * Mark a cron run as completed with status and metadata.
 * No-op if runId is empty (startRun failed).
 */
export async function completeRun(
  admin: SupabaseClient,
  runId: string,
  status: 'success' | 'partial' | 'failed',
  metadata: Record<string, unknown>,
  error?: string
): Promise<void> {
  if (!runId) return

  try {
    const updates: Record<string, unknown> = {
      completed_at: new Date().toISOString(),
      status,
      metadata,
    }
    if (error !== undefined) updates.error = error

    const { error: updateErr } = await admin
      .from('cron_runs')
      .update(updates)
      .eq('id', runId)

    if (updateErr) {
      console.error(`[cron-runs] completeRun failed for ${runId}:`, updateErr.message)
    }
  } catch (err) {
    console.error(`[cron-runs] completeRun exception for ${runId}:`, err)
  }
}

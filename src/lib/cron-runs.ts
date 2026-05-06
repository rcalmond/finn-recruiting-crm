/**
 * cron-runs.ts
 *
 * Helpers for the cron_runs audit table. Both functions swallow their own
 * errors and log — they should NEVER cause a cron to fail. The audit log
 * is supplementary, not critical-path.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type CronName = 'gmail-sync' | 'coach-roster-sync' | 'camp-discovery'

/**
 * Insert a 'running' row at the start of a cron job.
 * Returns the row ID (used to complete it later), or empty string on failure.
 */
export async function startRun(
  admin: SupabaseClient,
  cronName: CronName
): Promise<string> {
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

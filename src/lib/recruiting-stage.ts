/**
 * recruiting-stage.ts
 *
 * Auto-derived stage floor for the recruiting funnel.
 * Stages 1-3 have an auto-derived floor from contact_log;
 * stages 4-6 are manual-only (require judgment about coach behavior).
 *
 * The floor never demotes: max(floor, current recruiting_stage).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { RecruitingStage } from './types'

/**
 * Computes the auto-derived stage floor for a school:
 *   1 — no contact rows
 *   2 — outbound exists but no substantive inbound
 *   3 — substantive coach inbound exists
 *
 * Returns max(floor, currentStage) — never demotes.
 */
export async function deriveStageFloor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  schoolId: string,
  currentStage: RecruitingStage,
): Promise<RecruitingStage> {
  // Check for substantive coach inbound (floor = 3)
  const { count: inboundCount } = await admin
    .from('contact_log')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('direction', 'Inbound')
    .in('parse_status', ['full', 'partial'])
    .in('authored_by', ['coach_personal', 'coach_via_platform'])
    .limit(1)

  if (inboundCount && inboundCount > 0) {
    return Math.max(3, currentStage) as RecruitingStage
  }

  // Check for any outbound (floor = 2)
  const { count: outboundCount } = await admin
    .from('contact_log')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('direction', 'Outbound')
    .in('parse_status', ['full', 'partial'])
    .limit(1)

  if (outboundCount && outboundCount > 0) {
    return Math.max(2, currentStage) as RecruitingStage
  }

  // No contact — floor = 1
  return currentStage
}

/**
 * Fire-and-forget hook: compute floor and update recruiting_stage if the floor
 * exceeds the stored value. Skips the update when no change needed.
 */
export async function raiseStageFloor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  schoolId: string,
): Promise<void> {
  // Fetch current stage
  const { data } = await admin
    .from('schools')
    .select('recruiting_stage')
    .eq('id', schoolId)
    .single()

  if (!data) return
  const current = (data.recruiting_stage ?? 1) as RecruitingStage

  const floor = await deriveStageFloor(admin, schoolId, current)
  if (floor > current) {
    await admin
      .from('schools')
      .update({ recruiting_stage: floor })
      .eq('id', schoolId)
  }
}

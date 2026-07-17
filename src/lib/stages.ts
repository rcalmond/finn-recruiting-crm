import type { RecruitingStage } from './types'
import { STAGE_META } from './types'

/**
 * Stage labels array for iteration (e.g., rendering dots, filter pills).
 * Derived from the canonical STAGE_META map.
 */
export const STAGE_LABELS = ([1, 2, 3, 4, 5, 6] as RecruitingStage[]).map(s => STAGE_META[s].label)

/**
 * Returns the label for a recruiting stage number.
 */
export function stageLabel(stage: number): string {
  return STAGE_META[stage as RecruitingStage]?.label ?? 'Research'
}

/**
 * @deprecated Use school.recruiting_stage directly. This function existed when
 * stage was derived from school.status at render time. Kept temporarily for
 * the SchoolsClient stage filter which still reads the status field.
 */
export function deriveStage(school: { status: string }): number {
  const map: Record<string, number> = {
    'Not Contacted':        1,
    'Intro Sent':           2,
    'Ongoing Conversation': 3,
    'Visit Scheduled':      4,
    'Offer':                5,
    'Inactive':             0,
  }
  return map[school.status] ?? 1
}

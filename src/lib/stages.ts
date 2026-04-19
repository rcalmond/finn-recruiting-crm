import type { School, Status } from './types'

export const STAGE_LABELS = ['Identify', 'Reach out', 'Engage', 'Visit', 'Offer', 'Decide'] as const
export type StageName = typeof STAGE_LABELS[number]

const STATUS_TO_STAGE: Record<Status, number> = {
  'Not Contacted':        1, // Identify
  'Intro Sent':           2, // Reach out
  'Ongoing Conversation': 3, // Engage
  'Visit Scheduled':      4, // Visit
  'Offer':                5, // Offer
  'Inactive':             0, // Should be filtered before calling deriveStage
}

/**
 * Maps a school's status field to a 1-6 stage number.
 * Returns 1 (Identify) as a safe default for any unknown status.
 */
export function deriveStage(school: Pick<School, 'status'>): number {
  return STATUS_TO_STAGE[school.status] ?? 1
}

export function stageLabel(stage: number): string {
  return STAGE_LABELS[Math.max(0, stage - 1)] ?? 'Identify'
}

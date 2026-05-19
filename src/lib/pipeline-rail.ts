/**
 * pipeline-rail.ts
 *
 * Data layer for the Pipeline Activity rail on the Today page.
 * Filters active Tier A/B schools, classifies each into a pipeline
 * status (HOT / ACTIVE), sorts by status priority then recency,
 * and caps at 5 per bucket (10 total).
 *
 * HOT: unreplied coach-personal inbound within 60 days
 * ACTIVE: most recent contact < 14 days old (no outstanding reply)
 *
 * WARMING and COLD are excluded from the widget — they aren't
 * actionable enough to surface on the Today page.
 */

import type { School, ContactLogEntry } from './types'
import { isAwaitingReply } from './awaiting-reply'

// ─── Types ───────────────────────────────────────────────────────────────────

export type PipelineStatus = 'HOT' | 'ACTIVE' | 'WARMING' | 'COLD'

export interface PipelineSchool {
  school: School
  status: PipelineStatus
  /** Most recent contact_log sent_at (any direction), or null if no contact. */
  lastContactAt: string | null
}

// ─── Status classification ───────────────────────────────────────────────────

const STATUS_PRIORITY: Record<PipelineStatus, number> = {
  HOT: 0,
  ACTIVE: 1,
  WARMING: 2,
  COLD: 3,
}

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000

/**
 * Classify a school into a pipeline status.
 *
 * HOT:     has an unreplied coach-personal inbound within the last 60 days
 *          (authored_by must be coach_personal or coach_via_platform —
 *          filters out team_automated camp blasts and staff_non_coach noise)
 * ACTIVE:  most recent contact_log entry is < 14d old
 * WARMING: most recent contact is 14–30d old
 * COLD:    most recent contact is > 30d old, or no contact at all
 */
function classifySchool(
  school: School,
  entriesForSchool: ContactLogEntry[],
): PipelineStatus {
  const now = Date.now()
  const sixtyDaysAgo = now - SIXTY_DAYS_MS

  // HOT: has any unreplied coach-personal inbound within 60 days
  const hasAwaiting = entriesForSchool.some(e =>
    e.direction === 'Inbound' &&
    (e.authored_by === 'coach_personal' || e.authored_by === 'coach_via_platform') &&
    new Date(e.sent_at).getTime() >= sixtyDaysAgo &&
    isAwaitingReply(e, entriesForSchool)
  )
  if (hasAwaiting) return 'HOT'

  // Recency-based classification
  if (entriesForSchool.length === 0) return 'COLD'

  const mostRecent = entriesForSchool.reduce((latest, e) =>
    e.sent_at > latest.sent_at ? e : latest
  )

  const daysSince = (now - new Date(mostRecent.sent_at).getTime()) / (24 * 60 * 60 * 1000)

  if (daysSince < 14) return 'ACTIVE'
  if (daysSince <= 30) return 'WARMING'
  return 'COLD'
}

// ─── Main function ───────────────────────────────────────────────────────────

/**
 * Build the pipeline rail data: filter, classify, sort, cap per bucket.
 *
 * Only HOT and ACTIVE are surfaced. Per-bucket cap: 5 each (10 total max).
 */
export function getPipelineSchools(
  schools: School[],
  contactLog: ContactLogEntry[],
): PipelineSchool[] {
  // Filter: active Tier A + B only
  const abActive = schools.filter(s =>
    (s.category === 'A' || s.category === 'B') && s.status !== 'Inactive'
  )

  // Build per-school entry map — exclude orphan and non_coach rows (defense in depth)
  const bySchool = new Map<string, ContactLogEntry[]>()
  for (const e of contactLog) {
    if (!e.school_id) continue
    if (e.parse_status === 'orphan' || e.parse_status === 'non_coach') continue
    if (!bySchool.has(e.school_id)) bySchool.set(e.school_id, [])
    bySchool.get(e.school_id)!.push(e)
  }

  // Classify each school
  const items: PipelineSchool[] = abActive.map(school => {
    const entries = bySchool.get(school.id) ?? []
    const status = classifySchool(school, entries)

    // Find most recent contact
    let lastContactAt: string | null = null
    if (entries.length > 0) {
      lastContactAt = entries.reduce((latest, e) =>
        e.sent_at > latest.sent_at ? e : latest
      ).sent_at
    }

    return { school, status, lastContactAt }
  })

  // Sort: status priority, then most recent contact first within group
  items.sort((a, b) => {
    const sp = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]
    if (sp !== 0) return sp

    // Within same status: most recent contact first (null = last)
    if (a.lastContactAt && b.lastContactAt) return b.lastContactAt.localeCompare(a.lastContactAt)
    if (a.lastContactAt) return -1
    if (b.lastContactAt) return 1
    return 0
  })

  // Per-bucket caps: HOT max 5, ACTIVE max 5. WARMING/COLD excluded.
  const hot = items.filter(i => i.status === 'HOT').slice(0, 5)
  const active = items.filter(i => i.status === 'ACTIVE').slice(0, 5)

  return [...hot, ...active]
}

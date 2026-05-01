/**
 * pipeline-rail.ts
 *
 * Data layer for the Pipeline Activity rail on the Today page.
 * Filters active Tier A/B schools, classifies each into a pipeline
 * status (HOT / ACTIVE / WARMING / COLD), sorts by status priority
 * then recency, and caps at 10 visible.
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

/**
 * Classify a school into a pipeline status.
 *
 * HOT:     has any unreplied inbound (via isAwaitingReply — matches masthead "active" count)
 * ACTIVE:  most recent contact_log entry is < 14d old
 * WARMING: most recent contact is 14–30d old
 * COLD:    most recent contact is > 30d old, or no contact at all
 */
function classifySchool(
  school: School,
  entriesForSchool: ContactLogEntry[],
): PipelineStatus {
  // HOT: has any unreplied inbound
  const hasAwaiting = entriesForSchool.some(e =>
    e.direction === 'Inbound' && isAwaitingReply(e, entriesForSchool)
  )
  if (hasAwaiting) return 'HOT'

  // Recency-based classification
  if (entriesForSchool.length === 0) return 'COLD'

  const mostRecent = entriesForSchool.reduce((latest, e) =>
    e.sent_at > latest.sent_at ? e : latest
  )

  const daysSince = (Date.now() - new Date(mostRecent.sent_at).getTime()) / (24 * 60 * 60 * 1000)

  if (daysSince < 14) return 'ACTIVE'
  if (daysSince <= 30) return 'WARMING'
  return 'COLD'
}

// ─── Main function ───────────────────────────────────────────────────────────

/**
 * Build the pipeline rail data: filter, classify, sort, cap at 10.
 */
export function getPipelineSchools(
  schools: School[],
  contactLog: ContactLogEntry[],
): PipelineSchool[] {
  // Filter: active Tier A + B only
  const abActive = schools.filter(s =>
    (s.category === 'A' || s.category === 'B') && s.status !== 'Inactive'
  )

  // Build per-school entry map
  const bySchool = new Map<string, ContactLogEntry[]>()
  for (const e of contactLog) {
    if (!e.school_id) continue
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

  // Cap at 10
  return items.slice(0, 10)
}

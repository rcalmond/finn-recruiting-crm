/**
 * pipeline-rail.ts
 *
 * Data layer for the Pipeline Activity rail on the Today page.
 * Delegates to classifySchoolRecency (school-recency-state.ts) for
 * canonical state classification, then applies the widget's own
 * tier filter (A/B only) and bucket caps.
 *
 * HOT: unreplied coach-personal inbound within 60 days
 * ACTIVE: most recent contact < 14 days old (no outstanding reply)
 *
 * COOLING, COLD, PROSPECTING, DECLINED are excluded from the widget
 * — they aren't actionable enough to surface on the Today page.
 *
 * Note: the classifier supports A/B/C tiers. The widget intentionally
 * applies its own A/B-only filter on top. Classifier is canonical;
 * widget is opinionated about what it surfaces.
 */

import type { School, ContactLogEntry } from './types'
import { classifySchoolRecency } from './school-recency-state'

// ─── Types ───────────────────────────────────────────────────────────────────

export type PipelineStatus = 'HOT' | 'ACTIVE' | 'WARMING' | 'COLD'

export interface PipelineSchool {
  school: School
  status: PipelineStatus
  /** Most recent contact_log sent_at (any direction), or null if no contact. */
  lastContactAt: string | null
}

export interface PipelineBucket {
  status: PipelineStatus
  schools: PipelineSchool[]   // capped at BUCKET_CAP
  totalCount: number          // total before cap
}

// ─── Status classification ───────────────────────────────────────────────────

const STATUS_PRIORITY: Record<PipelineStatus, number> = {
  HOT: 0,
  ACTIVE: 1,
  WARMING: 2,
  COLD: 3,
}

const BUCKET_CAP = 8

/**
 * Map unified recency state to pipeline widget buckets.
 */
function recencyToPipelineStatus(
  school: School,
  contactLog: ContactLogEntry[],
): PipelineStatus {
  const result = classifySchoolRecency(school, contactLog)

  switch (result.state) {
    case 'hot': return 'HOT'
    case 'active': return 'ACTIVE'
    case 'cooling': return 'WARMING'
    default: return 'COLD'
  }
}

// ─── Main function ───────────────────────────────────────────────────────────

/**
 * Build the pipeline rail data: filter, classify, sort, cap per bucket.
 *
 * Only HOT and ACTIVE are surfaced. Per-bucket cap: 8 each.
 * Returns buckets with totalCount so the widget can render "+N more".
 */
export function getPipelineSchools(
  schools: School[],
  contactLog: ContactLogEntry[],
): PipelineBucket[] {
  // Filter: active Tier A + B only (widget's own tier filter)
  const abActive = schools.filter(s =>
    (s.category === 'A' || s.category === 'B') && s.status !== 'Inactive'
  )

  // Classify each school
  const items: PipelineSchool[] = abActive.map(school => {
    const status = recencyToPipelineStatus(school, contactLog)

    // Find most recent contact (excluding orphan/non_coach, matching classifier)
    const schoolEntries = contactLog.filter(e =>
      e.school_id === school.id &&
      e.parse_status !== 'orphan' &&
      e.parse_status !== 'non_coach'
    )
    let lastContactAt: string | null = null
    if (schoolEntries.length > 0) {
      lastContactAt = schoolEntries.reduce((latest, e) =>
        e.sent_at > latest.sent_at ? e : latest
      ).sent_at
    }

    return { school, status, lastContactAt }
  })

  // Sort: most recent contact first within each status group
  items.sort((a, b) => {
    if (a.lastContactAt && b.lastContactAt) return b.lastContactAt.localeCompare(a.lastContactAt)
    if (a.lastContactAt) return -1
    if (b.lastContactAt) return 1
    return 0
  })

  // Build buckets: HOT and ACTIVE only, capped at BUCKET_CAP
  const hotAll = items.filter(i => i.status === 'HOT')
  const activeAll = items.filter(i => i.status === 'ACTIVE')

  const buckets: PipelineBucket[] = []

  if (hotAll.length > 0) {
    buckets.push({
      status: 'HOT',
      schools: hotAll.slice(0, BUCKET_CAP),
      totalCount: hotAll.length,
    })
  }

  if (activeAll.length > 0) {
    buckets.push({
      status: 'ACTIVE',
      schools: activeAll.slice(0, BUCKET_CAP),
      totalCount: activeAll.length,
    })
  }

  return buckets
}

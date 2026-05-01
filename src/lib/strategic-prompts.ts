/**
 * strategic-prompts.ts
 *
 * Computes the 4 hardcoded strategic prompts for Today's "Think · This week" section.
 * Each prompt reads from live DB data and returns a count + summary.
 * Top 3 by relevance score surface in the UI.
 */

import type { School, ContactLogEntry } from './types'
import { daysBetween } from './utils'

// ─── Types ───────────────────────────────────────────────────────────────────

export type PromptKey = 'reel_coverage' | 'rq_refresh' | 'stale_tier_a' | 'pipeline_shape'

export interface StrategicPrompt {
  key: PromptKey
  question: string
  summary: string
  count: number
  total: number
  resolved: boolean
  actionLabel: string
  actionKey: string          // used by UI to determine action type
  affectedSchoolIds: string[] // for modal/batch flow
  relevanceScore: number
  skippedThisWeek: boolean
}

// ─── Week boundary ───────────────────────────────────────────────────────────

/** Get the most recent Sunday in Mountain time as YYYY-MM-DD.
 *  Uses Intl.DateTimeFormat for timezone-safe conversion (works on Vercel serverless in UTC). */
export function getCurrentWeekStart(): string {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short',
  })
  const parts = fmt.formatToParts(now)
  const year = parts.find(p => p.type === 'year')!.value
  const month = parts.find(p => p.type === 'month')!.value
  const day = parts.find(p => p.type === 'day')!.value
  const weekday = parts.find(p => p.type === 'weekday')!.value

  const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday)

  // Subtract dayOfWeek days from current MT date (noon UTC avoids DST edge cases)
  const currentMT = new Date(`${year}-${month}-${day}T12:00:00Z`)
  currentMT.setUTCDate(currentMT.getUTCDate() - dayOfWeek)

  return currentMT.toISOString().split('T')[0]
}

function sentAtToMountainDate(sentAt: string): string {
  return new Date(sentAt).toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tierAB(s: School): boolean {
  return s.category === 'A' || s.category === 'B'
}

function isActive(s: School): boolean {
  return s.category !== 'Nope' && s.status !== 'Inactive'
}

// ─── Prompt computations ─────────────────────────────────────────────────────

export function computeReelCoverage(
  schools: School[],
  currentReelUrl: string | null,
  batchSentSchoolIds: Set<string> = new Set()
): Pick<StrategicPrompt, 'count' | 'total' | 'affectedSchoolIds' | 'relevanceScore'> {
  if (!currentReelUrl) return { count: 0, total: 0, affectedSchoolIds: [], relevanceScore: 0 }

  const abSchools = schools.filter(s => tierAB(s) && isActive(s))
  // A school is covered if: last_video_url matches current reel OR it has a batch_reel_send for the current reel
  const affected = abSchools.filter(s =>
    (!s.last_video_url || s.last_video_url !== currentReelUrl) && !batchSentSchoolIds.has(s.id)
  )

  return {
    count: affected.length,
    total: abSchools.length,
    affectedSchoolIds: affected.map(s => s.id),
    relevanceScore: abSchools.length > 0 ? affected.length / abSchools.length : 0,
  }
}

export function computeRqRefresh(
  schools: School[]
): Pick<StrategicPrompt, 'count' | 'total' | 'affectedSchoolIds' | 'relevanceScore'> {
  const abSchools = schools.filter(s => tierAB(s) && isActive(s))
  const sixtyDaysAgo = new Date()
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
  const cutoff = sixtyDaysAgo.toISOString()

  const affected = abSchools.filter(s =>
    s.rq_status !== 'Completed' ||
    !s.rq_updated_at ||
    s.rq_updated_at < cutoff
  )

  return {
    count: affected.length,
    total: abSchools.length,
    affectedSchoolIds: affected.map(s => s.id),
    relevanceScore: abSchools.length > 0 ? affected.length / abSchools.length : 0,
  }
}

export function computeStaleTierA(
  schools: School[],
  contactLog: ContactLogEntry[],
  excludeSchoolIds: Set<string> = new Set()
): Pick<StrategicPrompt, 'count' | 'total' | 'affectedSchoolIds' | 'relevanceScore'> {
  const tierA = schools.filter(s => s.category === 'A' && isActive(s) && !excludeSchoolIds.has(s.id))

  // Build most-recent outbound sent_at per school
  const lastOutbound = new Map<string, string>()
  for (const e of contactLog) {
    if (e.direction !== 'Outbound' || !e.school_id) continue
    const existing = lastOutbound.get(e.school_id)
    if (!existing || e.sent_at > existing) lastOutbound.set(e.school_id, e.sent_at)
  }

  const affected = tierA.filter(s => {
    const lastSent = lastOutbound.get(s.id)
    if (!lastSent) return true // never contacted
    return daysBetween(sentAtToMountainDate(lastSent)) > 30
  })

  return {
    count: affected.length,
    total: tierA.length,
    affectedSchoolIds: affected.map(s => s.id),
    relevanceScore: affected.length > 0 ? Math.min(affected.length / 8, 1.0) * 1.5 : 0,
  }
}

export function computePipelineShape(
  schools: School[]
): Pick<StrategicPrompt, 'count' | 'total' | 'affectedSchoolIds' | 'relevanceScore'> {
  const active = schools.filter(isActive)
  const a = active.filter(s => s.category === 'A').length
  const b = active.filter(s => s.category === 'B').length

  const shouldSurface = a < 8 || b < 6
  return {
    count: shouldSurface ? 1 : 0, // binary: surfaces or not
    total: active.length,
    affectedSchoolIds: [], // no specific schools — this is a meta-prompt
    relevanceScore: a < 8 ? 1.0 : b < 6 ? 0.5 : 0,
  }
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export function getStrategicPrompts(
  schools: School[],
  contactLog: ContactLogEntry[],
  currentReelUrl: string | null,
  skippedKeys: Set<string>,
  tacticalSchoolIds: Set<string> = new Set(),
  batchSentSchoolIds: Set<string> = new Set()
): StrategicPrompt[] {
  const a = schools.filter(s => s.category === 'A' && isActive(s)).length
  const b = schools.filter(s => s.category === 'B' && isActive(s)).length
  const c = schools.filter(s => s.category === 'C' && isActive(s)).length

  const reel = computeReelCoverage(schools, currentReelUrl, batchSentSchoolIds)
  const rq = computeRqRefresh(schools)
  const stale = computeStaleTierA(schools, contactLog, tacticalSchoolIds)
  const pipeline = computePipelineShape(schools)

  const prompts: StrategicPrompt[] = [
    {
      key: 'reel_coverage',
      question: 'Have your target schools seen your latest reel?',
      summary: `${reel.count} of ${reel.total} Tier A/B schools need your latest reel`,
      actionLabel: 'Send latest reel',
      actionKey: 'batch_reel',
      ...reel,
      resolved: false,
      skippedThisWeek: skippedKeys.has('reel_coverage'),
    },
    {
      key: 'rq_refresh',
      question: 'Time to update some RQs?',
      summary: `${rq.count} Tier A/B schools have RQs that need attention`,
      actionLabel: 'View list',
      actionKey: 'school_list',
      ...rq,
      resolved: false,
      skippedThisWeek: skippedKeys.has('rq_refresh'),
    },
    {
      key: 'stale_tier_a',
      question: 'Some Tier A schools have gone quiet?',
      summary: `${stale.count} Tier A school${stale.count !== 1 ? 's' : ''} haven't heard from you in 30+ days`,
      actionLabel: 'View list',
      actionKey: 'school_list',
      ...stale,
      resolved: false,
      skippedThisWeek: skippedKeys.has('stale_tier_a'),
    },
    {
      key: 'pipeline_shape',
      question: 'Your school list is light on backups',
      summary: `${a} Tier A · ${b} Tier B · ${c} Tier C`,
      actionLabel: 'Add schools',
      actionKey: 'add_schools',
      ...pipeline,
      resolved: false,
      skippedThisWeek: skippedKeys.has('pipeline_shape'),
    },
  ]

  // Only surface prompts with real issues (count > 0, score > 0), not skipped, top 3
  return prompts
    .filter(p => !p.skippedThisWeek && p.count > 0 && p.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 3)
}

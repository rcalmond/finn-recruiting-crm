/**
 * ingestion-health.ts
 *
 * Checks health of all ingestion pipelines for the Today page banner.
 * Returns an array of source health checks — currently Gmail + SendGrid.
 * Adding a third source is trivial: add a new check function and include
 * it in getIngestionHealth().
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'

export interface SourceHealth {
  source: 'gmail' | 'sendgrid' | 'coach-scraper' | 'camp-discovery'
  isHealthy: boolean
  severity: 'none' | 'warning' | 'critical'
  lastEventAt: string | null     // ISO timestamp
  hoursStale: number | null
  message: string
  actionLabel?: string
  actionUrl?: string
}

function makeAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── Gmail health ────────────────────────────────────────────────────────────
// Thresholds: < 24h healthy, 24-72h warning, > 72h critical

async function checkGmail(): Promise<SourceHealth> {
  try {
    const admin = makeAdmin()
    const { data } = await admin
      .from('gmail_tokens')
      .select('last_sync_at')
      .limit(1)
      .maybeSingle()

    if (!data) {
      return {
        source: 'gmail', isHealthy: false, severity: 'critical',
        lastEventAt: null, hoursStale: null,
        message: 'Gmail not connected — coach emails are not being ingested',
        actionLabel: 'Reconnect', actionUrl: '/settings/gmail',
      }
    }

    if (!data.last_sync_at) {
      return {
        source: 'gmail', isHealthy: false, severity: 'critical',
        lastEventAt: null, hoursStale: null,
        message: 'Gmail connected but has never synced',
        actionLabel: 'Reconnect', actionUrl: '/settings/gmail',
      }
    }

    const hours = (Date.now() - new Date(data.last_sync_at).getTime()) / (1000 * 60 * 60)

    if (hours < 24) {
      return {
        source: 'gmail', isHealthy: true, severity: 'none',
        lastEventAt: data.last_sync_at, hoursStale: Math.round(hours),
        message: 'Gmail sync healthy',
      }
    }

    const label = hours < 48
      ? `${Math.round(hours)} hours ago`
      : `${Math.round(hours / 24)} days ago`
    const severity = hours < 72 ? 'warning' as const : 'critical' as const

    return {
      source: 'gmail', isHealthy: false, severity,
      lastEventAt: data.last_sync_at, hoursStale: Math.round(hours),
      message: `Gmail sync stale — last successful sync ${label}`,
      actionLabel: 'Reconnect', actionUrl: '/settings/gmail',
    }
  } catch {
    return {
      source: 'gmail', isHealthy: true, severity: 'none',
      lastEventAt: null, hoursStale: null,
      message: 'Health check failed (non-blocking)',
    }
  }
}

// ─── SendGrid health ─────────────────────────────────────────────────────────
// Thresholds: < 7d healthy, 7-14d warning, > 14d critical

async function checkSendGrid(): Promise<SourceHealth> {
  try {
    const admin = makeAdmin()

    // Most recent contact_log row from SendGrid (not Gmail, not manual)
    const { data } = await admin
      .from('contact_log')
      .select('created_at')
      .is('gmail_message_id', null)
      .not('parse_status', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data) {
      return {
        source: 'sendgrid', isHealthy: false, severity: 'warning',
        lastEventAt: null, hoursStale: null,
        message: 'No SendGrid events found — verify webhook if SR is active',
        actionLabel: 'Open SendGrid dashboard', actionUrl: 'https://app.sendgrid.com/',
      }
    }

    const hours = (Date.now() - new Date(data.created_at).getTime()) / (1000 * 60 * 60)
    const days = Math.round(hours / 24)

    if (hours < 7 * 24) {
      return {
        source: 'sendgrid', isHealthy: true, severity: 'none',
        lastEventAt: data.created_at, hoursStale: Math.round(hours),
        message: 'SendGrid webhook healthy',
      }
    }

    const severity = hours < 14 * 24 ? 'warning' as const : 'critical' as const
    const message = severity === 'warning'
      ? `No SendGrid events in ${days} days — verify webhook if SR is active`
      : `No SendGrid events in ${days} days — webhook may be broken`

    return {
      source: 'sendgrid', isHealthy: false, severity,
      lastEventAt: data.created_at, hoursStale: Math.round(hours),
      message,
      actionLabel: 'Open SendGrid dashboard', actionUrl: 'https://app.sendgrid.com/',
    }
  } catch {
    return {
      source: 'sendgrid', isHealthy: true, severity: 'none',
      lastEventAt: null, hoursStale: null,
      message: 'Health check failed (non-blocking)',
    }
  }
}

// ─── Coach scraper health ───────────────────────────────────────────────────
// Thresholds: < 5d healthy, 5-10d warning, > 10d critical

async function checkCoachScraper(): Promise<SourceHealth> {
  try {
    const admin = makeAdmin()
    const { data } = await admin
      .from('cron_runs')
      .select('completed_at')
      .eq('cron_name', 'coach-roster-sync')
      .in('status', ['success', 'partial'])
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data || !data.completed_at) {
      return {
        source: 'coach-scraper', isHealthy: false, severity: 'warning',
        lastEventAt: null, hoursStale: null,
        message: 'Coach scraper has never completed a run',
        actionLabel: 'View coach changes', actionUrl: '/settings/coach-changes',
      }
    }

    const hours = (Date.now() - new Date(data.completed_at).getTime()) / (1000 * 60 * 60)
    const days = Math.round(hours / 24)

    if (hours < 5 * 24) {
      return {
        source: 'coach-scraper', isHealthy: true, severity: 'none',
        lastEventAt: data.completed_at, hoursStale: Math.round(hours),
        message: 'Coach scraper healthy',
      }
    }

    const severity = hours < 10 * 24 ? 'warning' as const : 'critical' as const
    return {
      source: 'coach-scraper', isHealthy: false, severity,
      lastEventAt: data.completed_at, hoursStale: Math.round(hours),
      message: `Coach scraper stale — last run ${days} days ago`,
      actionLabel: 'View coach changes', actionUrl: '/settings/coach-changes',
    }
  } catch {
    return {
      source: 'coach-scraper', isHealthy: true, severity: 'none',
      lastEventAt: null, hoursStale: null,
      message: 'Health check failed (non-blocking)',
    }
  }
}

// ─── Camp discovery health ──────────────────────────────────────────────────
// Thresholds: < 10d healthy, 10-21d warning, > 21d critical

async function checkCampDiscovery(): Promise<SourceHealth> {
  try {
    const admin = makeAdmin()
    const { data } = await admin
      .from('cron_runs')
      .select('completed_at')
      .eq('cron_name', 'camp-discovery')
      .in('status', ['success', 'partial'])
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data || !data.completed_at) {
      return {
        source: 'camp-discovery', isHealthy: false, severity: 'warning',
        lastEventAt: null, hoursStale: null,
        message: 'Camp discovery has never completed a run',
        actionLabel: 'View camp proposals', actionUrl: '/settings/camp-proposals',
      }
    }

    const hours = (Date.now() - new Date(data.completed_at).getTime()) / (1000 * 60 * 60)
    const days = Math.round(hours / 24)

    if (hours < 10 * 24) {
      return {
        source: 'camp-discovery', isHealthy: true, severity: 'none',
        lastEventAt: data.completed_at, hoursStale: Math.round(hours),
        message: 'Camp discovery healthy',
      }
    }

    const severity = hours < 21 * 24 ? 'warning' as const : 'critical' as const
    return {
      source: 'camp-discovery', isHealthy: false, severity,
      lastEventAt: data.completed_at, hoursStale: Math.round(hours),
      message: `Camp discovery stale — last run ${days} days ago`,
      actionLabel: 'View camp proposals', actionUrl: '/settings/camp-proposals',
    }
  } catch {
    return {
      source: 'camp-discovery', isHealthy: true, severity: 'none',
      lastEventAt: null, hoursStale: null,
      message: 'Health check failed (non-blocking)',
    }
  }
}

// ─── Combined ────────────────────────────────────────────────────────────────

export async function getIngestionHealth(): Promise<SourceHealth[]> {
  return Promise.all([checkGmail(), checkSendGrid(), checkCoachScraper(), checkCampDiscovery()])
}

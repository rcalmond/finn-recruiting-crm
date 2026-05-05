/**
 * gmail-health.ts
 *
 * Checks Gmail sync health for the Today page banner.
 * Uses service role to read gmail_tokens (RLS blocks anon).
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'

export interface GmailHealth {
  isHealthy: boolean
  lastSyncAt: string | null     // ISO timestamp
  hoursStale: number | null     // hours since last sync
  severity: 'none' | 'warning' | 'critical'
  reason: string
}

// TODO: Add SendGrid webhook health check (no recent webhook events)
// Similar pattern: query most recent contact_log row with source matching
// sendgrid webhook, check recency.

export async function getGmailHealth(): Promise<GmailHealth> {
  try {
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await admin
      .from('gmail_tokens')
      .select('last_sync_at')
      .limit(1)
      .maybeSingle()

    if (error || !data) {
      return {
        isHealthy: false,
        lastSyncAt: null,
        hoursStale: null,
        severity: 'critical',
        reason: 'Gmail not connected — coach emails are not being ingested',
      }
    }

    if (!data.last_sync_at) {
      return {
        isHealthy: false,
        lastSyncAt: null,
        hoursStale: null,
        severity: 'critical',
        reason: 'Gmail connected but has never synced',
      }
    }

    const lastSync = new Date(data.last_sync_at)
    const hoursStale = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60)

    if (hoursStale < 24) {
      return {
        isHealthy: true,
        lastSyncAt: data.last_sync_at,
        hoursStale: Math.round(hoursStale),
        severity: 'none',
        reason: 'Sync healthy',
      }
    }

    if (hoursStale < 72) {
      const label = hoursStale < 48
        ? `${Math.round(hoursStale)} hours ago`
        : `${Math.round(hoursStale / 24)} days ago`
      return {
        isHealthy: false,
        lastSyncAt: data.last_sync_at,
        hoursStale: Math.round(hoursStale),
        severity: 'warning',
        reason: `Gmail sync stale — last successful sync ${label}`,
      }
    }

    const days = Math.round(hoursStale / 24)
    return {
      isHealthy: false,
      lastSyncAt: data.last_sync_at,
      hoursStale: Math.round(hoursStale),
      severity: 'critical',
      reason: `Gmail sync stale — last successful sync ${days} days ago`,
    }
  } catch {
    return {
      isHealthy: true,
      lastSyncAt: null,
      hoursStale: null,
      severity: 'none',
      reason: 'Health check failed (non-blocking)',
    }
  }
}

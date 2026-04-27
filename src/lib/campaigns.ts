/**
 * Campaign-related server-side helpers.
 *
 * Used by ingestion hooks (sendgrid-inbound, gmail-sync) to link
 * outbound contact_log rows back to campaign_schools sends.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * LINKING_WINDOW_MINUTES — maximum age gap between campaign_schools.sent_at
 * and contact_log.created_at for a match. 60 minutes is generous; real-world
 * latency between "Mark as sent" and CC capture is typically under 5 seconds.
 * Tunable — increase if users sometimes delay between marking and actually
 * sending, or decrease to reduce false-positive risk.
 */
const LINKING_WINDOW_MINUTES = 60

/**
 * Attempt to link a newly-ingested outbound contact_log row to a
 * campaign_schools send.
 *
 * Match criteria:
 * - Same school_id
 * - campaign_schools.status = 'sent'
 * - campaign_schools.contact_log_id IS NULL (not already linked)
 * - campaign_schools.sent_at within LINKING_WINDOW_MINUTES of the
 *   contact_log row's created_at
 *
 * If multiple campaign_schools rows match (same school across campaigns),
 * the most recently sent one wins (highest sent_at).
 *
 * Fire-and-forget — never throws. Logs errors and returns silently.
 */
export async function linkOutboundToCampaign(
  admin: SupabaseClient,
  contactLogRowId: string
): Promise<void> {
  try {
    // 1. Fetch the contact_log row
    const { data: row, error: rowErr } = await admin
      .from('contact_log')
      .select('id, school_id, direction, created_at')
      .eq('id', contactLogRowId)
      .single()

    if (rowErr || !row) {
      console.error(`[campaign-link] Failed to fetch contact_log ${contactLogRowId}:`, rowErr?.message)
      return
    }

    // Only link outbound rows with a known school
    if (row.direction !== 'Outbound' || !row.school_id) return

    // 2. Compute the time window
    const createdAt = new Date(row.created_at)
    const windowStart = new Date(createdAt.getTime() - LINKING_WINDOW_MINUTES * 60 * 1000)

    // 3. Find matching campaign_schools row
    const { data: candidates, error: csErr } = await admin
      .from('campaign_schools')
      .select('id, campaign_id, sent_at')
      .eq('school_id', row.school_id)
      .eq('status', 'sent')
      .is('contact_log_id', null)
      .gte('sent_at', windowStart.toISOString())
      .lte('sent_at', createdAt.toISOString())
      .order('sent_at', { ascending: false })
      .limit(1)

    if (csErr) {
      console.error(`[campaign-link] campaign_schools query failed:`, csErr.message)
      return
    }

    if (!candidates || candidates.length === 0) return // no match — regular non-campaign outbound

    const match = candidates[0]

    // 4. Look up campaign name for parse_notes
    const { data: campaign } = await admin
      .from('campaigns')
      .select('name')
      .eq('id', match.campaign_id)
      .single()

    const campaignName = campaign?.name ?? 'Unknown campaign'

    // 5. Link: set contact_log_id on campaign_schools
    const { error: linkErr } = await admin
      .from('campaign_schools')
      .update({ contact_log_id: contactLogRowId })
      .eq('id', match.id)

    if (linkErr) {
      console.error(`[campaign-link] Failed to link campaign_schools ${match.id}:`, linkErr.message)
      return
    }

    // 6. Append campaign reference to parse_notes (preserve existing notes)
    const campaignNote = `campaign send: ${campaignName}`
    const { data: currentRow } = await admin
      .from('contact_log')
      .select('parse_notes')
      .eq('id', contactLogRowId)
      .single()

    const existingNotes = currentRow?.parse_notes?.trim()
    const newNotes = existingNotes
      ? `${existingNotes}; ${campaignNote}`
      : campaignNote

    await admin
      .from('contact_log')
      .update({ parse_notes: newNotes })
      .eq('id', contactLogRowId)

    console.log(
      `[campaign-link] Linked contact_log ${contactLogRowId.slice(0, 8)}… → ` +
      `campaign_schools ${match.id.slice(0, 8)}… (${campaignName})`
    )
  } catch (err) {
    console.error(`[campaign-link] Unexpected error for ${contactLogRowId}:`, err)
  }
}

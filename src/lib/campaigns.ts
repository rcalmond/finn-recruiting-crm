/**
 * Campaign-related server-side helpers.
 *
 * Two linking functions cover both workflow orderings:
 * - linkOutboundToCampaign: called from contact_log INSERT hooks
 *   (sendgrid-inbound, gmail-sync) — handles forward order (mark then send)
 * - linkCampaignToOutbound: called from mark_sent handler — handles
 *   reverse order (send then mark)
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

// ── Shared helper: append campaign note to parse_notes ───────────────────────

async function appendCampaignNote(
  admin: SupabaseClient,
  contactLogRowId: string,
  campaignName: string
): Promise<void> {
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

  const { error: notesErr } = await admin
    .from('contact_log')
    .update({ parse_notes: newNotes })
    .eq('id', contactLogRowId)
  if (notesErr) {
    console.error(`[campaign-link] Failed to update parse_notes:`, notesErr.message)
  }
}

// ── Forward-order: contact_log INSERT → find campaign_schools ────────────────

/**
 * Attempt to link a newly-ingested outbound contact_log row to a
 * campaign_schools send. Called from sendgrid-inbound and gmail-sync
 * after every outbound INSERT.
 *
 * Handles FORWARD order: Mark as sent clicked BEFORE the SR/Gmail send
 * completes. The query requires sent_at <= created_at, so this function
 * only matches when the campaign_schools row was already marked sent at
 * the time the contact_log row was captured.
 *
 * The reverse case (send before mark) is handled by linkCampaignToOutbound.
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

    // 2. Compute the time window (sent_at must be BEFORE created_at)
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

    // 5. Link: set contact_log_id on campaign_schools (optimistic concurrency —
    //    only succeeds if still unlinked, preventing race with linkCampaignToOutbound)
    const { error: linkErr, count: linkCount } = await admin
      .from('campaign_schools')
      .update({ contact_log_id: contactLogRowId })
      .eq('id', match.id)
      .is('contact_log_id', null)

    if (linkErr) {
      console.error(`[campaign-link] Failed to link campaign_schools ${match.id}:`, linkErr.message)
      return
    }
    if (linkCount === 0) return // already linked by the other linker — no-op

    // 6. Append campaign reference to parse_notes
    await appendCampaignNote(admin, contactLogRowId, campaignName)

    console.log(
      `[campaign-link] Linked contact_log ${contactLogRowId.slice(0, 8)}… → ` +
      `campaign_schools ${match.id.slice(0, 8)}… (${campaignName})`
    )
  } catch (err) {
    console.error(`[campaign-link] Unexpected error for ${contactLogRowId}:`, err)
  }
}

// ── Reverse-order: mark_sent → find contact_log ─────────────────────────────

/**
 * Attempt to link a just-marked-sent campaign_schools row to an
 * already-captured outbound contact_log row. Called from the mark_sent
 * handler after updating campaign_schools to status='sent'.
 *
 * Handles REVERSE order: Finn sent in SR/Gmail first (webhook captured
 * the contact_log row), then clicked Mark as sent afterward. The
 * contact_log row already exists but wasn't linked because at INSERT
 * time the campaign_schools row was still status='pending'.
 *
 * Uses a symmetric ±LINKING_WINDOW_MINUTES window around sent_at to
 * match contact_log rows created shortly before OR after the mark.
 *
 * Fire-and-forget — never throws. Logs errors and returns silently.
 */
export async function linkCampaignToOutbound(
  admin: SupabaseClient,
  campaignSchoolRowId: string
): Promise<void> {
  try {
    // 1. Fetch the campaign_schools row
    const { data: cs, error: csErr } = await admin
      .from('campaign_schools')
      .select('id, school_id, campaign_id, status, contact_log_id, sent_at')
      .eq('id', campaignSchoolRowId)
      .single()

    if (csErr || !cs) {
      console.error(`[campaign-link-rev] Failed to fetch campaign_schools ${campaignSchoolRowId}:`, csErr?.message)
      return
    }

    // Defensive: only link if sent and not already linked
    if (cs.status !== 'sent' || cs.contact_log_id || !cs.sent_at) return

    // 2. Compute symmetric window around sent_at
    const sentAt = new Date(cs.sent_at)
    const windowStart = new Date(sentAt.getTime() - LINKING_WINDOW_MINUTES * 60 * 1000)
    const windowEnd   = new Date(sentAt.getTime() + LINKING_WINDOW_MINUTES * 60 * 1000)

    // 3. Find matching outbound contact_log row
    const { data: candidates, error: logErr } = await admin
      .from('contact_log')
      .select('id')
      .eq('school_id', cs.school_id)
      .eq('direction', 'Outbound')
      .gte('created_at', windowStart.toISOString())
      .lte('created_at', windowEnd.toISOString())
      .order('created_at', { ascending: false })
      .limit(5) // fetch a few to filter out already-linked ones

    if (logErr) {
      console.error(`[campaign-link-rev] contact_log query failed:`, logErr.message)
      return
    }

    if (!candidates || candidates.length === 0) return // no match — CC hasn't arrived yet (forward order will catch it)

    // 4. Find the first candidate not already linked to another campaign_schools row
    let matchId: string | null = null
    for (const c of candidates) {
      const { data: alreadyLinked } = await admin
        .from('campaign_schools')
        .select('id')
        .eq('contact_log_id', c.id)
        .limit(1)
      if (!alreadyLinked || alreadyLinked.length === 0) {
        matchId = c.id
        break
      }
    }

    if (!matchId) return // all candidates already linked to other campaign sends

    // 5. Look up campaign name for parse_notes
    const { data: campaign } = await admin
      .from('campaigns')
      .select('name')
      .eq('id', cs.campaign_id)
      .single()

    const campaignName = campaign?.name ?? 'Unknown campaign'

    // 6. Link (optimistic concurrency — only succeeds if still unlinked,
    //    preventing race with linkOutboundToCampaign)
    const { error: linkErr, count: linkCount } = await admin
      .from('campaign_schools')
      .update({ contact_log_id: matchId })
      .eq('id', cs.id)
      .is('contact_log_id', null)

    if (linkErr) {
      console.error(`[campaign-link-rev] Failed to link campaign_schools ${cs.id}:`, linkErr.message)
      return
    }
    if (linkCount === 0) return // already linked by the other linker — no-op

    // 7. Append campaign reference to parse_notes
    await appendCampaignNote(admin, matchId, campaignName)

    console.log(
      `[campaign-link-rev] Linked campaign_schools ${cs.id.slice(0, 8)}… → ` +
      `contact_log ${matchId.slice(0, 8)}… (${campaignName})`
    )
  } catch (err) {
    console.error(`[campaign-link-rev] Unexpected error for ${campaignSchoolRowId}:`, err)
  }
}

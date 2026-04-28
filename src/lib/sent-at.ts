/**
 * sent-at.ts
 *
 * Shared helper for resolving sent_at timestamps on contact_log inserts.
 * Used by gmail-sync cron and sendgrid-inbound webhook.
 *
 * Three-level fallback, never returns null:
 *   1. Email Date header → actual send time
 *   2. Forward preamble date (SR forwarded emails) → original SR send time
 *   3. dateColumnValue + current time-of-day → approximate (same pattern
 *      as migration 026 backfill)
 */

/**
 * Parse a Gmail forward preamble date string.
 * Handles "Sat, Apr 4, 2026 at 7:35 AM" format — "at" is not valid JS Date.
 */
function parseGmailForwardDate(raw: string): Date {
  return new Date(raw.replace(/\s+at\s+/i, ' '))
}

/**
 * Resolve the sent_at timestamp for a contact_log row.
 *
 * @param headers      Raw email headers string (contains "Date: ..." line)
 * @param forwardDate  Gmail forward preamble date string, or null
 * @param calendarDate YYYY-MM-DD date for the row (used in fallback)
 * @returns            ISO 8601 timestamp string, never null
 */
export function resolveSentAt(
  headers: string | null,
  forwardDate: string | null,
  calendarDate: string
): string {
  // 1. Try email Date header
  if (headers) {
    const m = headers.match(/^Date:\s*(.+)$/m)
    if (m) {
      const d = new Date(m[1].trim())
      if (!isNaN(d.getTime())) return d.toISOString()
    }
  }
  // 2. Try forward preamble date (SR forwarded emails)
  if (forwardDate) {
    const d = parseGmailForwardDate(forwardDate)
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  // 3. Approximate: combine calendar date with current time-of-day.
  // Same logic as migration 026 backfill (date + created_at::time AT TIME ZONE).
  // The time-of-day is approximate (ingestion time, not send time).
  const nowTime = new Date().toISOString().split('T')[1] // HH:MM:SS.sssZ
  return new Date(`${calendarDate}T${nowTime}`).toISOString()
}

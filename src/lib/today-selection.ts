/**
 * today-selection.ts
 *
 * Manages the daily "top 3" selection for Today's tactical zone.
 * Selection locks for the day — handled/snoozed items are removed
 * but empty slots don't refill until the next Mountain-time day.
 */

/** Get today's date in Mountain time as YYYY-MM-DD. */
export function mountainTimeToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
}

/**
 * Get the Mountain-time start-of-day as a UTC ISO timestamp.
 * Used for querying "selected today" and "handled today".
 */
export function mountainDayStartUTC(dateStr: string): string {
  // Create the date as UTC, then find the Mountain offset
  const asUTC = new Date(`${dateStr}T00:00:00Z`)
  const fmtOpts: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }
  const mtParts = new Intl.DateTimeFormat('en-CA', fmtOpts).formatToParts(asUTC)
  const g = (t: string) => mtParts.find(p => p.type === t)?.value ?? '00'
  const mtReconstructed = new Date(`${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}Z`)
  const offsetMs = asUTC.getTime() - mtReconstructed.getTime()
  // Midnight Mountain = midnight UTC + offset
  return new Date(asUTC.getTime() + offsetMs).toISOString()
}

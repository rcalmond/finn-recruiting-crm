/**
 * camp-display.ts
 *
 * Render-time helpers for camp display. No schema changes.
 */

import type { Camp } from './types'

const STRIP_SUFFIXES = [
  " Men's Soccer ID Camp",
  " Men's Soccer Camp",
  " Soccer ID Camp",
  " ID Camp",
  " Soccer Camp",
  " Showcase",
  " Clinic",
  " Camp",
]

/**
 * Derive a short display name for calendar bar labels.
 * Strips common camp-type suffixes to show just the school/event name.
 */
export function getCampDisplayName(camp: Camp): string {
  const name = camp.name
  const lower = name.toLowerCase()

  for (const suffix of STRIP_SUFFIXES) {
    if (lower.endsWith(suffix.toLowerCase())) {
      const stripped = name.slice(0, name.length - suffix.length).replace(/[\s.,;:]+$/, '')
      if (stripped.length >= 3) return stripped
      return name
    }
  }

  return name
}

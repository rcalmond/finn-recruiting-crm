/**
 * backfill-school-coords.ts
 *
 * Geocodes all schools missing lat/lng using Nominatim (OpenStreetMap).
 * Rate-limited to 1 request per 1.1 seconds per Nominatim usage policy.
 *
 * Usage:
 *   npx tsx scripts/backfill-school-coords.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ── Load .env.local ───────────────────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function cleanLocation(location: string | null): string {
  if (!location) return ''
  // Strip parenthetical hints like "(Henrietta suburb)"
  return location.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
}

async function geocode(query: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'finn-recruiting-crm/1.0 (https://finnsoccer.com)' },
  })
  if (!res.ok) return null
  const data = await res.json() as Array<{ lat: string; lon: string }>
  if (data.length === 0) return null
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
}

async function main() {
  console.log('School geocoding backfill')
  console.log('')

  const { data: schools, error } = await admin
    .from('schools')
    .select('id, name, short_name, location')
    .is('latitude', null)
    .order('name')

  if (error) { console.error('Query error:', error.message); process.exit(1) }
  if (!schools || schools.length === 0) { console.log('All schools already geocoded.'); return }

  console.log(`${schools.length} schools to geocode`)
  console.log('')

  let succeeded = 0
  let failed = 0

  for (const school of schools) {
    const loc = cleanLocation(school.location)
    const query = loc ? `${school.name}, ${loc}` : school.name

    const result = await geocode(query)

    if (result) {
      const { error: updateErr } = await admin
        .from('schools')
        .update({ latitude: result.lat, longitude: result.lon })
        .eq('id', school.id)
      if (updateErr) {
        console.error(`  FAIL (db): ${school.name} — ${updateErr.message}`)
        failed++
      } else {
        console.log(`  OK: ${school.short_name ?? school.name} → ${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}`)
        succeeded++
      }
    } else {
      console.warn(`  MISS: ${school.name} (query: "${query}")`)
      failed++
    }

    // Rate limit: 1.1 seconds between requests (Nominatim policy)
    await new Promise(r => setTimeout(r, 1100))
  }

  console.log('')
  console.log(`Done. ${succeeded} succeeded, ${failed} failed, ${schools.length} total.`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

/**
 * backfill-video-tracking.ts
 *
 * Scans contact_log for outbound entries containing YouTube URLs,
 * extracts the URL, fetches the video title via YouTube oEmbed,
 * and updates schools.last_video_url, last_video_title, last_video_sent_at.
 *
 * Usage:
 *   npx tsx scripts/backfill-video-tracking.ts --dry-run
 *   npx tsx scripts/backfill-video-tracking.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
}

const dryRun = process.argv.includes('--dry-run')

// Extract first YouTube URL from text
function extractYouTubeUrl(text: string): string | null {
  // Match youtube.com/watch?v=... or youtu.be/...
  const match = text.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  if (!match) return null
  const videoId = match[1]
  return `https://www.youtube.com/watch?v=${videoId}`
}

// Fetch video title via YouTube oEmbed API
async function fetchVideoTitle(url: string): Promise<string | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    const res = await fetch(oembedUrl)
    if (!res.ok) return null
    const json = await res.json() as { title?: string }
    return json.title ?? null
  } catch {
    return null
  }
}

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch all outbound contact_log rows with YouTube URLs
  const { data: rows, error } = await db
    .from('contact_log')
    .select('school_id, summary, sent_at')
    .eq('direction', 'Outbound')
    .not('school_id', 'is', null)
    .not('summary', 'is', null)
    .order('sent_at', { ascending: false })

  if (error) { console.error('Query error:', error.message); process.exit(1) }

  // Group by school — keep most recent per school
  const bySchool = new Map<string, { url: string; sentAt: string }>()

  for (const row of rows ?? []) {
    if (bySchool.has(row.school_id)) continue // already have a more recent one
    const url = extractYouTubeUrl(row.summary ?? '')
    if (url) {
      bySchool.set(row.school_id, { url, sentAt: row.sent_at })
    }
  }

  console.log(`Found ${bySchool.size} schools with YouTube video sends\n`)

  // Fetch school names for display
  const schoolIds = [...bySchool.keys()]
  const { data: schools } = await db
    .from('schools')
    .select('id, name')
    .in('id', schoolIds)

  const schoolNames = new Map((schools ?? []).map(s => [s.id, s.name]))

  let updated = 0
  let titlesFetched = 0

  for (const [schoolId, { url, sentAt }] of bySchool) {
    const name = schoolNames.get(schoolId) ?? schoolId

    // Fetch title
    const title = await fetchVideoTitle(url)
    if (title) titlesFetched++

    console.log(`  ${name}: ${url}`)
    console.log(`    sent_at: ${sentAt}`)
    console.log(`    title: ${title ?? '(fetch failed)'}`)

    if (!dryRun) {
      const { error: updateErr } = await db
        .from('schools')
        .update({
          last_video_url: url,
          last_video_title: title,
          last_video_sent_at: sentAt,
        })
        .eq('id', schoolId)

      if (updateErr) {
        console.error(`    ERROR: ${updateErr.message}`)
      } else {
        updated++
      }
    }
    console.log()

    // Rate limit YouTube oEmbed (be polite)
    await new Promise(r => setTimeout(r, 200))
  }

  if (dryRun) {
    console.log(`\nDRY RUN — ${bySchool.size} schools would be updated (${titlesFetched} titles fetched). No DB changes made.`)
  } else {
    console.log(`\nDone. Updated ${updated} schools. Titles fetched: ${titlesFetched}.`)
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })

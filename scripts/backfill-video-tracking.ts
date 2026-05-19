/**
 * backfill-video-tracking.ts
 *
 * Scans contact_log for outbound entries containing YouTube URLs,
 * extracts the URL, matches against the assets table for title,
 * and updates schools.last_video_url, last_video_title, last_video_sent_at.
 *
 * Title sourcing priority:
 *   1. assets table (is_current or historical — matches by video ID in URL)
 *   2. YouTube oEmbed fallback (for videos no longer in asset library)
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

// Extract first YouTube URL from text, returns { url, videoId } or null
function extractYouTubeUrl(text: string): { url: string; videoId: string } | null {
  const match = text.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  if (!match) return null
  const videoId = match[1]
  return { url: `https://www.youtube.com/watch?v=${videoId}`, videoId }
}

// Fetch video title via YouTube oEmbed API (fallback when no asset match)
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

  // Pre-fetch all video assets for matching
  const { data: videoAssets } = await db
    .from('assets')
    .select('id, name, url, type')
    .in('type', ['highlight_reel', 'game_film'])
    .order('created_at', { ascending: false })

  const assetsByVideoId = new Map<string, { name: string; url: string }>()
  for (const asset of videoAssets ?? []) {
    if (!asset.url) continue
    const match = asset.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
    if (match) {
      const id = match[1]
      if (!assetsByVideoId.has(id)) {
        assetsByVideoId.set(id, { name: asset.name, url: asset.url })
      }
    }
  }
  console.log(`Loaded ${assetsByVideoId.size} video assets for matching\n`)

  // Fetch all outbound contact_log rows
  const { data: rows, error } = await db
    .from('contact_log')
    .select('school_id, summary, sent_at')
    .eq('direction', 'Outbound')
    .not('school_id', 'is', null)
    .not('summary', 'is', null)
    .order('sent_at', { ascending: false })

  if (error) { console.error('Query error:', error.message); process.exit(1) }

  // Group by school — keep most recent per school
  const bySchool = new Map<string, { url: string; videoId: string; sentAt: string }>()

  for (const row of rows ?? []) {
    if (bySchool.has(row.school_id)) continue // already have a more recent one
    const extracted = extractYouTubeUrl(row.summary ?? '')
    if (extracted) {
      bySchool.set(row.school_id, { ...extracted, sentAt: row.sent_at })
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
  let assetMatches = 0
  let oembedFetches = 0

  for (const [schoolId, { url, videoId, sentAt }] of bySchool) {
    const name = schoolNames.get(schoolId) ?? schoolId

    // Try asset match first, fall back to oEmbed
    const assetMatch = assetsByVideoId.get(videoId)
    let title: string | null
    let titleSource: string

    if (assetMatch) {
      title = assetMatch.name
      titleSource = 'asset'
      assetMatches++
    } else {
      title = await fetchVideoTitle(url)
      titleSource = title ? 'oembed' : 'none'
      if (title) oembedFetches++
      // Rate limit YouTube oEmbed (be polite)
      await new Promise(r => setTimeout(r, 200))
    }

    // Use asset URL when available (preserves youtu.be short form)
    const finalUrl = assetMatch?.url ?? url

    console.log(`  ${name}: ${finalUrl}`)
    console.log(`    sent_at: ${sentAt}`)
    console.log(`    title: ${title ?? '(no title)'} [${titleSource}]`)

    if (!dryRun) {
      const { error: updateErr } = await db
        .from('schools')
        .update({
          last_video_url: finalUrl,
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
  }

  if (dryRun) {
    console.log(`\nDRY RUN — ${bySchool.size} schools would be updated. Asset matches: ${assetMatches}, oEmbed fetches: ${oembedFetches}. No DB changes made.`)
  } else {
    console.log(`\nDone. Updated ${updated} schools. Asset matches: ${assetMatches}, oEmbed fetches: ${oembedFetches}.`)
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })

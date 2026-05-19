/**
 * video-send-detector.ts
 *
 * Fire-and-forget detector that runs after outbound contact_log inserts.
 * Extracts YouTube URLs from the email body, matches them against the
 * assets table (highlight_reel, game_film), and updates schools.last_video_*
 * cache columns when a match is found.
 *
 * This replaces the manual backfill script as the runtime write path for
 * schools.last_video_url, last_video_title, last_video_sent_at.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── YouTube URL extraction ──────────────────────────────────────────────────

const YOUTUBE_REGEX = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/g

function extractYouTubeIds(text: string): string[] {
  const ids: string[] = []
  let match: RegExpExecArray | null
  while ((match = YOUTUBE_REGEX.exec(text)) !== null) {
    if (!ids.includes(match[1])) ids.push(match[1])
  }
  return ids
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function detectAndUpdateVideoSend(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  schoolId: string,
  sentBody: string,
  sentAt: string, // ISO timestamp from contact_log.sent_at
): Promise<void> {
  try {
    if (!sentBody || sentBody.length < 50) return

    const ids = extractYouTubeIds(sentBody)
    if (ids.length === 0) return

    // Match extracted IDs against known video assets (highlight_reel, game_film)
    // First match in body order wins (typical: one URL per email)
    for (const videoId of ids) {
      const { data: asset } = await admin
        .from('assets')
        .select('id, name, url')
        .in('type', ['highlight_reel', 'game_film'])
        .like('url', `%${videoId}%`)
        .limit(1)
        .maybeSingle()

      if (asset) {
        await admin
          .from('schools')
          .update({
            last_video_url: asset.url,
            last_video_title: asset.name,
            last_video_sent_at: sentAt,
          })
          .eq('id', schoolId)

        return // done — first match wins
      }
    }
    // No asset match — don't pollute cache with unknown URLs
  } catch (err) {
    console.error('[video-send-detector] error:', err instanceof Error ? err.message : err)
    // Never throw to caller — fire-and-forget
  }
}

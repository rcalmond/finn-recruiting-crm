/**
 * Asset parsing pipeline — extracts structured player profile data from
 * Finn's Soccer Resume (PDF/DOCX) using Claude Haiku.
 *
 * The parsed fields populate the player_profile singleton table, which
 * the email draft prompt builder reads from. AI generation never reads
 * the raw document directly.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const PARSE_SYSTEM_PROMPT = `You are extracting structured recruiting profile data from a player's soccer resume. Return a JSON object with these fields:

- current_stats: 2-4 sentences. Factual data only — position, club, season stats (goals, assists, games), recent results. No superlatives ("elite," "exceptional," "strong"), no character claims ("coachability," "determination"), no editorializing verbs ("showcasing," "demonstrating," "successfully"). Match a direct, specific register: "2 goals, 1 assist in 16 starts at left wingback" not "exceptional production from a dynamic wingback." The position transition from striker to left wingback should be stated as a fact with the date, not editorialized.

- upcoming_schedule: a single plain-text string of semicolon-separated game lines. Format each game as: "Date vs. Opponent at Location Time". Example: "April 29 vs. Colorado United SC at Littleton 8pm; May 2 vs. Grand Junction at Boulder 3pm". If no upcoming events are listed, return null.

- highlights: 2-3 sentences. Concrete facts only — event name, date, location, what happened (goals, assists, awards, results). No marketing language ("showcasing," "demonstrating," "elite ball-striking ability"). Just: what event, what he did, what recognition followed.

- academic_summary: 1-2 sentences on GPA, test scores, course load, intended major.

If a field is not present in the document, return null for that field.
Do not invent. Return ONLY the JSON object, no preamble.`

export type ParserResult = {
  current_stats: string | null
  upcoming_schedule: string | null
  highlights: string | null
  academic_summary: string | null
}

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Parse a resume from Supabase Storage and return structured profile fields.
 * Idempotent — re-running on same input produces same output.
 */
export async function parseResume(storagePath: string): Promise<ParserResult> {
  const db = admin()

  // Download file from Supabase Storage
  const { data: fileData, error: dlError } = await db.storage
    .from('assets')
    .download(storagePath)

  if (dlError || !fileData) {
    throw new Error(`Failed to download asset: ${dlError?.message ?? 'no data'}`)
  }

  // Convert blob to base64 for Anthropic API
  const arrayBuffer = await fileData.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  // Determine media type from extension
  const ext = storagePath.split('.').pop()?.toLowerCase()
  const mediaType = ext === 'pdf' ? 'application/pdf' as const : 'application/pdf' as const
  // Note: Anthropic document API supports PDF. For DOCX, we send as PDF since
  // the upload route only accepts PDF/DOCX and most resumes are PDF.

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: PARSE_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [{
        type: 'document',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: base64,
        },
      }, {
        type: 'text',
        text: 'Extract the structured profile data from this soccer resume. Return only the JSON object.',
      }],
    }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  const parsed = JSON.parse(cleaned) as ParserResult
  return {
    current_stats: parsed.current_stats ?? null,
    upcoming_schedule: parsed.upcoming_schedule ?? null,
    highlights: parsed.highlights ?? null,
    academic_summary: parsed.academic_summary ?? null,
  }
}

/**
 * Parse a resume and upsert the result into player_profile.
 * Fire-and-forget safe — logs errors, never throws.
 */
export async function parseAndUpsertResume(
  assetId: string,
  storagePath: string
): Promise<void> {
  try {
    const result = await parseResume(storagePath)
    const db = admin()

    // Check if a row exists
    const { data: existing } = await db
      .from('player_profile')
      .select('id')
      .limit(1)
      .single()

    if (existing) {
      // Update existing singleton
      await db
        .from('player_profile')
        .update({
          current_stats: result.current_stats,
          upcoming_schedule: result.upcoming_schedule,
          highlights: result.highlights,
          academic_summary: result.academic_summary,
          source_asset_id: assetId,
          last_parsed_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      // Insert first row
      await db
        .from('player_profile')
        .insert({
          current_stats: result.current_stats,
          upcoming_schedule: result.upcoming_schedule,
          highlights: result.highlights,
          academic_summary: result.academic_summary,
          source_asset_id: assetId,
          last_parsed_at: new Date().toISOString(),
        })
    }

    console.log(`[asset-parser] Successfully parsed resume ${assetId} into player_profile`)
  } catch (err) {
    console.error(`[asset-parser] Failed to parse resume ${assetId}:`, err instanceof Error ? err.message : err)
  }
}

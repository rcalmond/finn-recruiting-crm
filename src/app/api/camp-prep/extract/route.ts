/**
 * POST /api/camp-prep/extract
 *
 * Extraction step for camp prep docs (Phase 3-4). Takes the pasted camp email +
 * travel prose, runs a single Sonnet call, and returns a structured CampExtraction
 * for the user to confirm/edit. Does NOT persist — the confirm step (save) does.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { extractJsonObject } from '@/lib/agentic-research'
import {
  CAMP_EXTRACTION_MODEL, buildCampExtractionSystemPrompt, buildCampExtractionUserPrompt,
  type CampExtraction, type CampPrepInputs,
} from '@/lib/camp-prep'

export const runtime = 'nodejs'
export const maxDuration = 120

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { campId, inputs } = (await req.json()) as { campId?: string; inputs?: CampPrepInputs }
  if (!campId || !inputs?.camp_email_raw?.trim()) {
    return NextResponse.json({ error: 'Missing campId or camp email' }, { status: 400 })
  }

  const db = supabase // T1: user client — RLS enforces the family boundary

  const { data: camp } = await db
    .from('camps')
    .select('id, name, start_date, end_date, location, host_school_id')
    .eq('id', campId)
    .single()
  if (!camp) return NextResponse.json({ error: 'Camp not found' }, { status: 404 })

  const { data: school } = await db
    .from('schools')
    .select('location')
    .eq('id', camp.host_school_id)
    .maybeSingle()

  // T1: players by family (RLS scopes; one player at alpha)
  const { data: profile } = await db
    .from('players')
    .select('home_timezone')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const homeTimezone = (profile?.home_timezone as string | null)?.trim() || 'America/Denver'

  try {
    const message = await anthropic.messages.create({
      model: CAMP_EXTRACTION_MODEL,
      max_tokens: 8000,
      system: buildCampExtractionSystemPrompt(),
      messages: [{
        role: 'user',
        content: buildCampExtractionUserPrompt({
          campName: camp.name,
          campDates: `${camp.start_date} to ${camp.end_date}`,
          campLocation: camp.location,
          hostSchoolLocation: (school?.location as string | null) ?? null,
          homeTimezone,
          referenceDate: new Date().toLocaleDateString('en-CA', { timeZone: homeTimezone }),
          inputs: {
            camp_email_raw: inputs.camp_email_raw ?? '',
            travel_prose: inputs.travel_prose ?? '',
            extra_notes: inputs.extra_notes ?? '',
          },
        }),
      }],
    })

    const raw = message.content[0]?.type === 'text' ? message.content[0].text : ''
    const extraction = extractJsonObject(raw) as CampExtraction
    // Ensure home_tz is the real value regardless of what the model echoed.
    extraction.timezone = { ...extraction.timezone, home_tz: homeTimezone }

    return NextResponse.json({ extraction })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Extraction failed'
    console.error('[camp-prep/extract] Error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

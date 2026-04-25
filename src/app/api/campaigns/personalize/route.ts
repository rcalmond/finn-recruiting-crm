/**
 * POST /api/campaigns/personalize
 *
 * Fills "[Finn: add ...]" bracketed placeholders in a campaign draft using Claude.
 * Streams the result as text/plain so the client can display it incrementally.
 *
 * Body: { schoolId, coachId, renderedBody }
 * Response: text/plain stream of the personalized email body
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
  CAMPAIGN_PERSONALIZE_SYSTEM_PROMPT,
  buildCampaignPersonalizePrompt,
} from '@/lib/prompts'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { schoolId, coachId, renderedBody } = await req.json() as {
      schoolId: string
      coachId: string | null
      renderedBody: string
    }

    if (!schoolId || !renderedBody?.trim()) {
      return NextResponse.json({ error: 'schoolId and renderedBody are required' }, { status: 400 })
    }

    const db = admin()

    // Fetch school context
    const { data: school } = await db
      .from('schools')
      .select('name, division, conference, location, category, notes')
      .eq('id', schoolId)
      .single()

    if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

    // Fetch coach context if coachId provided
    let coachName: string | null = null
    let coachRole: string | null = null
    if (coachId) {
      const { data: coach } = await db
        .from('coaches')
        .select('name, role')
        .eq('id', coachId)
        .single()
      if (coach) { coachName = coach.name; coachRole = coach.role }
    }

    // Fetch last 3 inbound contact_log entries for relationship context
    const { data: inboundLogs } = await db
      .from('contact_log')
      .select('date, channel, authored_by, summary')
      .eq('school_id', schoolId)
      .eq('direction', 'Inbound')
      .order('date', { ascending: false })
      .limit(3)

    const userPrompt = buildCampaignPersonalizePrompt({
      renderedBody,
      schoolName:    school.name,
      division:      school.division,
      conference:    school.conference,
      location:      school.location,
      category:      school.category,
      notes:         school.notes,
      coachName,
      coachRole,
      recentInbounds: (inboundLogs ?? []).map(e => ({
        date:        e.date,
        channel:     e.channel,
        authored_by: e.authored_by ?? null,
        summary:     e.summary ?? '',
      })),
    })

    // Stream Claude response
    const stream = anthropic.messages.stream({
      model:      'claude-sonnet-4-5',
      max_tokens: 1000,
      system:     CAMPAIGN_PERSONALIZE_SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userPrompt }],
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              controller.enqueue(encoder.encode(event.delta.text))
            }
          }
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[campaigns/personalize] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

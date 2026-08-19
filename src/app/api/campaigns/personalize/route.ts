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
import { familyAdmin } from '@/lib/tenant-db'
import { getFamilyContext } from '@/lib/require-family'
import {
  buildCampaignPersonalizeSystemPrompt,
  buildCampaignPersonalizePrompt,
} from '@/lib/prompts'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const fam = await getFamilyContext()
    if (!fam.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const familyId = fam.ctx.familyId

    const { schoolId, coachId, renderedBody } = await req.json() as {
      schoolId: string
      coachId: string | null
      renderedBody: string
    }

    if (!schoolId || !renderedBody?.trim()) {
      return NextResponse.json({ error: 'schoolId and renderedBody are required' }, { status: 400 })
    }

    const db = familyAdmin(familyId) // T1: service role, family-scoped (SSE/LLM path)

    // Identity for the personalizer — the family's own player, never a literal.
    // TODO(multi-player): first player by created_at.
    const { data: personalizePlayer } = await db.from('players')
      .select('name, position, grad_year, club, academic_summary, highlights')
      .order('created_at', { ascending: true }).limit(1).maybeSingle()

    // Fetch school context
    const { data: school } = await db
      .from('schools')
      .select('name, division, conference, location, category')
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
      .order('sent_at', { ascending: false })
      .limit(3)

    const userPrompt = buildCampaignPersonalizePrompt({
      renderedBody,
      schoolName:    school.name,
      division:      school.division,
      conference:    school.conference,
      location:      school.location,
      category:      school.category,
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
      model:      'claude-opus-4-7',
      max_tokens: 1000,
      system:     buildCampaignPersonalizeSystemPrompt(personalizePlayer, personalizePlayer?.academic_summary, personalizePlayer?.highlights),
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

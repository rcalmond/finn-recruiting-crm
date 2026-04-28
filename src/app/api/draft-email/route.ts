/**
 * POST /api/draft-email
 *
 * v2 endpoint: uses the shared buildEmailDraftPrompt prompt builder.
 *
 * Body: { schoolId, coachId?, brief?, selectedTopic?, replyToContactLogId? }
 *
 * Fresh outreach: returns { subject, body } JSON
 * Reply mode: returns { body } (no subject — Finn uses email client threading)
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { buildEmailDraftPrompt } from '@/lib/prompts'

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

    const body = await req.json() as {
      schoolId: string
      coachId?: string | null
      brief?: string
      selectedTopic?: string
      replyToContactLogId?: string
    }

    if (!body.schoolId) {
      return NextResponse.json({ error: 'schoolId is required' }, { status: 400 })
    }

    const isReply = !!body.replyToContactLogId

    const { system, user: userPrompt } = await buildEmailDraftPrompt(admin(), {
      schoolId: body.schoolId,
      coachId: body.coachId ?? null,
      brief: body.brief,
      selectedTopic: body.selectedTopic,
      context: 'individual',
      replyToContactLogId: body.replyToContactLogId,
    })

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''

    if (isReply) {
      // Reply mode: body-only output
      const bodyText = raw
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim()
      return NextResponse.json({ body: bodyText })
    }

    // Fresh outreach: JSON {subject, body} output
    const text = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    let parsed: { subject: string; body: string }
    try {
      parsed = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: 'Model returned invalid JSON', raw }, { status: 500 })
    }

    if (!parsed.subject || !parsed.body) {
      return NextResponse.json({ error: 'Model response missing subject or body', raw }, { status: 500 })
    }

    return NextResponse.json({ subject: parsed.subject, body: parsed.body })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[draft-email] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

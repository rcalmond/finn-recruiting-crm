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

/**
 * Extract JSON object from model output by finding first { and last }.
 * Handles preamble text, markdown fences, trailing commentary.
 */
function extractJSON(raw: string): { subject: string; body: string } | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1))
    if (parsed.subject && parsed.body) return parsed
    return null
  } catch {
    return null
  }
}

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
    const parsed = extractJSON(raw)
    if (parsed) {
      return NextResponse.json({ subject: parsed.subject, body: parsed.body })
    }

    // First attempt failed — log and retry with tightened instruction
    console.error('[draft-email] First attempt JSON parse failed. Raw:', raw)

    const retryMessage = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: system + '\n\nIMPORTANT: Your previous response was not valid JSON. Output ONLY a JSON object starting with { and ending with }. Do not include any preamble, explanation, or markdown. Properly escape any quotes inside string values with backslash.',
      messages: [
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: raw },
        { role: 'user', content: 'That response was not valid JSON. Please return ONLY the JSON object with "subject" and "body" keys. Start with { and end with }. No other text.' },
      ],
    })

    const raw2 = retryMessage.content[0].type === 'text' ? retryMessage.content[0].text : ''
    const parsed2 = extractJSON(raw2)

    if (parsed2) {
      return NextResponse.json({ subject: parsed2.subject, body: parsed2.body })
    }

    // Both attempts failed
    console.error('[draft-email] Second attempt JSON parse failed. Raw:', raw2)
    return NextResponse.json({ error: 'Model returned invalid JSON after retry', raw: raw2 }, { status: 500 })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[draft-email] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

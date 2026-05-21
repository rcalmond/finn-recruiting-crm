/**
 * POST /api/draft-email/swap-closing
 *
 * Lightweight rewrite of an email's closing paragraph to incorporate
 * a different closing question. Everything before the closing paragraph
 * stays exactly the same.
 *
 * Body: { body, currentQuestion, newQuestion, schoolName, coachName }
 * Returns: { body }
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are editing one recruiting email from a 17-year-old high school soccer recruit to a college coach. Rewrite ONLY the final/closing paragraph so it naturally incorporates a different closing question. Keep everything before the closing paragraph exactly as is, word for word.

Match the existing voice: a 17-year-old high school senior, direct and genuine, no em-dashes, no corporate phrasing. The closing paragraph should weave the new question in naturally, not bolt it on.

Return the full email body with only the closing paragraph changed. No explanation, no preamble, no markdown fences. Just the email text.`

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { body, currentQuestion, newQuestion, schoolName, coachName } = await req.json() as {
      body: string
      currentQuestion: string
      newQuestion: string
      schoolName?: string
      coachName?: string
    }

    if (!body || !newQuestion) {
      return NextResponse.json({ error: 'body and newQuestion are required' }, { status: 400 })
    }

    const userMessage = `EMAIL TO EDIT:
---
${body}
---

CURRENT CLOSING QUESTION (to remove): ${currentQuestion}
NEW CLOSING QUESTION (to weave in): ${newQuestion}
${schoolName ? `School: ${schoolName}` : ''}
${coachName ? `Coach: ${coachName}` : ''}

Rewrite only the closing paragraph to use the new question. Return the full email body.`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const result = message.content[0].type === 'text' ? message.content[0].text : ''
    const cleaned = result
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    return NextResponse.json({ body: cleaned })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[swap-closing] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

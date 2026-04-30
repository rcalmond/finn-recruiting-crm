/**
 * POST /api/draft-email/suggest-topics
 *
 * Returns 2-3 suggested email topic strings for a school+coach.
 * Used by the draft modal's Stage 1 (topic suggestion).
 *
 * Body: { schoolId, coachId? }
 * Response: { topics: string[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { buildTopicSuggestPrompt } from '@/lib/prompts'

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

    const { schoolId, coachId, taskContext } = await req.json() as {
      schoolId: string
      coachId: string | null
      taskContext?: { type: string; metadata?: { reelUrl?: string; reelTitle?: string } }
    }

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId is required' }, { status: 400 })
    }

    const { system: baseSystem, user: userPrompt } = await buildTopicSuggestPrompt(admin(), schoolId, coachId)

    // Append task context to system prompt when present
    let system = baseSystem
    if (taskContext?.type === 'send_reel') {
      const reelTitle = taskContext.metadata?.reelTitle ?? 'highlight reel'
      const reelUrl = taskContext.metadata?.reelUrl ?? ''
      system += `\n\nTASK CONTEXT:\nThis email is part of a batch where Finn is sharing his updated highlight reel with target schools. The reel is: ${reelTitle}${reelUrl ? ` (${reelUrl})` : ''}.\n\nAll suggested topics should center on:\n- Sharing the new reel as the primary purpose\n- Connecting it to recent communications or school interests\n- Soliciting feedback or response from the coach\n\nTopic suggestions should NOT be generic — they should all relate to the reel-sharing purpose.`
    }

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : '[]'
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    let topics: string[]
    try {
      topics = JSON.parse(cleaned)
      if (!Array.isArray(topics)) topics = []
    } catch {
      topics = []
    }

    return NextResponse.json({ topics })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[suggest-topics] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

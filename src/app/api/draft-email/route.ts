import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { SYSTEM_PROMPT, buildUserPrompt } from '@/lib/prompts'
import type { EmailType } from '@/lib/prompts'
import type { School, ContactLogEntry } from '@/lib/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { emailType, school, recentLogs, coachMessage, additionalContext } = body as {
      emailType: EmailType
      school: School
      recentLogs: ContactLogEntry[]
      coachMessage?: string
      additionalContext?: string
    }

    if (!emailType || !school) {
      return NextResponse.json({ error: 'Missing required fields: emailType, school' }, { status: 400 })
    }

    const userPrompt = buildUserPrompt({ emailType, school, recentLogs: recentLogs ?? [], coachMessage, additionalContext })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''

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
    const detail = err instanceof Error ? {
      name: err.name,
      message: err.message,
      // @ts-expect-error Anthropic SDK errors have extra fields
      status: err.status,
      // @ts-expect-error
      error: err.error,
    } : err
    console.error('[draft-email] Error:', JSON.stringify(detail, null, 2))
    return NextResponse.json({ error: message, detail }, { status: 500 })
  }
}

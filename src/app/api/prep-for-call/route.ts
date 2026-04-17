import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { PREP_SYSTEM_PROMPT, buildPrepPrompt } from '@/lib/prompts'
import type { School, ContactLogEntry, Question, SchoolQuestionOverride, SchoolSpecificQuestion } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { school, recentLogs, globalQuestions } = body as {
      school: School
      recentLogs: ContactLogEntry[]
      globalQuestions: Question[]
    }

    if (!school || !globalQuestions) {
      return NextResponse.json({ error: 'Missing required fields: school, globalQuestions' }, { status: 400 })
    }

    const userPrompt = buildPrepPrompt({
      school,
      recentLogs: recentLogs ?? [],
      globalQuestions,
    })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: PREP_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''
    const text = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    let parsed: {
      overrides: { question_id: string; status: 'priority' | 'answered' | 'skip'; context_note: string }[]
      school_specific_questions: { question_text: string; rationale: string; category: string }[]
      call_summary: string
    }

    try {
      parsed = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: 'Model returned invalid JSON', raw }, { status: 500 })
    }

    const admin = serviceClient()
    const now = new Date().toISOString()

    // Upsert overrides — update if exists, insert if not
    if (parsed.overrides?.length) {
      const { error: upsertError } = await admin
        .from('school_question_overrides')
        .upsert(
          parsed.overrides.map(o => ({
            school_id: school.id,
            question_id: o.question_id,
            status: o.status,
            context_note: o.context_note || null,
            updated_at: now,
          })),
          { onConflict: 'school_id,question_id' }
        )
      if (upsertError) {
        console.error('[prep-for-call] upsert error:', upsertError)
      }
    }

    // Replace school-specific questions — delete and re-insert
    await admin.from('school_specific_questions').delete().eq('school_id', school.id)
    let insertedSpecific: SchoolSpecificQuestion[] = []
    if (parsed.school_specific_questions?.length) {
      const { data } = await admin
        .from('school_specific_questions')
        .insert(
          parsed.school_specific_questions.map(q => ({
            school_id: school.id,
            question_text: q.question_text,
            rationale: q.rationale || null,
            category: q.category,
          }))
        )
        .select()
      insertedSpecific = (data ?? []) as SchoolSpecificQuestion[]
    }

    // Fetch the freshly upserted overrides to return full rows
    const { data: freshOverrides } = await admin
      .from('school_question_overrides')
      .select('*')
      .eq('school_id', school.id)
    const overrides = (freshOverrides ?? []) as SchoolQuestionOverride[]

    return NextResponse.json({
      overrides,
      school_specific_questions: insertedSpecific,
      call_summary: parsed.call_summary ?? '',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const detail = err instanceof Error ? {
      name: err.name,
      message: err.message,
      // @ts-expect-error Anthropic SDK error fields
      status: err.status,
      // @ts-expect-error
      error: err.error,
    } : err
    console.error('[prep-for-call] Error:', JSON.stringify(detail, null, 2))
    return NextResponse.json({ error: message, detail }, { status: 500 })
  }
}

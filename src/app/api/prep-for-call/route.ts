import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { familyAdmin } from '@/lib/tenant-db'
import { getFamilyContext } from '@/lib/require-family'
import { createClient } from '@/lib/supabase/server'
import { buildPrepSystemPrompt, buildPrepPrompt } from '@/lib/prompts'
import { fetchSchoolContext } from '@/lib/school-context'
import type { Question, SchoolQuestionOverride, SchoolSpecificQuestion } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const fam = await getFamilyContext()
    if (!fam.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const familyId = fam.ctx.familyId

    const body = await req.json()
    const { schoolId, globalQuestions } = body as {
      schoolId: string
      globalQuestions: Question[]
    }

    if (!schoolId || !globalQuestions) {
      return NextResponse.json({ error: 'Missing required fields: schoolId, globalQuestions' }, { status: 400 })
    }

    const admin = familyAdmin(familyId) // T1: service role, family-scoped (SSE/LLM path)

    // Identity for the advisor framing — the family's own player.
    // TODO(multi-player): first player by created_at.
    const { data: prepPlayer } = await admin.from('players')
      .select('name, position, grad_year, club, academic_summary')
      .order('created_at', { ascending: true }).limit(1).maybeSingle()

    const { school, coaches, contactLog, upcomingCamps: camps, declineHistory: declineRows, statusUpdates, currentAssets } =
      await fetchSchoolContext(admin, schoolId)

    if (!school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 })
    }

    const userPrompt = buildPrepPrompt({
      school,
      contactHistory: contactLog,
      globalQuestions,
      coaches,
      camps,
      declineRows,
      statusUpdates,
    })

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      system: buildPrepSystemPrompt(currentAssets, prepPlayer, prepPlayer?.academic_summary),
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

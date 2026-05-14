import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { PREP_SYSTEM_PROMPT, buildPrepPrompt } from '@/lib/prompts'
import type { Question, SchoolQuestionOverride, SchoolSpecificQuestion } from '@/lib/types'

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
    const { schoolId, globalQuestions } = body as {
      schoolId: string
      globalQuestions: Question[]
    }

    if (!schoolId || !globalQuestions) {
      return NextResponse.json({ error: 'Missing required fields: schoolId, globalQuestions' }, { status: 400 })
    }

    const admin = serviceClient()
    const today = new Date().toISOString().split('T')[0]

    // ── Parallel data fetches ──────────────────────────────────────────────
    const [
      { data: school },
      { data: contactRows },
      { data: allCoaches },
      { data: campRows },
    ] = await Promise.all([
      admin.from('schools')
        .select('id, name, short_name, category, division, conference, location, notes, status, head_coach, admit_likelihood')
        .eq('id', schoolId)
        .single(),
      // Full contact_log, chronological
      admin.from('contact_log')
        .select('date, sent_at, direction, channel, coach_name, summary, authored_by, intent')
        .eq('school_id', schoolId)
        .not('parse_status', 'in', '("orphan","non_coach")')
        .order('sent_at', { ascending: true }),
      // All active coaches
      admin.from('coaches')
        .select('name, role, email, is_primary, needs_review')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .order('is_primary', { ascending: false }),
      // Upcoming camps
      admin.from('camps')
        .select('name, start_date, end_date, location, registration_deadline, camp_finn_status(status)')
        .eq('host_school_id', schoolId)
        .gte('start_date', today),
    ])

    if (!school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 })
    }

    // Process camps
    const camps = (campRows ?? []).map((c: Record<string, unknown>) => {
      const fs = c.camp_finn_status as Array<{ status: string }> | null
      return {
        name: c.name as string,
        start_date: c.start_date as string,
        end_date: c.end_date as string,
        location: c.location as string | null,
        registration_deadline: c.registration_deadline as string | null,
        status: fs?.[0]?.status ?? 'no status',
      }
    })

    // Process coaches
    const coaches = (allCoaches ?? []).map((c: Record<string, unknown>) => ({
      name: c.name as string,
      role: c.role as string | null,
      email: c.email as string | null,
      is_primary: c.is_primary as boolean,
      needs_review: c.needs_review as boolean,
    }))

    // Decline history
    const history = contactRows ?? []
    const declineRows = history.filter((r: Record<string, unknown>) => r.intent === 'decline')

    const userPrompt = buildPrepPrompt({
      school,
      contactHistory: history as Array<{
        date: string
        direction: string
        channel: string
        coach_name: string | null
        summary: string | null
        authored_by: string | null
        intent: string | null
      }>,
      globalQuestions,
      coaches,
      camps,
      declineRows: declineRows as Array<{
        date: string
        coach_name: string | null
        summary: string | null
      }>,
    })

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
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

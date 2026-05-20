/**
 * POST /api/schools/[id]/strategy-question
 *
 * Answers a strategic question about a specific school using Opus 4.7.
 * Persists Q&A in school_plan_questions.
 *
 * GET returns the last 5 Q&As for the school.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { fetchSchoolContext } from '@/lib/school-context'
import { answerSchoolStrategyQuestion } from '@/lib/school-plan-qa-generator'
import type { Message } from '@/lib/types'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: schoolId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: questions } = await db
    .from('school_plan_questions')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(5)

  return NextResponse.json({ questions: questions ?? [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: schoolId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { question } = await req.json() as { question: string }
  if (!question?.trim()) return NextResponse.json({ error: 'question is required' }, { status: 400 })

  const db = admin()

  // Fetch full context (same pattern as plan generator)
  const [
    ctx,
    { data: activeMessages },
    { data: coverageRows },
  ] = await Promise.all([
    fetchSchoolContext(db, schoolId),
    db.from('messages').select('*').eq('status', 'active'),
    db.from('school_message_log')
      .select('*, message:messages(*)')
      .eq('school_id', schoolId),
  ])

  const { school, coaches, contactLog: history, upcomingCamps: camps, declineHistory: declineRows, strategicNotes } = ctx

  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  const messages = (activeMessages ?? []) as Message[]
  const coverage = coverageRows ?? []
  const coveredIds = new Set(coverage.map((c: Record<string, unknown>) => c.message_id as string))
  const uncovered = messages.filter(m => !coveredIds.has(m.id))
  const covered = coverage
    .filter((c: Record<string, unknown>) => c.message !== null)
    .map((c: Record<string, unknown>) => ({
      message: c.message as Message,
      detected_at: c.detected_at as string,
    }))

  try {
    const result = await answerSchoolStrategyQuestion({
      school: { ...school, admit_likelihood: school.admit_likelihood ?? null },
      coaches,
      contactHistory: history,
      coveredMessages: covered,
      uncoveredMessages: uncovered,
      upcomingCamps: camps,
      declineHistory: declineRows,
      finnNotes: strategicNotes,
      question: question.trim(),
    })

    if (!result.answer) {
      return NextResponse.json({ error: 'Failed to generate answer' }, { status: 500 })
    }

    // Persist
    const { data: row, error } = await db
      .from('school_plan_questions')
      .insert({
        school_id: schoolId,
        question: question.trim(),
        answer: result.answer,
        model_used: 'claude-opus-4-7',
      })
      .select('*')
      .single()

    if (error) {
      console.error('[strategy-question] insert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ question: row })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[strategy-question] failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

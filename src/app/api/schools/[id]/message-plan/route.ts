import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { generateSchoolMessagePlan } from '@/lib/school-message-plan-generator'
import type { Message } from '@/lib/types'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET — return existing plan + coverage
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: schoolId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()

  const [{ data: plan }, { data: coverage }] = await Promise.all([
    db.from('school_message_plan').select('*').eq('school_id', schoolId).maybeSingle(),
    db.from('school_message_log')
      .select('*, message:messages(*)')
      .eq('school_id', schoolId)
      .order('detected_at', { ascending: false }),
  ])

  return NextResponse.json({ plan: plan ?? null, coverage: coverage ?? [] })
}

// POST — generate fresh suggestions
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: schoolId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const today = new Date().toISOString().split('T')[0]

  // Parallel data fetches
  const [
    { data: school },
    { data: allCoaches },
    { data: contactRows },
    { data: activeMessages },
    { data: coverageRows },
    { data: campRows },
    { data: existingPlan },
  ] = await Promise.all([
    db.from('schools')
      .select('name, category, division, conference, location, notes, status')
      .eq('id', schoolId).single(),
    db.from('coaches')
      .select('name, role, is_primary, needs_review')
      .eq('school_id', schoolId).eq('is_active', true)
      .order('is_primary', { ascending: false }),
    db.from('contact_log')
      .select('date, direction, channel, coach_name, summary, intent')
      .eq('school_id', schoolId)
      .not('parse_status', 'in', '("orphan","non_coach")')
      .order('sent_at', { ascending: true }),
    db.from('messages').select('*').eq('status', 'active'),
    db.from('school_message_log')
      .select('*, message:messages(*)')
      .eq('school_id', schoolId),
    db.from('camps')
      .select('name, start_date, end_date, camp_finn_status(status)')
      .eq('host_school_id', schoolId)
      .gte('start_date', today),
    db.from('school_message_plan')
      .select('*').eq('school_id', schoolId).maybeSingle(),
  ])

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

  const history = (contactRows ?? []) as Array<{ date: string; direction: string; channel: string; coach_name: string | null; summary: string | null; intent: string | null }>
  const declineRows = history.filter(r => r.intent === 'decline')

  const camps = (campRows ?? []).map((c: Record<string, unknown>) => {
    const fs = c.camp_finn_status as Array<{ status: string }> | null
    return {
      name: c.name as string,
      start_date: c.start_date as string,
      end_date: c.end_date as string,
      status: fs?.[0]?.status ?? 'no status',
    }
  })

  const coaches = (allCoaches ?? []).map((c: Record<string, unknown>) => ({
    name: c.name as string,
    role: c.role as string | null,
    is_primary: c.is_primary as boolean,
    needs_review: c.needs_review as boolean,
  }))

  try {
    const result = await generateSchoolMessagePlan({
      school,
      coaches,
      contactHistory: history,
      uncoveredMessages: uncovered,
      coveredMessages: covered,
      upcomingCamps: camps,
      declineHistory: declineRows,
      finnNotes: (existingPlan as Record<string, unknown> | null)?.finn_notes as string | null ?? null,
    })

    const suggestions = { items: result.items }

    // Upsert plan
    const { data: plan, error } = await db
      .from('school_message_plan')
      .upsert({
        school_id: schoolId,
        finn_notes: (existingPlan as Record<string, unknown> | null)?.finn_notes ?? null,
        suggestions,
        suggestions_generated_at: new Date().toISOString(),
        suggestions_model_used: 'claude-opus-4-7',
      }, { onConflict: 'school_id' })
      .select('*')
      .single()

    if (error) {
      console.error('[message-plan] upsert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ plan })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[message-plan] generation failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH — update finn_notes
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: schoolId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { finn_notes } = await req.json() as { finn_notes: string }

  const db = admin()

  const { data: plan, error } = await db
    .from('school_message_plan')
    .upsert({
      school_id: schoolId,
      finn_notes: finn_notes?.trim() || null,
    }, { onConflict: 'school_id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ plan })
}

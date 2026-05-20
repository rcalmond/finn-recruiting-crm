import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { generateSchoolMessagePlan } from '@/lib/school-message-plan-generator'
import { fetchSchoolContext } from '@/lib/school-context'
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
      .select('*, message:messages(*), contact_log:contact_log(date, summary)')
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

  // Shared context + route-specific fetches
  const [
    ctx,
    { data: activeMessages },
    { data: coverageRows },
    { data: existingPlan },
  ] = await Promise.all([
    fetchSchoolContext(db, schoolId),
    db.from('messages').select('*').eq('status', 'active'),
    db.from('school_message_log')
      .select('*, message:messages(*)')
      .eq('school_id', schoolId),
    db.from('school_message_plan')
      .select('*').eq('school_id', schoolId).maybeSingle(),
  ])

  const { school, coaches, contactLog: history, upcomingCamps: camps, declineHistory: declineRows } = ctx

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

    // Merge manual_order: keep message_ids that survive regeneration, drop stale ones
    const existingOrder = (existingPlan as Record<string, unknown> | null)?.manual_order as string[] | null
    let mergedOrder: string[] | null = null
    if (existingOrder && existingOrder.length > 0) {
      const newIds = new Set(result.items.map(i => i.message_id))
      mergedOrder = existingOrder.filter(id => newIds.has(id))
      if (mergedOrder.length === 0) mergedOrder = null
    }

    // Upsert plan
    const { data: plan, error } = await db
      .from('school_message_plan')
      .upsert({
        school_id: schoolId,
        finn_notes: (existingPlan as Record<string, unknown> | null)?.finn_notes ?? null,
        suggestions,
        suggestions_generated_at: new Date().toISOString(),
        suggestions_model_used: 'claude-opus-4-7',
        manual_order: mergedOrder,
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

  const body = await req.json() as { finn_notes?: string; manual_order?: string[] }

  const db = admin()

  const updates: Record<string, unknown> = { school_id: schoolId }
  if ('finn_notes' in body) updates.finn_notes = body.finn_notes?.trim() || null
  if ('manual_order' in body) updates.manual_order = body.manual_order ?? null

  const { data: plan, error } = await db
    .from('school_message_plan')
    .upsert(updates, { onConflict: 'school_id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ plan })
}

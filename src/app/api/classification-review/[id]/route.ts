/**
 * POST /api/classification-review/[id]
 *
 * Override classification on a contact_log row and mark confidence='high'
 * (human-confirmed). Removes the row from the low-confidence review queue.
 *
 * Body: {
 *   action: 'override'
 *   authored_by: AuthoredBy
 *   intent: Intent
 * } | {
 *   action: 'mark-unknown'
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const AUTHORED_BY_VALUES = ['coach_personal', 'coach_via_platform', 'team_automated', 'staff_non_coach', 'unknown']
const INTENT_VALUES       = ['requires_reply', 'requires_action', 'informational', 'acknowledgement', 'decline', 'unknown']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json() as Record<string, unknown>

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch the row to verify it exists and is low-confidence
  const { data: row, error: fetchErr } = await admin
    .from('contact_log')
    .select('id, direction, classification_confidence, classified_at')
    .eq('id', id)
    .single()

  if (fetchErr || !row) return NextResponse.json({ error: 'Row not found' }, { status: 404 })
  if (row.direction !== 'Inbound') return NextResponse.json({ error: 'Not an inbound row' }, { status: 400 })

  if (body.action === 'mark-unknown') {
    const { error } = await admin
      .from('contact_log')
      .update({
        authored_by:               'unknown',
        intent:                    'unknown',
        classification_confidence: 'low',
        classification_notes:      'Human review: unable to classify',
        classified_at:             new Date().toISOString(),
      })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'override') {
    const authored_by = body.authored_by as string
    const intent      = body.intent as string

    if (!AUTHORED_BY_VALUES.includes(authored_by))
      return NextResponse.json({ error: `Invalid authored_by: ${authored_by}` }, { status: 400 })
    if (!INTENT_VALUES.includes(intent))
      return NextResponse.json({ error: `Invalid intent: ${intent}` }, { status: 400 })

    const { error } = await admin
      .from('contact_log')
      .update({
        authored_by,
        intent,
        classification_confidence: 'high',
        classification_notes:      'Human override',
        classified_at:             new Date().toISOString(),
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

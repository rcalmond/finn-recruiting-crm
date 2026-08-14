/**
 * POST /api/camp-prep/save
 *
 * The CONFIRM step. Persists the user-confirmed camp extraction as a prep_docs
 * draft (doc_type='camp', content=null, storage_path=null, source='generated').
 * Insert on first save, update when resuming an existing draft. Snapshots are taken
 * from the camp row at insert time and NOT changed on update.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CampExtraction, CampPrepInputs } from '@/lib/camp-prep'

export const runtime = 'nodejs'

function formatCampDates(start: string, end: string): string {
  try {
    const s = new Date(start + 'T12:00:00Z')
    const e = new Date(end + 'T12:00:00Z')
    const mon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
    const day = (d: Date) => d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })
    const yr = e.getUTCFullYear()
    if (start === end) return `${mon(s)} ${day(s)}, ${yr}`
    if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear())
      return `${mon(s)} ${day(s)}–${day(e)}, ${yr}`
    return `${mon(s)} ${day(s)} – ${mon(e)} ${day(e)}, ${yr}`
  } catch {
    return `${start} to ${end}`
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { campId, inputs, extractedSchedule, existingDocId } = (await req.json()) as {
    campId?: string
    inputs?: CampPrepInputs
    extractedSchedule?: CampExtraction
    existingDocId?: string | null
  }
  if (!campId || !inputs || !extractedSchedule) {
    return NextResponse.json({ error: 'Missing campId, inputs, or extractedSchedule' }, { status: 400 })
  }

  const db = supabase // T1: user client — RLS enforces the family boundary

  const { data: camp } = await db
    .from('camps')
    .select('id, name, start_date, end_date, host_school_id')
    .eq('id', campId)
    .single()
  if (!camp) return NextResponse.json({ error: 'Camp not found' }, { status: 404 })

  if (existingDocId) {
    // Resume: update inputs + extracted_schedule; leave snapshots (insert-time) alone.
    const { data: doc, error } = await db
      .from('prep_docs')
      .update({ inputs, extracted_schedule: extractedSchedule, generated_at: new Date().toISOString() })
      .eq('id', existingDocId)
      .eq('doc_type', 'camp')
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ docId: doc.id, updated: true })
  }

  const { data: doc, error } = await db
    .from('prep_docs')
    .insert({
      school_id: camp.host_school_id,      // prep_docs.school_id is NOT NULL
      coach_id: null,
      // coach_name_snapshot is NOT NULL on prep_docs and meaningless for a camp doc;
      // use the camp name as a placeholder. (Flagged for a future nullable migration.)
      coach_name_snapshot: camp.name,
      doc_type: 'camp',
      camp_id: campId,
      camp_name_snapshot: camp.name,
      camp_dates_snapshot: formatCampDates(camp.start_date, camp.end_date),
      inputs,
      extracted_schedule: extractedSchedule,
      content: null,
      storage_path: null,
      source: 'generated',
      tool_call_count: null,
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ docId: doc.id, updated: false })
}

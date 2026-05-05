/**
 * POST /api/camp-proposals/[id]/apply
 * POST /api/camp-proposals/[id]/reject
 *
 * Apply or reject a camp proposal. Apply creates or updates a camp
 * from the proposed data. Reject marks the proposal as rejected.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { CampProposalProposedData } from '@/lib/types'

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)

  if (!body || !['apply', 'reject'].includes(body.action)) {
    return NextResponse.json({ error: 'Expected { action: "apply"|"reject" }' }, { status: 400 })
  }

  const admin = serviceClient()

  // Fetch proposal
  const { data: proposal, error: fetchErr } = await admin
    .from('camp_proposals')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !proposal) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (proposal.status !== 'pending') {
    return NextResponse.json({ error: `Already ${proposal.status}` }, { status: 409 })
  }

  // ── Reject ──────────────────────────────────────────────────────────────────

  if (body.action === 'reject') {
    await admin
      .from('camp_proposals')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', id)
    return NextResponse.json({ ok: true, action: 'reject' })
  }

  // ── Apply ───────────────────────────────────────────────────────────────────

  const proposed = (body.edited_data ?? proposal.proposed_data) as CampProposalProposedData
  const markInterested = body.mark_finn_interested !== false // default true
  let campId = proposal.matched_camp_id

  if (!campId) {
    // Create new camp
    const { data: camp, error: insertErr } = await admin
      .from('camps')
      .insert({
        host_school_id: proposal.host_school_id,
        name: proposed.name,
        start_date: proposed.start_date,
        end_date: proposed.end_date ?? proposed.start_date,
        location: proposed.location,
        registration_url: proposed.registration_url,
        registration_deadline: proposed.registration_deadline,
        cost: proposed.cost,
        notes: proposed.notes,
      })
      .select('id')
      .single()

    if (insertErr || !camp) {
      return NextResponse.json({ error: `Camp insert failed: ${insertErr?.message}` }, { status: 500 })
    }
    campId = camp.id
  } else {
    // Update existing camp with non-null proposed fields
    const updates: Record<string, unknown> = {}
    if (proposed.location) updates.location = proposed.location
    if (proposed.registration_url) updates.registration_url = proposed.registration_url
    if (proposed.registration_deadline) updates.registration_deadline = proposed.registration_deadline
    if (proposed.cost) updates.cost = proposed.cost
    if (proposed.notes) updates.notes = proposed.notes

    if (Object.keys(updates).length > 0) {
      await admin.from('camps').update(updates).eq('id', campId)
    }
  }

  // Add attendee schools (skip duplicates)
  if (proposed.attendee_school_ids.length > 0) {
    for (const schoolId of proposed.attendee_school_ids) {
      await admin
        .from('camp_school_attendees')
        .upsert(
          { camp_id: campId, school_id: schoolId, source: 'advertised' },
          { onConflict: 'camp_id,school_id' }
        )
    }
  }

  // Mark Finn interested
  if (markInterested) {
    const { data: existing } = await admin
      .from('camp_finn_status')
      .select('id')
      .eq('camp_id', campId)
      .limit(1)

    if (!existing || existing.length === 0) {
      await admin
        .from('camp_finn_status')
        .insert({ camp_id: campId, status: 'interested' })
    }
  }

  // Update proposal status
  await admin
    .from('camp_proposals')
    .update({
      status: 'applied',
      matched_camp_id: campId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)

  return NextResponse.json({ ok: true, action: 'apply', campId })
}

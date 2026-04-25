/**
 * /api/campaigns/[id]/schools/[schoolId]
 * PATCH — per-school actions within a campaign:
 *   { action: 'mark_sent',  channel: 'gmail'|'sr', gmailMessageId?: string }
 *   { action: 'dismiss' }
 *   { action: 'restore' }   — dismissed → pending
 *   { action: 'update_coach', coachId: string }  — refresh coach at draft-open time
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; schoolId: string }> }
) {
  const { id: campaignId, schoolId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    action: 'mark_sent' | 'dismiss' | 'restore' | 'update_coach'
    channel?: 'gmail' | 'sr'
    gmailMessageId?: string
    renderedBody?: string   // first 140 chars used as contact_log summary
    coachId?: string
  }

  const db = admin()

  // Fetch the campaign_schools row
  const { data: cs } = await db
    .from('campaign_schools')
    .select('id, school_id, coach_id, status')
    .eq('campaign_id', campaignId)
    .eq('school_id', schoolId)
    .single()

  if (!cs) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date().toISOString()

  if (body.action === 'mark_sent') {
    if (cs.status !== 'pending') {
      return NextResponse.json({ error: 'School is not in pending status' }, { status: 400 })
    }

    const channel = body.channel === 'gmail' ? 'Email' : 'Sports Recruits'
    const summaryBase = (body.renderedBody ?? '').trim().slice(0, 140)
    let summary = summaryBase
    if (!summary) {
      const { data: camp } = await db.from('campaigns').select('name').eq('id', campaignId).single()
      summary = camp?.name ?? `Campaign outbound — ${channel}`
    }

    // Insert contact_log row
    const { data: logRow, error: logErr } = await db
      .from('contact_log')
      .insert({
        school_id:  schoolId,
        coach_id:   cs.coach_id ?? null,
        date:       now.split('T')[0],
        channel,
        direction:  'Outbound',
        summary,
        created_by: user.id,
        ...(body.channel === 'gmail' && body.gmailMessageId
          ? { gmail_message_id: body.gmailMessageId }
          : {}),
      })
      .select('id')
      .single()

    if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 })

    const { error } = await db
      .from('campaign_schools')
      .update({ status: 'sent', sent_at: now, contact_log_id: logRow.id })
      .eq('id', cs.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'dismiss') {
    const { error } = await db
      .from('campaign_schools')
      .update({ status: 'dismissed', dismissed_at: now })
      .eq('id', cs.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'restore') {
    const { error } = await db
      .from('campaign_schools')
      .update({ status: 'pending', dismissed_at: null })
      .eq('id', cs.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'update_coach') {
    const { error } = await db
      .from('campaign_schools')
      .update({ coach_id: body.coachId ?? null })
      .eq('id', cs.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

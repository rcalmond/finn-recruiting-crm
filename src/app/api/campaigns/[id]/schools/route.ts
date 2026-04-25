/**
 * /api/campaigns/[id]/schools
 * POST — add a single school to a campaign (status = pending, coach resolved from primary)
 *
 * Note: per-school actions (mark_sent, dismiss, restore, update_coach) live in
 * /api/campaigns/[id]/schools/[schoolId]/route.ts
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { schoolId } = await req.json() as { schoolId: string }
  if (!schoolId) return NextResponse.json({ error: 'schoolId is required' }, { status: 400 })

  const db = admin()

  // Verify campaign exists
  const { data: campaign } = await db
    .from('campaigns')
    .select('id, status')
    .eq('id', campaignId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.status === 'completed') {
    return NextResponse.json({ error: 'Cannot add schools to a completed campaign' }, { status: 400 })
  }

  // Check not already in campaign
  const { data: existing } = await db
    .from('campaign_schools')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (existing) return NextResponse.json({ error: 'School is already in this campaign' }, { status: 409 })

  // Resolve primary coach
  const { data: coaches } = await db
    .from('coaches')
    .select('id')
    .eq('school_id', schoolId)
    .eq('is_primary', true)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .limit(1)
  const coachId = coaches?.[0]?.id ?? null

  // Insert row
  const { data: inserted, error: insertErr } = await db
    .from('campaign_schools')
    .insert({
      campaign_id: campaignId,
      school_id:   schoolId,
      coach_id:    coachId,
      status:      'pending',
    })
    .select('id')
    .single()
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // Return row with school + coach joined (same shape as GET /api/campaigns/[id])
  const { data: cs, error: fetchErr } = await db
    .from('campaign_schools')
    .select(`
      id, campaign_id, school_id, coach_id, status,
      sent_at, contact_log_id, dismissed_at, created_at,
      school:schools(id, name, short_name, category),
      coach:coaches(id, name, role, email)
    `)
    .eq('id', inserted.id)
    .single()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  return NextResponse.json({ cs })
}

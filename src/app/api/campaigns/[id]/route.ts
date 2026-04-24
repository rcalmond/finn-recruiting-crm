/**
 * /api/campaigns/[id]
 * GET   — campaign detail with all campaign_schools (school + coach joined)
 * PATCH — status transitions: activate, pause, resume, complete
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

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft:     ['active'],
  active:    ['paused', 'completed'],
  paused:    ['active', 'completed'],
  completed: [],
}

// ── GET /api/campaigns/[id] ───────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()

  const { data: campaign, error: campErr } = await db
    .from('campaigns')
    .select('*, template:campaign_templates(id, name, body, created_at, updated_at)')
    .eq('id', id)
    .single()

  if (campErr || !campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: schools, error: schoolsErr } = await db
    .from('campaign_schools')
    .select(`
      id, campaign_id, school_id, coach_id, status,
      sent_at, contact_log_id, dismissed_at, created_at,
      school:schools(id, name, short_name, category),
      coach:coaches(id, name, role, email)
    `)
    .eq('campaign_id', id)
    .order('created_at', { ascending: true })

  if (schoolsErr) return NextResponse.json({ error: schoolsErr.message }, { status: 500 })

  return NextResponse.json({ campaign, schools: schools ?? [] })
}

// ── PATCH /api/campaigns/[id] ─────────────────────────────────────────────────
//
// Body: { action: 'activate' | 'pause' | 'resume' | 'complete' }

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action } = await req.json() as { action: string }

  const db = admin()
  const { data: campaign } = await db
    .from('campaigns')
    .select('status')
    .eq('id', id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const targetStatus = action === 'activate' ? 'active'
    : action === 'pause'    ? 'paused'
    : action === 'resume'   ? 'active'
    : action === 'complete' ? 'completed'
    : null

  if (!targetStatus) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const allowed = VALID_TRANSITIONS[campaign.status] ?? []
  if (!allowed.includes(targetStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from ${campaign.status} to ${targetStatus}` },
      { status: 400 }
    )
  }

  const updates: Record<string, unknown> = { status: targetStatus }
  if (targetStatus === 'active' && campaign.status === 'draft') updates.activated_at = new Date().toISOString()
  if (targetStatus === 'completed') updates.completed_at = new Date().toISOString()

  const { error } = await db.from('campaigns').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, status: targetStatus })
}

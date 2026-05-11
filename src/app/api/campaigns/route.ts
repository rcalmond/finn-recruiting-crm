/**
 * /api/campaigns
 * GET  — list all campaigns with pending/sent/dismissed counts
 * POST — create a new campaign (template + campaign + campaign_schools)
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

// ── GET /api/campaigns ────────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: campaigns, error } = await db
    .from('campaigns')
    .select('*, template:campaign_templates(id, name, body, created_at, updated_at)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach per-campaign school status counts
  const ids = (campaigns ?? []).map(c => c.id)
  const { data: counts } = ids.length > 0
    ? await db
        .from('campaign_schools')
        .select('campaign_id, status')
        .in('campaign_id', ids)
    : { data: [] }

  const countMap: Record<string, Record<string, number>> = {}
  for (const row of counts ?? []) {
    if (!countMap[row.campaign_id]) countMap[row.campaign_id] = {}
    countMap[row.campaign_id][row.status] = (countMap[row.campaign_id][row.status] ?? 0) + 1
  }

  const result = (campaigns ?? []).map(c => ({
    ...c,
    counts: countMap[c.id] ?? {},
  }))

  return NextResponse.json({ campaigns: result })
}

// ── POST /api/campaigns ───────────────────────────────────────────────────────
//
// Body:
//   name:         string                 -- campaign name
//   templateName: string                 -- template name
//   body:         string                 -- template body
//   throttleDays: number                 -- default 7
//   schoolIds:    string[]               -- explicit school UUIDs selected in scope step

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    name: string
    templateName: string
    body: string
    throttleDays: number
    schoolIds: string[]
    messageSet?: string
  }

  const { name, templateName, body: templateBody, throttleDays, schoolIds, messageSet } = body
  if (!name?.trim() || !templateBody?.trim() || !Array.isArray(schoolIds) || schoolIds.length === 0) {
    return NextResponse.json({ error: 'name, body, and at least one school are required' }, { status: 400 })
  }

  const db = admin()

  // 1. Insert template
  const { data: tmpl, error: tmplErr } = await db
    .from('campaign_templates')
    .insert({ name: templateName || name, body: templateBody })
    .select('id')
    .single()
  if (tmplErr) return NextResponse.json({ error: tmplErr.message }, { status: 500 })

  // 2. Insert campaign
  const { data: camp, error: campErr } = await db
    .from('campaigns')
    .insert({
      name,
      template_id: tmpl.id,
      status: 'draft',
      tier_scope: ['A', 'B'],
      throttle_days: throttleDays ?? 7,
      message_set: messageSet?.trim() || null,
    })
    .select('id')
    .single()
  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 })

  // 3. Resolve primary coach per school
  const { data: coaches } = await db
    .from('coaches')
    .select('id, school_id')
    .eq('is_primary', true)
    .eq('is_active', true)
    .in('school_id', schoolIds)
    .order('sort_order', { ascending: true, nullsFirst: false })
  // DISTINCT ON equivalent: keep first coach per school
  const coachBySchool = new Map<string, string>()
  for (const c of coaches ?? []) {
    if (!coachBySchool.has(c.school_id)) coachBySchool.set(c.school_id, c.id)
  }

  // 4. Insert campaign_schools — all pending
  const rows = schoolIds.map(sid => ({
    campaign_id: camp.id,
    school_id: sid,
    coach_id: coachBySchool.get(sid) ?? null,
    status: 'pending',
  }))

  const { error: csErr } = await db.from('campaign_schools').insert(rows)
  if (csErr) return NextResponse.json({ error: csErr.message }, { status: 500 })

  return NextResponse.json({ campaignId: camp.id })
}

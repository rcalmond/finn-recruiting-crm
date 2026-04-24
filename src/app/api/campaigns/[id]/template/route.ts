/**
 * /api/campaigns/[id]/template
 * PATCH — update the campaign's template body (and name optionally).
 *         Allowed in both draft and active status (active shows a note in the UI).
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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, body } = await req.json() as { name?: string; body?: string }
  if (!body?.trim()) return NextResponse.json({ error: 'body is required' }, { status: 400 })

  const db = admin()

  // Look up template_id via campaign
  const { data: campaign } = await db
    .from('campaigns')
    .select('template_id, status')
    .eq('id', id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const updates: Record<string, unknown> = { body, updated_at: new Date().toISOString() }
  if (name?.trim()) updates.name = name.trim()

  const { error } = await db
    .from('campaign_templates')
    .update(updates)
    .eq('id', campaign.template_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

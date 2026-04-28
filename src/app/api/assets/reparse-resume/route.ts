/**
 * POST /api/assets/reparse-resume
 *
 * Manually trigger a re-parse of the current resume asset into player_profile.
 * Used when auto-parse on upload fails or when Finn wants to force a refresh.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { parseAndUpsertResume } from '@/lib/asset-parsers'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()

  // Find the current resume asset
  const { data: resume, error } = await db
    .from('assets')
    .select('id, storage_path')
    .eq('type', 'resume')
    .eq('is_current', true)
    .limit(1)
    .single()

  if (error || !resume) {
    return NextResponse.json({ error: 'No current resume found' }, { status: 404 })
  }

  if (!resume.storage_path) {
    return NextResponse.json({ error: 'Resume has no storage path' }, { status: 400 })
  }

  await parseAndUpsertResume(resume.id, resume.storage_path)

  return NextResponse.json({ ok: true, assetId: resume.id })
}

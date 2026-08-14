/**
 * POST /api/assets/reparse-resume
 *
 * Manually trigger a re-parse of the current resume asset into player_profile.
 * Used when auto-parse on upload fails or when Finn wants to force a refresh.
 */

import { NextResponse } from 'next/server'
import { getFamilyContext } from '@/lib/require-family'
import { parseAndUpsertResume } from '@/lib/asset-parsers'

export async function POST() {
  // Auth + family (T1)
  const fam = await getFamilyContext()
  if (!fam.ok) return NextResponse.json({ error: fam.status === 401 ? 'Unauthorized' : 'No family' }, { status: fam.status })
  const { familyId, supabase } = fam.ctx

  const db = supabase // T1: user client — RLS enforces the family boundary

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

  await parseAndUpsertResume(resume.id, resume.storage_path, familyId)

  return NextResponse.json({ ok: true, assetId: resume.id })
}

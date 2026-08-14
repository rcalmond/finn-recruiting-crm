/**
 * GET /api/classification-review/count
 * Returns { count } of low-confidence classified inbound rows.
 * Session-authenticated.
 */

import { NextResponse } from 'next/server'
import { familyAdmin } from '@/lib/tenant-db'
import { getFamilyContext } from '@/lib/require-family'

export async function GET() {
  const fam = await getFamilyContext()
  if (!fam.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const familyId = fam.ctx.familyId

  const admin = familyAdmin(familyId) // T1: service role, family-scoped

  const { count, error } = await admin
    .from('contact_log')
    .select('id', { count: 'exact', head: true })
    .eq('direction', 'Inbound')
    .eq('classification_confidence', 'low')
    .not('classified_at', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ count: count ?? 0 })
}

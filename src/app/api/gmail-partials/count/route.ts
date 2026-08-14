/**
 * GET /api/gmail-partials/count
 *
 * Returns { count: number } of gmail rows with parse_status = 'partial'.
 * Used for the sidebar badge. Session-authenticated.
 */

import { NextResponse } from 'next/server'
import { familyAdmin } from '@/lib/tenant-db'
import { getFamilyContext } from '@/lib/require-family'

export async function GET() {
  const fam = await getFamilyContext()
  if (!fam.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const familyId = fam.ctx.familyId

  try {
    const admin = familyAdmin(familyId) // T1: service role, family-scoped

    const { count } = await admin
      .from('contact_log')
      .select('id', { count: 'exact', head: true })
      .eq('parse_status', 'partial')
      .not('gmail_message_id', 'is', null)

    return NextResponse.json({ count: count ?? 0 })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}

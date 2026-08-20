/**
 * GET /api/admin/catalog-search?q=<free text> — the reviewer's escape hatch.
 *
 * DELIBERATELY NOT THE MATCHER. school-match.ts is strict on purpose: its
 * descriptor guard refuses "University of Wisconsin Madison" -> "Wisconsin"
 * because "madison" is a place name, not a descriptor, and that refusal is
 * correct — it is what stops "Georgia Tech" becoming "Georgia College".
 *
 * But the refusal is only half a design. The guard trades false positives for
 * false negatives ON THE UNDERSTANDING THAT A HUMAN CATCHES THE REMAINDER, and
 * until this existed the human had no way to: the review screen offered merge
 * only into rows the matcher itself had found, so exactly the cases the guard
 * was built to hand over were the cases a reviewer could not resolve. Their only
 * honest option was to leave them pending forever.
 *
 * So this is a plain substring search with no cleverness at all. A person is
 * reading the results; precision is their job, and the discriminators they need
 * (division, state, city) come back with every row.
 */
import { NextRequest, NextResponse } from 'next/server'
import { catalogAdmin } from '@/lib/tenant-db'
import { requireAdmin } from '@/lib/admin-gate'

const LIMIT = 20

export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ rows: [] })

  // Escape PostgREST's or() delimiters so a stray comma or paren cannot break
  // out of the filter expression.
  const safe = q.replace(/[,()*]/g, ' ').trim()
  if (!safe) return NextResponse.json({ rows: [] })

  const { data, error } = await catalogAdmin()
    .from('discovery_schools')
    .select('id, name, short_name, division, state, city')
    .or(`name.ilike.%${safe}%,short_name.ilike.%${safe}%`)
    .order('name')
    .limit(LIMIT)

  if (error) {
    console.error('[catalog-search]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rows: data ?? [], truncated: (data ?? []).length === LIMIT })
}

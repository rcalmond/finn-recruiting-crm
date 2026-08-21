/**
 * GET /api/admin/catalog-search?q= — the reviewer's escape hatch.
 *
 * The matcher refuses colloquial and place-name forms by design, handing them
 * to a human; before this existed the review screen offered merge only into
 * rows the matcher had found, so exactly the handed-over cases were the ones a
 * reviewer could not resolve.
 *
 * Shares one implementation with the family-facing route (catalog-search.ts) so
 * the two cannot drift; only the gate differs.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-gate'
import { searchCatalog } from '@/lib/catalog-search'

export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    return NextResponse.json(await searchCatalog(req.nextUrl.searchParams.get('q') ?? ''))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'search failed' }, { status: 500 })
  }
}

/**
 * GET /api/catalog-search?q=<free text> — family-facing catalog lookup.
 *
 * Same search as the admin reviewer's, same implementation (catalog-search.ts),
 * different gate: a family may look up catalog rows to link one of THEIR OWN
 * schools. discovery_schools is a shared catalog with nothing family-specific
 * in it, so there is nothing here a family should not see.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getFamilyContext } from '@/lib/require-family'
import { searchCatalog } from '@/lib/catalog-search'

export async function GET(req: NextRequest) {
  const fam = await getFamilyContext()
  if (!fam.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await searchCatalog(req.nextUrl.searchParams.get('q') ?? ''))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'search failed' }, { status: 500 })
  }
}

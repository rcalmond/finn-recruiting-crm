/**
 * GET /api/catalog-match?q=<typed name>
 *
 * "Which catalog rows might this be?" — the disambiguation step of the
 * add-a-school flow, and deliberately a SERVER route rather than a client-side
 * filter over whatever rows the browser happens to have.
 *
 * Two reasons it lives here:
 *  1. The matcher must see the WHOLE catalog. A client-side match over a paged
 *     or facet-filtered subset would refuse real schools and send the family
 *     on to create a duplicate — the 1000-row cap wearing a new hat.
 *  2. One matcher implementation, shared with E1 linkage, auto-add and admin
 *     review. A second copy in the browser would drift.
 *
 * Returns candidates and NEVER a selection. See school-match.ts for why a lone
 * exact hit still requires a click.
 */
import { NextRequest, NextResponse } from 'next/server'
import { catalogAdmin } from '@/lib/tenant-db'
import { getFamilyContext } from '@/lib/require-family'
import { fetchAll } from '@/lib/fetch-all'
import { matchCatalog, type CatalogCandidateRow } from '@/lib/school-match'

const COLS = 'id, name, short_name, division, state, city'

export async function GET(req: NextRequest) {
  const fam = await getFamilyContext()
  if (!fam.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (!q) return NextResponse.json({ tier: 'none', candidates: [], ambiguous: false })

  try {
    const catalog = await fetchAll<CatalogCandidateRow>(catalogAdmin(), 'discovery_schools', COLS, { orderBy: 'id' })
    const result = matchCatalog(q, catalog)
    return NextResponse.json({ ...result, catalogSize: catalog.length })
  } catch (err) {
    // fetchAll throws on a short read. Refusing is correct: a match computed
    // against a partial catalog is worse than no match, because it looks like
    // an answer.
    const message = err instanceof Error ? err.message : 'catalog read failed'
    console.error('[catalog-match]', message)
    return NextResponse.json({ error: message }, { status: 503 })
  }
}

/**
 * GET /api/catalog-match?q=<typed name>
 *
 * "Which catalog rows might this be — and do you already have it?"
 *
 * TWO QUESTIONS, AND THE SECOND ONE CAME FROM A REAL COLLISION. This route
 * originally checked the CATALOG only. On 2026-08-20 a family that already held
 * "Trinity College (CT)" from their intake starting list typed "Trinity", was
 * shown catalog candidates, said none matched, and ended up with a SECOND row on
 * the same catalog school. The near-match step was doing its job against the
 * wrong set: a family's own list is the first place a typed name should be
 * looked for, because the answer there is not "create" but "you already have
 * this, here it is".
 *
 * So the family's own schools are matched FIRST, with the same matcher, and
 * catalog candidates the family already holds are flagged rather than offered as
 * fresh adds.
 *
 * The matcher must see the WHOLE catalog — a client-side match over a paged or
 * facet-filtered subset would refuse real schools and send the family on to
 * create a duplicate, which is the 1000-row cap wearing a new hat.
 *
 * Returns candidates and NEVER a selection. See school-match.ts for why a lone
 * exact hit still requires a click.
 */
import { NextRequest, NextResponse } from 'next/server'
import { catalogAdmin, familyAdmin } from '@/lib/tenant-db'
import { getFamilyContext } from '@/lib/require-family'
import { fetchAll } from '@/lib/fetch-all'
import { matchCatalog, type CatalogCandidateRow } from '@/lib/school-match'

const COLS = 'id, name, short_name, division, state, city'
const FAMILY_COLS = 'id, name, short_name, division, discovery_school_id'

interface FamilySchool {
  id: string
  name: string
  short_name: string | null
  division: string | null
  discovery_school_id: string | null
}

export async function GET(req: NextRequest) {
  const fam = await getFamilyContext()
  if (!fam.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (!q) return NextResponse.json({ tier: 'none', candidates: [], ambiguous: false, onList: [] })

  try {
    const [catalog, mine] = await Promise.all([
      fetchAll<CatalogCandidateRow>(catalogAdmin(), 'discovery_schools', COLS, { orderBy: 'id' }),
      fetchAll<FamilySchool>(familyAdmin(fam.ctx.familyId), 'schools', FAMILY_COLS, { orderBy: 'id' }),
    ])

    // ── 1. Is it already on THEIR list, by name? ───────────────────────────
    // Same matcher, pointed at the family's own rows. A family school carries
    // the fields the matcher needs, so this needs no second implementation.
    const asCandidates: CatalogCandidateRow[] = mine.map(s => ({
      id: s.id, name: s.name, short_name: s.short_name, division: s.division, state: null,
    }))
    const onListMatch = matchCatalog(q, asCandidates)
    const onList = onListMatch.candidates.map(c => ({
      id: c.id, name: c.name, division: c.division,
    }))

    // ── 2. Catalog candidates, flagging any the family ALREADY holds ───────
    const result = matchCatalog(q, catalog)
    const heldByCatalogId = new Map(
      mine.filter(s => s.discovery_school_id).map(s => [s.discovery_school_id as string, s]),
    )
    const candidates = result.candidates.map(c => {
      const held = heldByCatalogId.get(c.id)
      return { ...c, alreadyOnList: held ? { id: held.id, name: held.name } : null }
    })

    return NextResponse.json({
      tier: result.tier,
      ambiguous: result.ambiguous,
      candidates,
      onList,
      catalogSize: catalog.length,
    })
  } catch (err) {
    // fetchAll throws on a short read. Refusing is correct: a match computed
    // against a partial catalog is worse than no match, because it looks like
    // an answer.
    const message = err instanceof Error ? err.message : 'catalog read failed'
    console.error('[catalog-match]', message)
    return NextResponse.json({ error: message }, { status: 503 })
  }
}

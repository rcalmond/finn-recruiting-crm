/**
 * POST /api/catalog-proposals — "my school isn't in the list, add it anyway."
 *
 * PROPOSE-DON'T-CREATE, pointed at the catalog itself. The family gets the
 * school on their list IMMEDIATELY — they came to add a school and waiting on
 * an admin would be absurd — while the CATALOG gets it only when a human
 * accepts. Two writes, two different owners:
 *
 *   schools             the family's relationship row, theirs, effective now
 *   catalog_proposals   a claim about the world, reviewed before it is believed
 *
 * THE MATCHER RUNS AGAIN HERE, server-side, over the whole catalog. The client
 * already ran it to show candidates, but a client can be stale (the catalog
 * moved) or simply wrong (a hand-rolled request). Whatever THIS run returns is
 * what gets frozen onto the proposal, so a reviewer sees what was actually true
 * at proposal time rather than what a browser claimed.
 *
 * NO DIVISION IS INVENTED. The family typed a name; they did not type a
 * division. The old off-universe add defaulted to 'D3' and that was an
 * invent-something violation — a fabricated fact that browses as if verified.
 * The column stays null until the catalog answers.
 */
import { NextRequest, NextResponse } from 'next/server'
import { catalogAdmin, familyAdmin } from '@/lib/tenant-db'
import { getFamilyContext } from '@/lib/require-family'
import { fetchAll } from '@/lib/fetch-all'
import { matchCatalog, freezeCandidates, type CatalogCandidateRow } from '@/lib/school-match'

const COLS = 'id, name, short_name, division, state, city'

export async function POST(req: NextRequest) {
  const fam = await getFamilyContext()
  if (!fam.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const familyId = fam.ctx.familyId

  const body = await req.json().catch(() => ({})) as { name?: string }
  const name = (body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  let candidates
  try {
    const catalog = await fetchAll<CatalogCandidateRow>(catalogAdmin(), 'discovery_schools', COLS, { orderBy: 'id' })
    candidates = freezeCandidates(matchCatalog(name, catalog))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'catalog read failed'
    console.error('[catalog-proposals] catalog read failed:', message)
    return NextResponse.json({ error: message }, { status: 503 })
  }

  const db = familyAdmin(familyId)

  // 1. The family's row, effective immediately. C-tier like every other add.
  //    division/conference/location stay NULL — not guessed.
  const { data: school, error: schoolErr } = await db
    .from('schools')
    .insert({
      name,
      short_name: null,
      category: 'C',
      status: 'Not Contacted',
      division: null,
      conference: null,
      location: null,
      recruiting_stage: 1,
      videos_sent: false,
      aliases: [],
      discovery_school_id: null,          // not in the catalog yet, by definition
      // 'manual' is the honest existing value — the family added this by hand.
      // The SPECIFIC provenance (not found in the catalog, proposed for review)
      // lives in origin_note and in the catalog_proposals row, which points back
      // here via origin_school_id, so nothing is lost by not minting a new
      // origin enum value for it.
      origin: 'manual',
      origin_note: `Added by the family as "${name}" — not found in the catalog; proposed for review.`,
    })
    .select('id, name')
    .single()

  if (schoolErr || !school) {
    console.error('[catalog-proposals] school insert failed:', schoolErr?.message)
    // schools.division is currently NOT NULL with a CHECK limited to the five
    // known divisions, so there is no way to record "we do not know yet" — which
    // is exactly why the old off-universe add fabricated 'D3'. Refusing to
    // invent one is correct; the schema has to allow the honest value. Until
    // then this path cannot complete, and it says so plainly rather than
    // leaking a constraint name at a family.
    const blockedByDivision = /division/.test(schoolErr?.message ?? '')
    return NextResponse.json({
      error: blockedByDivision
        ? 'Adding a school that is not in the catalog is not available yet. Nothing was changed.'
        : (schoolErr?.message ?? 'could not add the school'),
    }, { status: blockedByDivision ? 503 : 500 })
  }

  // 2. The claim about the world, for review. Failure here must NOT undo the
  //    family's row — they still want the school. It becomes an unlinked school
  //    exactly like the 32 legacy ones, which is a known survivable state.
  const { data: proposal, error: proposalErr } = await catalogAdmin()
    .from('catalog_proposals')
    .insert({
      proposed_name: name,
      proposed_by_family_id: familyId,
      proposed_by: fam.ctx.user.id,
      origin_school_id: school.id,
      candidates,
      status: 'pending',
    })
    .select('id')
    .single()

  if (proposalErr) {
    console.error('[catalog-proposals] proposal insert failed (school kept):', proposalErr.message)
    return NextResponse.json({
      ok: true, schoolId: school.id, proposalId: null,
      warning: 'Added to your list, but the catalog proposal could not be recorded.',
    })
  }

  return NextResponse.json({ ok: true, schoolId: school.id, proposalId: (proposal as { id: string }).id })
}

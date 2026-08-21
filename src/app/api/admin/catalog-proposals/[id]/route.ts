/**
 * POST /api/admin/catalog-proposals/[id] — resolve one catalog proposal.
 *
 * Three outcomes, and MERGE is the one that matters most:
 *
 *   ACCEPT  the school is real and not in the catalog -> create a catalog row
 *   MERGE   it IS in the catalog under another name  -> link, create nothing
 *   REJECT  not a real program, or already handled   -> record and stop
 *
 * WHY MERGE EXISTS: the matcher deliberately errs toward false negatives, so a
 * family proposing "University of Wisconsin Madison" never saw "Wisconsin"
 * offered — its extra token is a place name, not a descriptor. Admin review is
 * where that is caught, which is why the review screen runs the SAME matcher
 * again and leads with its candidates. Duplicate prevention does not rest on
 * family judgment alone.
 *
 * AN ACCEPTED ROW IS A STUB AND SHOULD LOOK LIKE ONE. The family typed a name.
 * Division, state and city come from the REVIEWER — that is the actual work of
 * reviewing. Everything else stays null or empty: conference, enrollment_band,
 * academic_band, programs, and above all domains, which feeds sender matching
 * and is populated only from observed coach addresses. A half-guessed facet row
 * is worse than an honest sparse one, because it browses as if complete.
 *
 * THE FAMILY'S ROW IS NEVER DELETED, UNLINKED OR RE-TIERED BY ANY OUTCOME. They
 * asked for this school; review decides what the CATALOG knows, not what the
 * family wants. On reject it keeps a null discovery_school_id — the same known,
 * survivable state as the legacy unlinked schools.
 */
import { NextRequest, NextResponse } from 'next/server'
import { catalogAdmin, familyAdmin, rawService } from '@/lib/tenant-db'
import { requireAdmin } from '@/lib/admin-gate'

const REGION_BY_STATE: Record<string, string> = {
  CT: 'Northeast', MA: 'Northeast', ME: 'Northeast', NH: 'Northeast', RI: 'Northeast', VT: 'Northeast', NY: 'Northeast',
  NJ: 'Mid-Atlantic', PA: 'Mid-Atlantic', DE: 'Mid-Atlantic', MD: 'Mid-Atlantic', DC: 'Mid-Atlantic', VA: 'Mid-Atlantic', WV: 'Mid-Atlantic',
  NC: 'Southeast', SC: 'Southeast', GA: 'Southeast', FL: 'Southeast', TN: 'Southeast', KY: 'Southeast', AL: 'Southeast', MS: 'Southeast', AR: 'Southeast', LA: 'Southeast',
  OH: 'Midwest', MI: 'Midwest', IN: 'Midwest', IL: 'Midwest', WI: 'Midwest', MN: 'Midwest', IA: 'Midwest', MO: 'Midwest', ND: 'Midwest', SD: 'Midwest', NE: 'Midwest', KS: 'Midwest',
  TX: 'Southwest', OK: 'Southwest', NM: 'Southwest', AZ: 'Southwest',
  CA: 'West', OR: 'West', WA: 'West', NV: 'West', UT: 'West', CO: 'West', ID: 'West', MT: 'West', WY: 'West', AK: 'West', HI: 'West',
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({})) as {
    action?: 'accept' | 'merge' | 'reject'
    discoveryId?: string           // merge: the existing catalog row
    name?: string                  // accept: reviewer-normalized name
    shortName?: string | null
    division?: string
    state?: string
    city?: string | null
    note?: string
  }

  const db = catalogAdmin()
  const { data: proposal, error: fetchErr } = await db
    .from('catalog_proposals')
    .select('id, status, proposed_name, proposed_by_family_id, origin_school_id')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr || !proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (proposal.status !== 'pending') {
    return NextResponse.json({ error: `Already ${proposal.status}` }, { status: 409 })
  }

  const stamp = {
    reviewed_at: new Date().toISOString(),
    reviewed_by: admin.userId,
    reviewer_note: body.note ?? null,
  }

  /** Link the family's own row to a catalog row. Runs on the PROPOSING family's
   *  client — schools is family-scoped, and the wrapper refuses a cross-family
   *  write, which is the check that stops a mis-keyed proposal touching someone
   *  else's list. */
  async function linkFamilyRow(discoveryId: string): Promise<string | null> {
    if (!proposal!.origin_school_id) return null

    // Carry the catalog's facts onto the family row, exactly as a normal
    // catalog add does (toSchoolInsert copies division and location). Without
    // this the row stays division-null and keeps reading "Unclassified" even
    // though it is now linked to a classified school — the family would see no
    // change from a review that did resolve their request.
    const { data: cat } = await db
      .from('discovery_schools')
      .select('division, city, state, conference')
      .eq('id', discoveryId)
      .maybeSingle()

    const patch: Record<string, unknown> = { discovery_school_id: discoveryId }
    if (cat?.division) patch.division = cat.division
    if (cat?.conference) patch.conference = cat.conference
    const location = [cat?.city, cat?.state].filter(Boolean).join(', ')
    if (location) patch.location = location

    const scoped = familyAdmin(proposal!.proposed_by_family_id as string)
    const { error } = await scoped
      .from('schools')
      .update(patch)
      .eq('id', proposal!.origin_school_id)
    return error?.message ?? null
  }

  // ── REJECT ────────────────────────────────────────────────────────────────
  if (body.action === 'reject') {
    await db.from('catalog_proposals').update({ status: 'rejected', ...stamp }).eq('id', id)
    // The family's row is deliberately untouched. Not deleted, not unlinked,
    // not re-tiered — they still want this school.
    return NextResponse.json({ ok: true, action: 'rejected', familyRowUnchanged: true })
  }

  // ── MERGE ─────────────────────────────────────────────────────────────────
  if (body.action === 'merge') {
    if (!body.discoveryId) {
      return NextResponse.json({ error: 'merge requires discoveryId' }, { status: 400 })
    }
    const { data: target } = await db
      .from('discovery_schools').select('id, name').eq('id', body.discoveryId).maybeSingle()
    if (!target) return NextResponse.json({ error: 'discoveryId not found' }, { status: 404 })

    // REFUSE IF THE FAMILY ALREADY HOLDS THIS SCHOOL. Merging is the act most
    // likely to create a duplicate linkage, because the reviewer is looking at
    // the CATALOG and cannot see the family's list. On 2026-08-20 a merge put a
    // second Testerson row onto Trinity College (CT), which they had held from
    // their intake starting list since the day before — and the unique index on
    // (family_id, discovery_school_id) could not be created until it was undone.
    // The database will enforce this once that index lands; a constraint
    // violation is a terrible way to learn it, so the refusal explains instead
    // and names the row already holding the link.
    const { data: holders } = await familyAdmin(proposal.proposed_by_family_id as string)
      .from('schools')
      .select('id, name')
      .eq('discovery_school_id', body.discoveryId)

    const conflict = (holders ?? []).find(h => h.id !== proposal!.origin_school_id)
    if (conflict) {
      return NextResponse.json({
        error: `This family already has "${conflict.name}" linked to ${target.name}. ` +
               `Merging would create a second row on the same school — reject this proposal instead, ` +
               `or merge it into a different catalog row.`,
        conflictSchool: { id: conflict.id, name: conflict.name },
      }, { status: 409 })
    }

    const linkErr = await linkFamilyRow(body.discoveryId)
    if (linkErr) return NextResponse.json({ error: `link failed: ${linkErr}` }, { status: 500 })

    await db.from('catalog_proposals')
      .update({ status: 'merged', resolved_discovery_id: body.discoveryId, ...stamp })
      .eq('id', id)

    return NextResponse.json({ ok: true, action: 'merged', mergedInto: target.name })
  }

  // ── ACCEPT ────────────────────────────────────────────────────────────────
  if (body.action !== 'accept') {
    return NextResponse.json({ error: 'action must be accept, merge or reject' }, { status: 400 })
  }
  const name = (body.name ?? proposal.proposed_name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!body.division) return NextResponse.json({ error: 'division is required to accept' }, { status: 400 })
  if (!body.state) return NextResponse.json({ error: 'state is required to accept' }, { status: 400 })

  const state = body.state.trim().toUpperCase()

  // rawService: discovery_schools is catalog, and this is the one place a row is
  // created rather than read.
  const { data: created, error: createErr } = await rawService()
    .from('discovery_schools')
    .insert({
      name,
      short_name: body.shortName?.trim() || null,
      division: body.division,
      state,
      city: body.city?.trim() || null,
      region: REGION_BY_STATE[state] ?? null,   // derived, not guessed
      conference: null,
      enrollment_band: null,
      academic_band: null,
      has_engineering: false,
      programs: [],
      domains: [],                               // never seeded — observed addresses only
      note: `Proposed by a family as "${proposal.proposed_name}"; accepted ${new Date().toISOString().slice(0, 10)}.`,
    })
    .select('id, name')
    .single()

  if (createErr || !created) {
    console.error('[catalog-proposals] accept failed:', createErr?.message)
    return NextResponse.json({ error: createErr?.message ?? 'could not create the catalog row' }, { status: 500 })
  }

  const linkErr = await linkFamilyRow(created.id as string)
  if (linkErr) console.error('[catalog-proposals] catalog row created but link failed:', linkErr)

  await db.from('catalog_proposals')
    .update({ status: 'accepted', resolved_discovery_id: created.id, ...stamp })
    .eq('id', id)

  return NextResponse.json({ ok: true, action: 'accepted', discoveryId: created.id, linked: !linkErr })
}

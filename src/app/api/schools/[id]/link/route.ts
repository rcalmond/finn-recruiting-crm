/**
 * POST /api/schools/[id]/link — attach one of the family's schools to a catalog row.
 *
 * THE THIRD DOOR. Unlinked schools recur BY DESIGN, not as a backlog to be
 * drained once: auto-add creates them from inbound mail, family proposals
 * create them, imports create them, and a rejected catalog proposal deliberately
 * leaves one on the family's list. So the mechanism has to exist, not just the
 * one-off fix — SQL would have resolved five rows and left the sixth stranded.
 *
 * IT TAKES THE SAME GUARD AS THE OTHER TWO. uq_schools_family_discovery now
 * enforces one catalog row per family at write time, so the database refuses
 * regardless. That division of labour is deliberate: THE DB REFUSES, THE UI SAYS
 * WHY. A raw 23505 is a terrible way to learn that Trinity College (CT) is
 * already on your list, so this checks first and names the row — and still
 * catches the constraint underneath, because a check-then-write always has a
 * window and the message should be the same either way.
 *
 * PROVENANCE IS NOT OPTIONAL. A link with no explanation is precisely the state
 * E1 exists to clean up: 32 rows nobody could account for. Every link records
 * what it matched and how, in origin_note, the way merge records "found by
 * reviewer search".
 */
import { NextRequest, NextResponse } from 'next/server'
import { catalogAdmin, familyAdmin } from '@/lib/tenant-db'
import { getFamilyContext } from '@/lib/require-family'

const PG_UNIQUE_VIOLATION = '23505'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const fam = await getFamilyContext()
  if (!fam.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({})) as { discoveryId?: string; how?: string }
  if (!body.discoveryId) {
    return NextResponse.json({ error: 'discoveryId is required' }, { status: 400 })
  }

  const db = familyAdmin(fam.ctx.familyId)

  // The school being linked must be this family's, and must not already be linked.
  const { data: school } = await db
    .from('schools')
    .select('id, name, division, discovery_school_id')
    .eq('id', id)
    .maybeSingle()
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })
  if (school.discovery_school_id) {
    return NextResponse.json({ error: 'That school is already linked to the catalog.' }, { status: 409 })
  }

  const { data: target } = await catalogAdmin()
    .from('discovery_schools')
    .select('id, name, division, conference, city, state')
    .eq('id', body.discoveryId)
    .maybeSingle()
  if (!target) return NextResponse.json({ error: 'Catalog row not found' }, { status: 404 })

  // ── The family-list guard, same as the merge path ────────────────────────
  const { data: holders } = await db
    .from('schools')
    .select('id, name')
    .eq('discovery_school_id', body.discoveryId)

  const conflict = (holders ?? []).find(h => h.id !== id)
  if (conflict) {
    return NextResponse.json({
      error: `You already have "${conflict.name}" linked to ${target.name}. ` +
             `Two of your schools cannot point at the same catalog entry.`,
      conflictSchool: { id: conflict.id, name: conflict.name },
    }, { status: 409 })
  }

  // Carry the catalog's facts across, exactly as a normal catalog add and the
  // merge path do — otherwise a row that IS now classified keeps reading
  // "Unclassified" and the link looks like it did nothing.
  const location = [target.city, target.state].filter(Boolean).join(', ')
  const stamp = new Date().toISOString().slice(0, 10)
  const how = body.how?.trim() || 'confirmed by hand against the catalog'
  const patch: Record<string, unknown> = {
    discovery_school_id: target.id,
    origin_note: `Linked to catalog row ${target.name}` +
      `${target.division ? ` [${target.division}${target.state ? ' ' + target.state : ''}]` : ''}` +
      ` on ${stamp} — ${how}.`,
  }
  if (target.division) patch.division = target.division
  if (target.conference) patch.conference = target.conference
  if (location) patch.location = location

  const { error } = await db.from('schools').update(patch).eq('id', id)

  if (error) {
    // The constraint underneath. The pre-check above should have caught this,
    // but check-then-write has a window, and a person should never meet a raw
    // 23505 — the message is the same either way.
    if (error.code === PG_UNIQUE_VIOLATION) {
      return NextResponse.json({
        error: `One of your schools is already linked to ${target.name}. ` +
               `Two of your schools cannot point at the same catalog entry.`,
      }, { status: 409 })
    }
    console.error('[school-link]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    linkedTo: { id: target.id, name: target.name, division: target.division, state: target.state },
    divisionWas: school.division ?? null,
    divisionNow: target.division ?? null,
  })
}

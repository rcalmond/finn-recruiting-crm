/**
 * POST   /api/camps/[id]/attendees — add a school to a camp. ADMIN ONLY.
 * DELETE /api/camps/[id]/attendees?schoolId=… — remove one. ADMIN ONLY.
 *
 * camp_school_attendees is CATALOG since E1.5: which schools attend a camp is a
 * fact about the world, not a per-family assertion. Its RLS allowed
 * authenticated writes from the browser, which this closes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-gate'
import { catalogAdmin, rawService } from '@/lib/tenant-db'
import { campHostIdFor } from '@/lib/camp-host'

/** Resolve a family school id to whichever id form the column expects.
 *  Reads accept both id forms; WRITES must pick one (see camp-host.ts). The
 *  lookup crosses families deliberately — an admin adding an attendee may be
 *  handed any family's school id — so it goes through rawService rather than a
 *  family-scoped client that would silently find nothing. */
async function resolveSchoolId(schoolId: string): Promise<string> {
  const { data } = await rawService()
    .from('schools').select('id, discovery_school_id').eq('id', schoolId).maybeSingle()
  return data ? campHostIdFor(data as { id: string; discovery_school_id: string | null }) : schoolId
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id: campId } = await params
  const body = await req.json().catch(() => null)
  const schoolId = body?.schoolId
  if (typeof schoolId !== 'string' || !schoolId) {
    return NextResponse.json({ error: 'schoolId is required' }, { status: 400 })
  }
  const source = typeof body?.source === 'string' && body.source ? body.source : 'advertised'

  // ON CONFLICT DO NOTHING. The UNIQUE index on (camp_id, school_id) made
  // collisions impossible while camp_id was per-family and EXPECTED now that
  // camps are shared — one row is the correct outcome, so the write absorbs the
  // collision rather than erroring at whoever is second.
  const { error } = await catalogAdmin()
    .from('camp_school_attendees')
    .upsert({ camp_id: campId, school_id: await resolveSchoolId(schoolId), source },
            { onConflict: 'camp_id,school_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id: campId } = await params
  const schoolId = req.nextUrl.searchParams.get('schoolId')
  if (!schoolId) return NextResponse.json({ error: 'schoolId is required' }, { status: 400 })

  // The stored value may be EITHER id form depending on when the row was
  // written, so both are removed — an .eq() on one form silently removes
  // nothing for rows written under the other.
  const { error } = await catalogAdmin()
    .from('camp_school_attendees')
    .delete()
    .eq('camp_id', campId)
    .in('school_id', [schoolId, await resolveSchoolId(schoolId)])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

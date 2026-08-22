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
import { catalogAdmin } from '@/lib/tenant-db'

/**
 * NO SERVER-SIDE SCHOOL LOOKUP. The first version called
 * rawService().from('schools') to resolve the family school id to its catalog
 * form — and rawService REFUSES family tables by design, so every add threw
 * "'schools' is a family table" and returned 500. The tripwire was right and the
 * code was wrong: an admin route has no family scope, so it has no business
 * reading a family table at all.
 *
 * The CLIENT already holds the school (the picker renders from its own family's
 * list), so it resolves the id with campHostIdFor and sends it. The endpoint
 * writes what it is given.
 */

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
    .upsert({ camp_id: campId, school_id: schoolId, source },
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
  // BOTH id forms, sent by the client. A stored row may carry either depending
  // on when it was written, and an .eq() on one form silently removes nothing
  // for rows written under the other.
  const alt = req.nextUrl.searchParams.get('altSchoolId')
  const ids = alt && alt !== schoolId ? [schoolId, alt] : [schoolId]
  const { error } = await catalogAdmin()
    .from('camp_school_attendees')
    .delete()
    .eq('camp_id', campId)
    .in('school_id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

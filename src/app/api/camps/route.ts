/**
 * POST /api/camps — create a camp. ADMIN ONLY.
 *
 * WHY THIS ENDPOINT EXISTS. camps is a CATALOG table since E1.5, and its RLS
 * policy allowed authenticated INSERT/UPDATE/DELETE from the browser — so any
 * signed-in user could create, edit or delete any family's camp from the
 * console. The E1.5 note reasoned that camps were admin-edited AT THE ROUTE
 * LAYER, but the route layer is not a control when the browser writes the table
 * directly, and CampDetailClient's isAdmin guard covered only the host field:
 * name, dates, cost and deadline were editable by any signed-in user through
 * the UI itself.
 *
 * A camp's name, dates, host and cost are CLAIMS ABOUT THE WORLD. What a family
 * thinks about a camp lives in camp_family_status, which stays a FAMILY table
 * with family RLS and is still written from the browser — that split is E1.5's
 * whole design and is unchanged here.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-gate'
import { catalogAdmin } from '@/lib/tenant-db'

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { data, error } = await catalogAdmin()
    .from('camps')
    .insert(body)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ camp: data })
}

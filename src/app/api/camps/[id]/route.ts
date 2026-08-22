/**
 * PATCH  /api/camps/[id] — edit a camp.   ADMIN ONLY.
 * DELETE /api/camps/[id] — delete a camp. ADMIN ONLY.
 *
 * See /api/camps/route.ts for why these moved off the browser client.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-gate'
import { catalogAdmin, rawService } from '@/lib/tenant-db'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { error } = await catalogAdmin().from('camps').update(body).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await params

  // ACROSS EVERY FAMILY, not just the caller's. camp_family_status cascades when
  // the camp goes, but the action_item it points at does NOT — the FK runs the
  // other way (action_items ← camp_family_status.action_item_id, SET NULL), so
  // deleting the camp strands the reminder. The browser version cleaned up only
  // the caller's row, because RLS scoped it; a shared camp deleted by an admin
  // would have left every OTHER family's reminder behind pointing at nothing.
  //
  // Latent rather than live today: 0 of 75 camp_family_status rows carry an
  // action_item_id, and no camp is tracked by more than one family. Handled here
  // because the count is zero now and will not be later.
  const db = rawService()
  const { data: statuses } = await db
    .from('camp_family_status')
    .select('action_item_id')
    .eq('camp_id', id)
    .not('action_item_id', 'is', null)

  const itemIds = (statuses ?? [])
    .map(s => (s as { action_item_id: string | null }).action_item_id)
    .filter((x): x is string => Boolean(x))

  if (itemIds.length > 0) {
    await db.from('action_items').delete().in('id', itemIds)
  }

  const { error } = await catalogAdmin().from('camps').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, actionItemsRemoved: itemIds.length })
}

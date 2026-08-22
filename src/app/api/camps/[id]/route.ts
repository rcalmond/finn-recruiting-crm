/**
 * PATCH  /api/camps/[id] — edit a camp.   ADMIN ONLY.
 * DELETE /api/camps/[id] — delete a camp. ADMIN ONLY.
 *
 * See /api/camps/route.ts for why these moved off the browser client.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-gate'
import { catalogAdmin, familyAdmin } from '@/lib/tenant-db'
import { listFamilies } from '@/lib/cron-scan-set'

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
  // other way (action_items <- camp_family_status.action_item_id, SET NULL), so
  // deleting the camp strands the reminder.
  //
  // ITERATED PER FAMILY THROUGH familyAdmin, not rawService. The first version
  // used rawService and threw "'camp_family_status' is a family table" on every
  // call — the tripwire was right: an admin route has no family scope, so it
  // reaches family tables only by taking each family's scope in turn, which is
  // the same pattern cron-scan-set uses.
  let removed = 0
  for (const family of await listFamilies()) {
    const fam = familyAdmin(family.id)
    const { data: statuses } = await fam
      .from('camp_family_status')
      .select('action_item_id')
      .eq('camp_id', id)
      .not('action_item_id', 'is', null)

    const itemIds = (statuses ?? [])
      .map(s => (s as { action_item_id: string | null }).action_item_id)
      .filter((x): x is string => Boolean(x))

    if (itemIds.length > 0) {
      await fam.from('action_items').delete().in('id', itemIds)
      removed += itemIds.length
    }
  }

  const { error } = await catalogAdmin().from('camps').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, actionItemsRemoved: removed })
}

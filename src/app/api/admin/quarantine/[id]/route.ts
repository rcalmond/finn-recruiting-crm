/**
 * /api/admin/quarantine/[id] — resolve one quarantined message.
 *
 * REPLAY RUNS THE IDENTICAL INGESTION PATH (design Amendment 3): it rebuilds the
 * stored SendGrid fields and calls ingestSrMessage with the admin-chosen family
 * — the same function the live webhook calls, including the family-scoped dedup
 * check. There is no bypass, so a replayed message that also arrived by another
 * route COLLAPSES on dedup instead of duplicating.
 *
 * Routing is not re-run: routing already failed by definition (that is why the
 * message is here), and the admin's explicit family assignment is what replaces
 * it. Content is still never used to pick a family.
 */
import { NextRequest, NextResponse } from 'next/server'
import { familyAdmin, rawService } from '@/lib/tenant-db'
import { requireAdmin } from '@/lib/admin-gate'
import { loadFamilyIdentity } from '@/lib/family-identity'
import { ingestSrMessage, type InboundFields } from '@/lib/sr-inbound'

export const maxDuration = 60

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({})) as { action?: string; familyId?: string; note?: string }
  const db = rawService()

  const { data: row, error } = await db
    .from('inbound_quarantine')
    .select('id, status, raw_payload, subject')
    .eq('id', id)
    .maybeSingle()
  if (error || !row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (row.status !== 'new') return NextResponse.json({ error: 'Already resolved' }, { status: 409 })

  // ── Discard ───────────────────────────────────────────────────────────────
  if (body.action === 'discard') {
    // Discard is an ACTOR-BEARING decision, not a cleanup: somebody decided this
    // message belongs to nobody. It is recorded exactly like a replay.
    await db.from('inbound_quarantine').update({
      status: 'discarded',
      resolved_at: new Date().toISOString(),
      resolved_by: admin.userId,
      resolved_by_email: admin.email,
      resolver_note: body.note ?? null,
    }).eq('id', id)
    return NextResponse.json({ ok: true, action: 'discarded' })
  }

  // ── Replay ────────────────────────────────────────────────────────────────
  if (body.action !== 'replay' || !body.familyId) {
    return NextResponse.json({ error: 'action must be replay (with familyId) or discard' }, { status: 400 })
  }

  const payload = (row.raw_payload ?? {}) as Record<string, string>
  const fields: InboundFields = {
    from:     payload.from     ?? '',
    to:       payload.to       ?? '',
    subject:  payload.subject  ?? '',
    spf:      payload.spf      ?? '',
    dkim:     payload.dkim     ?? '',
    headers:  payload.headers  ?? '',
    text:     payload.text     ?? '',
    html:     payload.html     ?? '',
    envelope: payload.envelope ?? '',
  }

  const scoped = familyAdmin(body.familyId)
  const identity = await loadFamilyIdentity(scoped, body.familyId)
  const result = await ingestSrMessage(scoped, identity, fields, new Date().toISOString())

  await db.from('inbound_quarantine').update({
    status: 'resolved',
    resolved_at: new Date().toISOString(),
    resolved_family_id: body.familyId,
    resolved_by: admin.userId,
    resolved_by_email: admin.email,
    resolver_note: body.note ?? `replayed → ${result.status}${result.status === 'dropped' ? ` (${result.why})` : ''}`,
  }).eq('id', id)

  return NextResponse.json({ ok: true, action: 'replayed', result })
}

/**
 * /api/unmatched/[id] — act on one unmatched (orphan) message.
 *
 * ORPHAN ≠ QUARANTINE. An orphan is a message whose FAMILY is known but whose
 * SCHOOL is not: it already carries family_id and lives in contact_log. It is
 * excluded from every generator read (unattributed content must never reach the
 * judgment layer) — which is exactly why it needs a human surface, so mail that
 * arrived and didn't match is never indistinguishable from mail that never
 * arrived.
 */
import { NextRequest, NextResponse } from 'next/server'
import { familyAdmin } from '@/lib/tenant-db'
import { getFamilyContext } from '@/lib/require-family'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const fam = await getFamilyContext()
  if (!fam.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: fam.status })

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({})) as { action?: string; schoolId?: string }
  const admin = familyAdmin(fam.ctx.familyId)

  // Scoped by the wrapper — a family can only act on its own rows.
  const { data: row } = await admin
    .from('contact_log').select('id, direction, summary, parse_status').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.action === 'dismiss') {
    // 'non_coach' is the existing user-marked state (sender is admin/bot/
    // recruiter) — no new status invented.
    const { error } = await admin.from('contact_log')
      .update({ parse_status: 'non_coach', parse_notes: 'Dismissed from the unmatched review' })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action: 'dismissed' })
  }

  if (body.action === 'attach' && body.schoolId) {
    const { error } = await admin.from('contact_log')
      .update({ school_id: body.schoolId, parse_status: 'partial', parse_notes: 'Attached from the unmatched review' })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // The same fire-and-forget cascade the live path runs, so an attached
    // message immediately counts toward the school's state.
    const schoolId = body.schoolId
    import('@/lib/school-conversation-summary-generator').then(({ generateAndStoreConversationSummary }) =>
      generateAndStoreConversationSummary(admin, schoolId)
    ).catch(err => console.error('[unmatched] conv-summary failed:', err))
    import('@/lib/recruiting-stage').then(({ raiseStageFloor }) =>
      raiseStageFloor(admin, schoolId)
    ).catch(err => console.error('[unmatched] stage-floor failed:', err))

    return NextResponse.json({ ok: true, action: 'attached' })
  }

  return NextResponse.json({ error: 'action must be attach (with schoolId) or dismiss' }, { status: 400 })
}

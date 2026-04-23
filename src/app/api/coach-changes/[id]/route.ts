/**
 * PUT /api/coach-changes/[id]
 *
 * Apply or reject a single coach_changes row.
 * Session-authenticated (must be signed in); writes use service role.
 *
 * Body: { action: 'apply' | 'reject', note?: string }
 *
 * Apply logic per change_type:
 *   coach_added    → INSERT into coaches from details jsonb
 *   coach_departed → UPDATE coaches SET needs_review=true (no hard delete)
 *   email_added    → UPDATE coaches SET email = details.email_new
 *   email_changed  → UPDATE coaches SET email = details.email_after
 *   role_changed   → UPDATE coaches SET role  = details.role_after
 *   name_changed   → UPDATE coaches SET name  = details.name_after
 *
 * Both apply and reject:
 *   UPDATE coach_changes SET status, reviewed_at=now(), reviewer_note
 *
 * Reject: sets status='rejected', no DB mutation beyond coach_changes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { reparsePartialsForSchool } from '@/lib/gmail-resolve'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = ReturnType<typeof createServiceClient<any>>

function serviceClient(): Supabase {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Session auth gate
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)

  if (!body || !['apply', 'reject'].includes(body.action)) {
    return NextResponse.json({ error: 'Invalid body — expected { action: "apply"|"reject" }' }, { status: 400 })
  }

  const action: 'apply' | 'reject' = body.action
  const note: string | null = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null

  const admin = serviceClient()

  // Fetch the change row
  const { data: change, error: fetchErr } = await admin
    .from('coach_changes')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !change) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (change.status !== 'manual') {
    return NextResponse.json(
      { error: `Change is already "${change.status}" — cannot ${action} again` },
      { status: 409 }
    )
  }

  // ── Apply ──────────────────────────────────────────────────────────────────

  if (action === 'apply') {
    const details = change.details as Record<string, unknown>
    let applyErr: string | null = null

    switch (change.change_type) {
      case 'coach_added': {
        // Sort order: max existing + 1
        const { data: existing } = await admin
          .from('coaches')
          .select('sort_order')
          .eq('school_id', change.school_id)
          .order('sort_order', { ascending: false })
          .limit(1)
        const nextSort = ((existing?.[0]?.sort_order as number | undefined) ?? 0) + 1

        // is_primary: Head Coach when no primary exists yet
        const { data: primaryCheck } = await admin
          .from('coaches')
          .select('id')
          .eq('school_id', change.school_id)
          .eq('is_primary', true)
          .limit(1)
        const isPrimary = details.role === 'Head Coach' && (primaryCheck?.length ?? 0) === 0

        const { error } = await admin.from('coaches').insert({
          school_id:    change.school_id,
          name:         details.name,
          role:         details.role,
          email:        details.email ?? null,
          is_primary:   isPrimary,
          needs_review: false,
          sort_order:   nextSort,
          source:       'scraped',
        })
        if (error) applyErr = error.message
        break
      }

      case 'coach_departed': {
        if (!change.coach_id) { applyErr = 'coach_id is null — cannot flag for review'; break }
        const { error } = await admin
          .from('coaches')
          .update({ needs_review: true })
          .eq('id', change.coach_id)
        if (error) applyErr = error.message
        break
      }

      case 'email_added': {
        if (!change.coach_id) { applyErr = 'coach_id is null'; break }
        const { error } = await admin
          .from('coaches')
          .update({ email: details.email_new })
          .eq('id', change.coach_id)
        if (error) applyErr = error.message
        break
      }

      case 'email_changed': {
        if (!change.coach_id) { applyErr = 'coach_id is null'; break }
        const { error } = await admin
          .from('coaches')
          .update({ email: details.email_after })
          .eq('id', change.coach_id)
        if (error) applyErr = error.message
        break
      }

      case 'role_changed': {
        if (!change.coach_id) { applyErr = 'coach_id is null'; break }
        const { error } = await admin
          .from('coaches')
          .update({ role: details.role_after })
          .eq('id', change.coach_id)
        if (error) applyErr = error.message
        break
      }

      case 'name_changed': {
        if (!change.coach_id) { applyErr = 'coach_id is null'; break }
        const { error } = await admin
          .from('coaches')
          .update({ name: details.name_after })
          .eq('id', change.coach_id)
        if (error) applyErr = error.message
        break
      }

      default:
        applyErr = `Unknown change_type: ${change.change_type}`
    }

    if (applyErr) {
      return NextResponse.json({ error: `Apply failed: ${applyErr}` }, { status: 500 })
    }

    // After a successful coach_added apply, re-parse any gmail partials for this
    // school that couldn't be linked before (coach wasn't in DB at parse time).
    if (change.change_type === 'coach_added') {
      reparsePartialsForSchool(admin, change.school_id).then(({ rescued, checked }) => {
        if (checked > 0) {
          console.log(`[coach-changes] reparse for school ${change.school_id}: rescued ${rescued}/${checked} partials`)
        }
      }).catch(() => { /* non-critical; log swallowed */ })
    }
  }

  // ── Update coach_changes status ────────────────────────────────────────────

  const { error: updateErr } = await admin
    .from('coach_changes')
    .update({
      status:        action === 'apply' ? 'applied' : 'rejected',
      reviewed_at:   new Date().toISOString(),
      reviewer_note: note,
    })
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: `Status update failed: ${updateErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, action, id })
}

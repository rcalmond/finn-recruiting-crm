/**
 * POST /api/gmail-partials/[id]
 *
 * Resolve a gmail partial row. Session-authenticated; writes use service role.
 *
 * Body shapes:
 *
 *   { action: 'link-existing', coach_id: string }
 *     Validates coach belongs to same school. Sets coach_id, parse_status='full'.
 *
 *   { action: 'create-and-link',
 *     first_name: string, last_name: string, role: string,
 *     email?: string, title?: string }
 *     Creates new coach (source='from_gmail'), links partial row.
 *     Triggers reparsePartialsForSchool for cascade effect.
 *
 *   { action: 'mark-non-coach' }
 *     Sets parse_status='non_coach'. No coach_id change.
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

const VALID_ROLES = [
  'Head Coach',
  'Associate Head Coach',
  'Assistant Coach',
  'Volunteer Assistant',
  'Director of Operations',
  'Goalkeeper Coach',
  'Other',
]

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)

  if (!body?.action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 })
  }

  const admin = serviceClient()

  // Fetch the partial row
  const { data: row, error: fetchErr } = await admin
    .from('contact_log')
    .select('id, school_id, parse_status, gmail_message_id')
    .eq('id', id)
    .single()

  if (fetchErr || !row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!row.gmail_message_id) {
    return NextResponse.json({ error: 'Row is not a Gmail row' }, { status: 400 })
  }

  if (row.parse_status !== 'partial') {
    return NextResponse.json(
      { error: `Row parse_status is "${row.parse_status}" — already resolved` },
      { status: 409 }
    )
  }

  // ── link-existing ──────────────────────────────────────────────────────────

  if (body.action === 'link-existing') {
    const coachId = body.coach_id
    if (!coachId || typeof coachId !== 'string') {
      return NextResponse.json({ error: 'Missing coach_id' }, { status: 400 })
    }

    // Validate coach belongs to same school
    const { data: coach } = await admin
      .from('coaches')
      .select('id, school_id')
      .eq('id', coachId)
      .single()

    if (!coach || coach.school_id !== row.school_id) {
      return NextResponse.json(
        { error: 'Coach not found or belongs to a different school' },
        { status: 400 }
      )
    }

    const { error } = await admin
      .from('contact_log')
      .update({ coach_id: coachId, parse_status: 'full' })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, action: 'link-existing' })
  }

  // ── create-and-link ────────────────────────────────────────────────────────

  if (body.action === 'create-and-link') {
    const { first_name, last_name, role, email, title } = body

    if (!first_name?.trim() || !last_name?.trim()) {
      return NextResponse.json({ error: 'first_name and last_name are required' }, { status: 400 })
    }

    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 })
    }

    const name = `${first_name.trim()} ${last_name.trim()}`
    const coachEmail: string | null = typeof email === 'string' && email.trim() ? email.trim() : null

    // Sort order: max existing + 1
    const { data: existing } = await admin
      .from('coaches')
      .select('sort_order')
      .eq('school_id', row.school_id)
      .order('sort_order', { ascending: false })
      .limit(1)
    const nextSort = ((existing?.[0]?.sort_order as number | undefined) ?? 0) + 1

    // is_primary: Head Coach when no primary exists yet
    const { data: primaryCheck } = await admin
      .from('coaches')
      .select('id')
      .eq('school_id', row.school_id)
      .eq('is_primary', true)
      .limit(1)
    const isPrimary = role === 'Head Coach' && (primaryCheck?.length ?? 0) === 0

    const { data: newCoach, error: insertErr } = await admin
      .from('coaches')
      .insert({
        school_id:    row.school_id,
        name,
        role,
        email:        coachEmail,
        is_primary:   isPrimary,
        needs_review: false,
        sort_order:   nextSort,
        source:       'from_gmail',
        notes:        typeof title === 'string' && title.trim() ? title.trim() : null,
      })
      .select('id')
      .single()

    if (insertErr || !newCoach) {
      return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
    }

    // Link the partial row
    const { error: linkErr } = await admin
      .from('contact_log')
      .update({ coach_id: newCoach.id, parse_status: 'full' })
      .eq('id', id)

    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 })

    // Trigger cascade re-parse for other partials at this school (fire-and-forget)
    reparsePartialsForSchool(admin, row.school_id).then(({ rescued, checked }) => {
      if (checked > 0) {
        console.log(`[gmail-partials] reparse for school ${row.school_id}: rescued ${rescued}/${checked}`)
      }
    }).catch(() => { /* non-critical */ })

    return NextResponse.json({ ok: true, action: 'create-and-link', coachId: newCoach.id })
  }

  // ── mark-non-coach ─────────────────────────────────────────────────────────

  if (body.action === 'mark-non-coach') {
    const { error } = await admin
      .from('contact_log')
      .update({ parse_status: 'non_coach' })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, action: 'mark-non-coach' })
  }

  return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
}

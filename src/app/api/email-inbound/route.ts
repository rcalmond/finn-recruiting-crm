import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

// ─── Mailgun webhook verification ────────────────────────────────────────────

function verifyMailgun(timestamp: string, token: string, signature: string): boolean {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY
  if (!signingKey) return false
  const hash = crypto
    .createHmac('sha256', signingKey)
    .update(timestamp + token)
    .digest('hex')
  return hash === signature
}

// ─── SR email parsing ─────────────────────────────────────────────────────────

// Subject format: "Ben Cross (University of Rochester) Sent You a Message"
function parseSRSubject(subject: string): { coachName: string; schoolName: string } | null {
  const match = subject.match(/^(.+?)\s+\((.+?)\)\s+Sent You a Message/i)
  if (!match) return null
  return { coachName: match[1].trim(), schoolName: match[2].trim() }
}

// Extract just the message body from the SR notification plain text
function extractBody(text: string): string {
  const startMarker = 'just sent a message to your SportsRecruits inbox:'
  const endMarker = 'Reply on SportsRecruits'
  const start = text.indexOf(startMarker)
  const end = text.indexOf(endMarker)
  if (start === -1) return text.trim()
  const bodyStart = start + startMarker.length
  const bodyEnd = end === -1 ? text.length : end
  return text.slice(bodyStart, bodyEnd).trim()
}

// ─── School matching ──────────────────────────────────────────────────────────

async function findSchool(supabase: ReturnType<typeof createClient>, schoolName: string) {
  // 1. Exact match (case-insensitive)
  const { data: exact } = await supabase
    .from('schools')
    .select('id, name')
    .ilike('name', schoolName)
    .limit(1)
  if (exact && exact.length > 0) return exact[0]

  // 2. Partial match — try each significant word
  const words = schoolName.split(' ').filter(w => w.length > 4)
  for (const word of words) {
    const { data } = await supabase
      .from('schools')
      .select('id, name')
      .ilike('name', `%${word}%`)
      .limit(1)
    if (data && data.length > 0) return data[0]
  }

  return null
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const formData = await request.formData()

  const timestamp = formData.get('timestamp') as string
  const token     = formData.get('token') as string
  const signature = formData.get('signature') as string

  if (!verifyMailgun(timestamp, token, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const subject   = (formData.get('subject') as string) || ''
  const bodyPlain = (formData.get('body-plain') as string) || ''
  const dateStr   = (formData.get('Date') as string) || (formData.get('date') as string) || ''

  // Only process SR coach notification emails
  const parsed = parseSRSubject(subject)
  if (!parsed) {
    return NextResponse.json({ ok: true, skipped: 'not an SR coach notification' })
  }

  const { coachName, schoolName } = parsed
  const summary = extractBody(bodyPlain)
  const date = dateStr
    ? new Date(dateStr).toISOString().split('T')[0]
    : new Date(parseInt(timestamp) * 1000).toISOString().split('T')[0]

  // Use service role key — no user session in webhook context
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const school = await findSchool(supabase, schoolName)
  if (!school) {
    console.warn(`SR webhook: could not match school "${schoolName}"`)
    return NextResponse.json({ ok: true, warning: `School not matched: ${schoolName}` })
  }

  const { error } = await supabase.from('contact_log').insert({
    school_id:  school.id,
    date,
    channel:    'Sports Recruits',
    direction:  'Inbound',
    coach_name: coachName,
    summary,
    source:     'email-forward',
  })

  if (error) {
    console.error('SR webhook insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, school: school.name, coach: coachName, date })
}

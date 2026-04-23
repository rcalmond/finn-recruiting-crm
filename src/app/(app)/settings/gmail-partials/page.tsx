import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import GmailPartialsClient from './GmailPartialsClient'

export default async function GmailPartialsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch partial gmail rows with school name
  const { data: rows } = await admin
    .from('contact_log')
    .select('id, school_id, direction, coach_name, summary, date, created_at, parse_notes, schools!inner(id, name)')
    .eq('parse_status', 'partial')
    .not('gmail_message_id', 'is', null)
    .order('created_at', { ascending: false })

  // Fetch coaches for all involved schools (for the link-existing dropdown)
  const schoolIds = Array.from(new Set((rows ?? []).map((r: { school_id: string }) => r.school_id)))

  const { data: coaches } = schoolIds.length > 0
    ? await admin
        .from('coaches')
        .select('id, name, role, school_id')
        .in('school_id', schoolIds)
        .eq('needs_review', false)
        .order('sort_order')
    : { data: [] }

  const coachesBySchool: Record<string, { id: string; name: string; role: string }[]> = {}
  for (const c of coaches ?? []) {
    if (!coachesBySchool[c.school_id]) coachesBySchool[c.school_id] = []
    coachesBySchool[c.school_id].push({ id: c.id, name: c.name, role: c.role })
  }

  type PartialRow = {
    id: string
    school_id: string
    school_name: string
    direction: string
    coach_name: string | null
    summary: string | null
    date: string
    created_at: string
    parse_notes: string | null
    school_coaches: { id: string; name: string; role: string }[]
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partials: PartialRow[] = ((rows ?? []) as any[]).map((r) => ({
    id:            r.id,
    school_id:     r.school_id,
    school_name:   r.schools.name,
    direction:     r.direction,
    coach_name:    r.coach_name,
    summary:       r.summary,
    date:          r.date,
    created_at:    r.created_at,
    parse_notes:   r.parse_notes,
    school_coaches: coachesBySchool[r.school_id] ?? [],
  }))

  return <GmailPartialsClient partials={partials} />
}

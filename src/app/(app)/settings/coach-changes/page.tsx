import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import CoachChangesClient from './CoachChangesClient'

export default async function CoachChangesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Pending changes — all with status='manual', joined to school name
  const { data: rows } = await admin
    .from('coach_changes')
    .select('*, schools!inner(name)')
    .eq('status', 'manual')
    .order('schools(name)')
    .order('created_at')

  // Group by school_id for display
  type ChangeRow = {
    id: string
    school_id: string
    change_type: string
    coach_id: string | null
    details: Record<string, unknown>
    status: string
    created_at: string
    reviewer_note: string | null
    schools: { name: string }
  }

  type SchoolGroup = {
    schoolId: string
    schoolName: string
    changes: ChangeRow[]
  }

  const grouped: SchoolGroup[] = []
  const seen = new Map<string, SchoolGroup>()

  for (const row of (rows ?? []) as ChangeRow[]) {
    let group = seen.get(row.school_id)
    if (!group) {
      group = { schoolId: row.school_id, schoolName: row.schools.name, changes: [] }
      seen.set(row.school_id, group)
      grouped.push(group)
    }
    group.changes.push(row)
  }

  return <CoachChangesClient groups={grouped} />
}

import { redirect } from 'next/navigation'
import { primaryCoachIdsBySchool } from '@/lib/coach-primary'
import { createClient } from '@/lib/supabase/server'
import NewCampaignClient from '@/components/campaigns/NewCampaignClient'
import type { School, Coach } from '@/lib/types'

// T1: RSC pages read on the user client — RLS enforces; catalog tables carry
// authenticated SELECT policies.
async function makeAdmin() {
  return createClient()
}

export default async function NewCampaignPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = await makeAdmin()

  // Fetch all schools (excluding Nope tier) for scope selection
  const { data: schools } = await admin
    .from('schools')
    .select('id, name, short_name, category, division, status, conference, location, last_contact, head_coach, coach_email, admit_likelihood, rq_status, videos_sent, generic_team_email, aliases, sort_order, created_at, updated_at')
    .neq('category', 'Nope')
    .order('name')

  // Fetch primary coaches for preview rendering.
  // Resolution reads BOTH domains (schools.primary_coach_id first); the rows
  // are then fetched by id, so the preview shows whoever the family actually
  // designated rather than whoever still carries the legacy flag.
  const schoolIds = (schools ?? []).map(s => s.id)
  const primaryIdBySchool = await primaryCoachIdsBySchool(admin, schoolIds)
  const primaryIds = Array.from(primaryIdBySchool.values())
  const { data: coaches } = primaryIds.length > 0
    ? await admin
        .from('coaches')
        .select('id, school_id, name, role, email, is_primary, needs_review, sort_order, notes, created_at, updated_at')
        .in('id', primaryIds)
    : { data: [] }

  const coachBySchool = new Map((coaches ?? []).map(c => [c.school_id, c]))

  return (
    <NewCampaignClient
      schools={(schools ?? []) as unknown as School[]}
      coachBySchool={Object.fromEntries(coachBySchool) as Record<string, Coach>}
    />
  )
}

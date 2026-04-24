import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import NewCampaignClient from '@/components/campaigns/NewCampaignClient'
import type { School, Coach } from '@/lib/types'

function makeAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function NewCampaignPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = makeAdmin()

  // Fetch all schools (excluding Nope tier) for scope selection
  const { data: schools } = await admin
    .from('schools')
    .select('id, name, short_name, category, division, status, conference, location, last_contact, head_coach, coach_email, admit_likelihood, rq_status, videos_sent, notes, generic_team_email, aliases, sort_order, id_camp_1, id_camp_2, id_camp_3, created_at, updated_at')
    .neq('category', 'Nope')
    .order('name')

  // Fetch primary coaches for preview rendering
  const schoolIds = (schools ?? []).map(s => s.id)
  const { data: coaches } = schoolIds.length > 0
    ? await admin
        .from('coaches')
        .select('id, school_id, name, role, email, is_primary, needs_review, sort_order, notes, created_at, updated_at')
        .eq('is_primary', true)
        .in('school_id', schoolIds)
    : { data: [] }

  // Find a sample school for live preview: first A-tier with a primary coach
  const coachBySchool = new Map((coaches ?? []).map(c => [c.school_id, c]))
  const aTier = (schools ?? []).filter(s => s.category === 'A')
  const sampleSchool = aTier.find(s => coachBySchool.has(s.id)) ?? aTier[0] ?? (schools ?? [])[0] ?? null
  const sampleCoach = sampleSchool ? (coachBySchool.get(sampleSchool.id) ?? null) : null

  return (
    <NewCampaignClient
      schools={(schools ?? []) as School[]}
      coachBySchool={Object.fromEntries(coachBySchool) as Record<string, Coach>}
      sampleSchool={sampleSchool as School | null}
      sampleCoach={sampleCoach as Coach | null}
    />
  )
}

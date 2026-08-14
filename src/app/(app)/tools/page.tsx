import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ToolsLandingClient from './ToolsLandingClient'

// T1: RSC pages read on the user client — RLS enforces; catalog tables carry
// authenticated SELECT policies.
async function makeAdmin() {
  return createClient()
}

export default async function ToolsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = await makeAdmin()

  const [coachChanges, campProposals] = await Promise.all([
    admin
      .from('coach_changes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'manual')
      .then(r => r.count ?? 0),
    admin
      .from('camp_proposals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(r => r.count ?? 0),
  ])

  return (
    <ToolsLandingClient
      pendingCoachChanges={coachChanges}
      pendingCampProposals={campProposals}
    />
  )
}

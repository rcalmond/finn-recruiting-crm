import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFamilyContext } from '@/lib/require-family'
import { pendingProposalIdsForFamily } from '@/lib/camp-proposal-queue'
import CampProposalsClient from './CampProposalsClient'

// T1: RSC pages read on the user client — RLS enforces; catalog tables carry
// authenticated SELECT policies.
async function makeAdmin() {
  return createClient()
}

export default async function CampProposalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = await makeAdmin()

  const fam = await getFamilyContext()
  if (!fam.ok) redirect('/get-recruited')

  // A family's queue is the shared pending set MINUS what THIS family dismissed.
  const visibleIds = await pendingProposalIdsForFamily(admin, fam.ctx.familyId)

  // Fetch pending proposals with host school join
  const { data: rows } = visibleIds.length > 0
    ? await admin
        .from('camp_proposals')
        .select('*, schools!camp_proposals_host_school_id_fkey(id, name, short_name, category)')
        .in('id', visibleIds)
        .order('created_at', { ascending: true })
    : { data: [] }

  // Fetch all active A/B/C schools for attendee resolution display
  const { data: schools } = await admin
    .from('schools')
    .select('id, name, short_name, category')
    .neq('category', 'Nope')
    .neq('status', 'Inactive')
    .order('name')

  return (
    <CampProposalsClient
      proposals={(rows ?? []) as never[]}
      schools={(schools ?? []) as never[]}
    />
  )
}

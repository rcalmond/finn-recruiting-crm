import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFamilyContext } from '@/lib/require-family'
import { pendingProposalIdsForFamily } from '@/lib/camp-proposal-queue'
import CampProposalsClient from './CampProposalsClient'
import { buildHostIndex } from '@/lib/camp-host'

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

  // NO schools EMBED: camp_proposals_host_school_id_fkey re-targets
  // discovery_schools at E1.5 and the embed breaks outright (PGRST200). The host
  // is resolved in JS against the family's own list, which works either side of
  // the re-point — see camp-host.ts.
  const { data: rawRows } = visibleIds.length > 0
    ? await admin
        .from('camp_proposals')
        .select('*')
        .in('id', visibleIds)
        .order('created_at', { ascending: true })
    : { data: [] }

  const { data: hostRows } = await admin
    .from('schools').select('id, name, short_name, category, discovery_school_id')
  const hostIndex = buildHostIndex(
    (hostRows ?? []) as Array<{ id: string; name: string; short_name: string | null; category: string; discovery_school_id: string | null }>)
  const rows = (rawRows ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    schools: hostIndex.get(r.host_school_id as string) ?? null,
  }))

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

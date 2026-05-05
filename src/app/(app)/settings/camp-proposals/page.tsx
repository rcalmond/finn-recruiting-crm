import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import CampProposalsClient from './CampProposalsClient'

function makeAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function CampProposalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = makeAdmin()

  // Fetch pending proposals with host school join
  const { data: rows } = await admin
    .from('camp_proposals')
    .select('*, schools!camp_proposals_host_school_id_fkey(id, name, short_name, category)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

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

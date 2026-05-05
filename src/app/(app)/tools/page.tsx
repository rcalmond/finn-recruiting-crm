import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import ToolsLandingClient from './ToolsLandingClient'

function makeAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function ToolsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = makeAdmin()

  const [coachChanges, gmailPartials, classification, campProposals] = await Promise.all([
    admin
      .from('coach_changes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'manual')
      .then(r => r.count ?? 0),
    admin
      .from('contact_log')
      .select('id', { count: 'exact', head: true })
      .eq('parse_status', 'partial')
      .not('gmail_message_id', 'is', null)
      .then(r => r.count ?? 0),
    admin
      .from('contact_log')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'Inbound')
      .eq('classification_confidence', 'low')
      .not('classified_at', 'is', null)
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
      pendingGmailPartials={gmailPartials}
      pendingClassification={classification}
      pendingCampProposals={campProposals}
    />
  )
}

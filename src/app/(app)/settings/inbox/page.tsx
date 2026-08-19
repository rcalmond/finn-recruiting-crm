import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import InboxSettingsClient, { type InboundAddressRow, type SendingAddressRow } from './InboxSettingsClient'

// The family's inbox address, the Gmail verification code when it lands, and
// the three REQUIRED setup steps. User client — family RLS scopes both reads.
export default async function InboxSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: inbound }, { data: sending }] = await Promise.all([
    supabase.from('family_inbound_addresses')
      .select('id, address, label, status, verification_code, verification_received_at, verified_at, created_at')
      .order('created_at', { ascending: true }),
    supabase.from('family_sending_addresses')
      .select('id, address, label, source')
      .order('created_at', { ascending: true }),
  ])

  return (
    <InboxSettingsClient
      inbound={(inbound ?? []) as InboundAddressRow[]}
      sending={(sending ?? []) as SendingAddressRow[]}
    />
  )
}

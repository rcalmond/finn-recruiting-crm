import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import GmailSettingsClient from './GmailSettingsClient'

const GMAIL_USER = process.env.GOOGLE_EXPECTED_EMAIL ?? 'finnalmond08@gmail.com'

export default async function GmailSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: tokenRow } = await admin
    .from('gmail_tokens')
    .select('user_email, last_sync_at')
    .eq('user_email', GMAIL_USER)
    .maybeSingle()

  const { count: gmailCount } = await admin
    .from('contact_log')
    .select('id', { count: 'exact', head: true })
    .not('gmail_message_id', 'is', null)

  const { count: partialCount } = await admin
    .from('contact_log')
    .select('id', { count: 'exact', head: true })
    .not('gmail_message_id', 'is', null)
    .eq('parse_status', 'partial')

  return (
    <GmailSettingsClient
      connected={!!tokenRow}
      connectedEmail={tokenRow?.user_email ?? null}
      lastSyncAt={tokenRow?.last_sync_at ?? null}
      gmailCount={gmailCount ?? 0}
      partialCount={partialCount ?? 0}
    />
  )
}

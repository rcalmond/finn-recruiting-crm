import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { familyAdmin } from '@/lib/tenant-db'
import { getFamilyContext } from '@/lib/require-family'
import GmailSettingsClient from './GmailSettingsClient'

const GMAIL_USER = process.env.GOOGLE_EXPECTED_EMAIL ?? 'finnalmond08@gmail.com'

export default async function GmailSettingsPage() {
  // T1: gmail_tokens is deliberately service-role-only (OAuth tokens) — this
  // page is the intentional service remainder, scoped via familyAdmin.
  const fam = await getFamilyContext()
  if (!fam.ok) redirect('/auth/login')
  const admin = familyAdmin(fam.ctx.familyId)

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

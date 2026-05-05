import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TodayClient from '@/components/TodayClient'
import { getGmailHealth } from '@/lib/gmail-health'

export default async function TodayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const gmailHealth = await getGmailHealth()

  return <TodayClient user={user} gmailHealth={gmailHealth} />
}

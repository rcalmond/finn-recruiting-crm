import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import TodayClient from '@/components/TodayClient'

function makeAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getPendingCoachChanges(): Promise<number> {
  try {
    const { count } = await makeAdmin()
      .from('coach_changes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'manual')
    return count ?? 0
  } catch {
    return 0
  }
}

async function getPendingGmailPartials(): Promise<number> {
  try {
    const { count } = await makeAdmin()
      .from('contact_log')
      .select('id', { count: 'exact', head: true })
      .eq('parse_status', 'partial')
      .not('gmail_message_id', 'is', null)
    return count ?? 0
  } catch {
    return 0
  }
}

export default async function TodayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [pendingCoachChanges, pendingGmailPartials] = await Promise.all([
    getPendingCoachChanges(),
    getPendingGmailPartials(),
  ])

  return (
    <TodayClient
      user={user}
      pendingCoachChanges={pendingCoachChanges}
      pendingGmailPartials={pendingGmailPartials}
    />
  )
}

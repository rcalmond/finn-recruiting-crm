import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import TodayClient from '@/components/TodayClient'

async function getPendingCoachChanges(): Promise<number> {
  try {
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { count } = await admin
      .from('coach_changes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'manual')
    return count ?? 0
  } catch {
    return 0
  }
}

export default async function TodayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const pendingCoachChanges = await getPendingCoachChanges()

  return <TodayClient user={user} pendingCoachChanges={pendingCoachChanges} />
}

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TodayClient from '@/components/TodayClient'

export default async function TodayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return <TodayClient user={user} />
}

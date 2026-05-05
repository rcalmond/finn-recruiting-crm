import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TodayClient from '@/components/TodayClient'
import { getIngestionHealth } from '@/lib/ingestion-health'

export default async function TodayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const ingestionHealth = await getIngestionHealth()

  return <TodayClient user={user} ingestionHealth={ingestionHealth} />
}

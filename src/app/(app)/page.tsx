import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import HomeClient from '@/components/HomeClient'
import { getIngestionHealth } from '@/lib/ingestion-health'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const ingestionHealth = await getIngestionHealth()

  return <HomeClient user={user} ingestionHealth={ingestionHealth} />
}

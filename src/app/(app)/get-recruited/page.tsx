import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GetRecruitedClient from '@/components/GetRecruitedClient'
import { getIngestionHealth } from '@/lib/ingestion-health'

export default async function GetRecruitedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const ingestionHealth = await getIngestionHealth()

  return <GetRecruitedClient user={user} ingestionHealth={ingestionHealth} />
}

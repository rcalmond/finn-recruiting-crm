import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CampaignsClient from '@/components/campaigns/CampaignsClient'

export default async function CampaignsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return <CampaignsClient />
}

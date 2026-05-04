import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CampsClient from '@/components/CampsClient'

export default async function CampsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return <CampsClient user={user} />
}

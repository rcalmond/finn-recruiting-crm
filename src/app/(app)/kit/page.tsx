import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AssetsClient from '@/components/assets/AssetsClient'

export default async function AssetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return <AssetsClient user={user} />
}

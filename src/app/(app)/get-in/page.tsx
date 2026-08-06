import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GetInClient from '@/components/GetInClient'

export default async function GetInPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return <GetInClient />
}

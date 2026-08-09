import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import QuestionnairesClient from '@/components/QuestionnairesClient'

export default async function QuestionnairesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return <QuestionnairesClient />
}

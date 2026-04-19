import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import QuestionsPanel from '@/components/QuestionsPanel'

export default async function QuestionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return <QuestionsPanel />
}

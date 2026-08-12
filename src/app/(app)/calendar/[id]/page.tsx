import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CampDetailClient from '@/components/CampDetailClient'

export default async function CampDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { id } = await params
  return <CampDetailClient campId={id} />
}

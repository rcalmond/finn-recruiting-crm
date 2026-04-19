import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SchoolDetailClient from '@/components/school-detail/SchoolDetailClient'
import type { School } from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function SchoolDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: school } = await supabase
    .from('schools')
    .select('*')
    .eq('id', id)
    .single()

  // Redirect only if the school record doesn't exist
  if (!school) {
    redirect('/schools')
  }

  return <SchoolDetailClient initialSchool={school as School} user={user} />
}

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SchoolDetailClient from '@/components/school-detail/SchoolDetailClient'
import { requireAdmin } from '@/lib/admin-gate'
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

  // The add-camp entry point on this page writes CATALOG data (camps are shared
  // since E1.5), so it is admin-only, resolved server-side.
  const admin = await requireAdmin()
  return <SchoolDetailClient initialSchool={school as School} user={user} isAdmin={admin.ok} />
}

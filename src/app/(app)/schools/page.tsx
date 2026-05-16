import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SchoolsClient from '@/components/SchoolsClient'

export default async function SchoolsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return (
    <Suspense>
      <SchoolsClient user={user} />
    </Suspense>
  )
}

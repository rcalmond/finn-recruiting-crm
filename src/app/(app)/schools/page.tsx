import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Phase 1 placeholder — Schools view will be built in Phase 3.
// For now, redirect to the existing pipeline tab on the dashboard.
export default async function SchoolsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  redirect('/dashboard?tab=pipeline')
}

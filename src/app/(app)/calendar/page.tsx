import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-gate'
import CampsClient from '@/components/CampsClient'

export default async function CampsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Creating a camp writes CATALOG data, so the entry point is admin-only,
  // resolved on the server rather than trusted from the client.
  const admin = await requireAdmin()
  return <CampsClient user={user} isAdmin={admin.ok} />
}

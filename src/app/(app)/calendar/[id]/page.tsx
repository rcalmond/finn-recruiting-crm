import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-gate'
import CampDetailClient from '@/components/CampDetailClient'

export default async function CampDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { id } = await params
  // A camp's host is a claim about the world, and camps become shared at E1.5 —
  // so editing it is admin-only, resolved on the server rather than trusted from
  // the client.
  const admin = await requireAdmin()
  return <CampDetailClient campId={id} isAdmin={admin.ok} />
}

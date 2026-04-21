import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BulkImportClient from '@/components/BulkImportClient'

export default async function BulkImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return <BulkImportClient />
}

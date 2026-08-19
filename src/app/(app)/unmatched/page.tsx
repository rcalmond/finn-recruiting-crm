import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import UnmatchedClient, { type OrphanRow, type SchoolOption, type AutoAddedRow } from './UnmatchedClient'

// Per-family surface for mail that arrived but matched no school.
// User client throughout — family RLS scopes every read.
export default async function UnmatchedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: orphans }, { data: schools }, { data: autoAdded }] = await Promise.all([
    supabase.from('contact_log')
      .select('id, sent_at, date, channel, direction, coach_name, summary, parse_notes')
      .eq('parse_status', 'orphan')
      .order('sent_at', { ascending: false })
      .limit(100),
    supabase.from('schools')
      .select('id, name, short_name, category')
      .order('category').order('name'),
    supabase.from('schools')
      .select('id, name, origin_note, created_at, category')
      .eq('origin', 'inbound_auto')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return (
    <UnmatchedClient
      orphans={(orphans ?? []) as OrphanRow[]}
      schools={(schools ?? []) as SchoolOption[]}
      autoAdded={(autoAdded ?? []) as AutoAddedRow[]}
    />
  )
}

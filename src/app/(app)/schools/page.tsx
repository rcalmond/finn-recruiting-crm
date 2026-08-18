import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SchoolsClient from '@/components/SchoolsClient'

export default async function SchoolsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Family's player (RLS-scoped; oldest-first — one player at alpha) for the
  // player-name-driven "Awaiting <name>" signal chip. Null-safe: no player row
  // falls back to the neutral label.
  const { data: player } = await supabase
    .from('players')
    .select('name')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const playerFirstName = ((player?.name as string | null) ?? '').trim().split(/\s+/)[0] || null

  return (
    <Suspense>
      <SchoolsClient user={user} playerFirstName={playerFirstName} />
    </Suspense>
  )
}

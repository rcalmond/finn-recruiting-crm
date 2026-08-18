import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PlayerSettingsClient from './PlayerSettingsClient'
import type { Player } from '@/lib/types'

// Settings → Player Profile. USER CLIENT throughout — RLS scopes every read and
// write, and the family_id helper default stamps the create. No service role
// anywhere on this surface.
export default async function PlayerSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // TODO(multi-player): first player by created_at; schema supports several.
  const { data: player } = await supabase
    .from('players')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return <PlayerSettingsClient initialPlayer={(player as Player | null) ?? null} />
}

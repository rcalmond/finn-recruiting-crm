import { createClient } from '@/lib/supabase/server'
import { getFamilyContext } from '@/lib/require-family'
import { pendingProposalIdsForFamily } from '@/lib/camp-proposal-queue'
import { getPlayerIdentity } from '@/lib/player-identity'
import { AppSidebar, AppBottomNav } from '@/components/AppNav'

// T1: RSC pages read on the user client — RLS enforces; catalog tables carry
// authenticated SELECT policies.
async function makeAdmin() {
  return createClient()
}

async function getPendingCoachChanges(): Promise<number> {
  try {
    const { count } = await (await makeAdmin())
      .from('coach_changes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'manual')
    return count ?? 0
  } catch {
    return 0
  }
}

async function getPendingCampProposals(): Promise<number> {
  try {
    // Counts what THIS family still has to review, not the shared pending total.
    // A badge that disagrees with its page is how people learn to ignore badges.
    const fam = await getFamilyContext()
    if (!fam.ok) return 0
    const ids = await pendingProposalIdsForFamily(await makeAdmin(), fam.ctx.familyId)
    return ids.length
  } catch {
    return 0
  }
}

export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const [{ data: { user } }, pendingCoachChanges, pendingCampProposals] = await Promise.all([
    supabase.auth.getUser(),
    getPendingCoachChanges(),
    getPendingCampProposals(),
  ])
  const userEmail = user?.email ?? ''
  // T1: display name from the users row (RLS: family members read family users)
  const { data: userRow } = user
    ? await supabase.from('users').select('display_name').eq('id', user.id).maybeSingle()
    : { data: null }
  const displayName = (userRow?.display_name as string | null) ?? ''

  // Player identity for the account footer — derived, never hardcoded.
  // TODO(multi-player): first player by created_at. RLS scopes the read; a
  // family with no player row falls back to display-name initials, no subtitle.
  const { data: playerRow } = user
    ? await supabase.from('players').select('name, position, grad_year')
        .order('created_at', { ascending: true }).limit(1).maybeSingle()
    : { data: null }
  const identity = getPlayerIdentity(playerRow ?? null, displayName)

  return (
    <>
      {/* Desktop sidebar — hidden on mobile via inline media */}
      <div className="hidden md:block">
        <AppSidebar
          pendingCoachChanges={pendingCoachChanges}
          pendingCampProposals={pendingCampProposals}
          userEmail={userEmail}
          displayName={displayName}
          playerInitials={identity.initials}
          playerSubtitle={identity.subtitle}
        />
      </div>

      {/* Main content area */}
      <div style={{ paddingBottom: 0 }} className="md:pl-[232px]">
        {children}
      </div>

      {/* Mobile bottom nav — hidden on desktop */}
      <div className="block md:hidden">
        <AppBottomNav
          pendingCoachChanges={pendingCoachChanges}
          pendingCampProposals={pendingCampProposals}
          userEmail={userEmail}
          displayName={displayName}
          playerInitials={identity.initials}
          playerSubtitle={identity.subtitle}
        />
      </div>
    </>
  )
}

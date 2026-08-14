import { createClient } from '@/lib/supabase/server'
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
    const { count } = await (await makeAdmin())
      .from('camp_proposals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    return count ?? 0
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

  return (
    <>
      {/* Desktop sidebar — hidden on mobile via inline media */}
      <div className="hidden md:block">
        <AppSidebar
          pendingCoachChanges={pendingCoachChanges}
          pendingCampProposals={pendingCampProposals}
          userEmail={userEmail}
          displayName={displayName}
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
        />
      </div>
    </>
  )
}

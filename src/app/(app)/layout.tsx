import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { AppSidebar, AppBottomNav } from '@/components/AppNav'

function makeAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getPendingCoachChanges(): Promise<number> {
  try {
    const { count } = await makeAdmin()
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
    const { count } = await makeAdmin()
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

  return (
    <>
      {/* Desktop sidebar — hidden on mobile via inline media */}
      <div className="hidden md:block">
        <AppSidebar
          pendingCoachChanges={pendingCoachChanges}
          pendingCampProposals={pendingCampProposals}
          userEmail={userEmail}
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
        />
      </div>
    </>
  )
}

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { AppSidebar, AppBottomNav } from '@/components/AppNav'

async function getPendingCoachChanges(): Promise<number> {
  try {
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { count } = await admin
      .from('coach_changes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'manual')
    return count ?? 0
  } catch {
    return 0  // nav badge is non-critical; fail silently
  }
}

export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const pendingCoachChanges = await getPendingCoachChanges()

  return (
    <>
      {/* Desktop sidebar — hidden on mobile via inline media */}
      <div className="hidden md:block">
        <AppSidebar pendingCoachChanges={pendingCoachChanges} />
      </div>

      {/* Main content area */}
      <div style={{ paddingBottom: 0 }} className="md:pl-[232px]">
        {children}
      </div>

      {/* Mobile bottom nav — hidden on desktop */}
      <div className="block md:hidden">
        <AppBottomNav pendingCoachChanges={pendingCoachChanges} />
      </div>
    </>
  )
}

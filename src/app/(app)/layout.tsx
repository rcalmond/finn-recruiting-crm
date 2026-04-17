import { AppSidebar, AppBottomNav } from '@/components/AppNav'

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Desktop sidebar — hidden on mobile via inline media */}
      <div className="hidden md:block">
        <AppSidebar />
      </div>

      {/* Main content area */}
      <div style={{ paddingBottom: 0 }} className="md:pl-[232px]">
        {children}
      </div>

      {/* Mobile bottom nav — hidden on desktop */}
      <div className="block md:hidden">
        <AppBottomNav />
      </div>
    </>
  )
}

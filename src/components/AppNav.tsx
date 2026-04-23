'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = {
  label: string
  href: string
  count?: number
}

// Sub-paths that belong to the Library section
const LIBRARY_PATHS = ['/library', '/assets', '/questions']

function buildNavItems(pendingCoachChanges: number): NavItem[] {
  return [
    { label: 'Today',          href: '/'                       },
    { label: 'Schools',        href: '/schools'                },
    { label: 'Library',        href: '/library'                },
    { label: 'Import',         href: '/bulk-import'            },
    { label: 'Review',  href: '/settings/coach-changes',
      count: pendingCoachChanges > 0 ? pendingCoachChanges : undefined },
    { label: 'Settings',       href: '/settings/gmail'         },
  ]
}

// ── Sidebar (desktop) ──────────────────────────────────────────────
export function AppSidebar({ pendingCoachChanges = 0 }: { pendingCoachChanges?: number }) {
  const pathname = usePathname()
  const NAV_ITEMS = buildNavItems(pendingCoachChanges)

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    if (href === '/library') return LIBRARY_PATHS.some(p => pathname.startsWith(p))
    if (href === '/settings/gmail') return pathname.startsWith('/settings/gmail')
    return pathname.startsWith(href)
  }

  return (
    <aside style={{
      width: 232,
      background: '#F6F1E8',
      borderRight: '1px solid #E2DBC9',
      padding: '22px 12px 16px',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      zIndex: 40,
    }}>
      {/* Logo */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '4px 12px 28px',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: '#C8102E', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, letterSpacing: -0.3,
          fontStyle: 'italic', flexShrink: 0,
        }}>F</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0E0E0E', letterSpacing: -0.4 }}>
          finnsoccer
        </div>
      </div>

      {/* Nav items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(item => {
          const on = isActive(item.href)
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 8,
                background: on ? '#0E0E0E' : 'transparent',
                cursor: 'pointer', fontSize: 14,
                color: on ? '#fff' : '#4A4A4A',
                fontWeight: on ? 600 : 450,
                letterSpacing: -0.1,
                transition: 'background 0.15s',
              }}>
                <span>{item.label}</span>
                {item.count != null && (
                  <span style={{
                    marginLeft: 'auto',
                    padding: '1px 7px', borderRadius: 10,
                    background: on ? '#C8102E' : 'transparent',
                    color: on ? '#fff' : '#7A7570',
                    fontSize: 11, fontWeight: 700,
                  }}>{item.count}</span>
                )}
              </div>
            </Link>
          )
        })}
      </div>

      <div style={{ flex: 1 }} />

      {/* User footer */}
      <div style={{
        padding: '12px 14px',
        borderTop: '1px solid #E2DBC9',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: '#0E0E0E', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, flexShrink: 0,
        }}>FA</div>
        <div style={{ lineHeight: 1.25, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 650, color: '#0E0E0E' }}>Finn Almond</div>
          <div style={{ fontSize: 11, color: '#7A7570' }}>Class of &apos;27 · LWB</div>
        </div>
      </div>
    </aside>
  )
}

// ── Bottom nav (mobile) ────────────────────────────────────────────
export function AppBottomNav({ pendingCoachChanges = 0 }: { pendingCoachChanges?: number }) {
  const pathname = usePathname()
  const NAV_ITEMS = buildNavItems(pendingCoachChanges)

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    if (href === '/library') return LIBRARY_PATHS.some(p => pathname.startsWith(p))
    if (href === '/settings/gmail') return pathname.startsWith('/settings/gmail')
    return pathname.startsWith(href)
  }

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#F6F1E8',
      borderTop: '1px solid #E2DBC9',
      padding: '10px 24px 26px',
      display: 'flex', justifyContent: 'space-around',
      zIndex: 40,
    }}>
      {NAV_ITEMS.map(item => {
        const on = isActive(item.href)
        return (
          <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              color: on ? '#0E0E0E' : '#7A7570',
              fontSize: 11, fontWeight: on ? 700 : 500,
              position: 'relative',
              fontStyle: on ? 'italic' : 'normal',
            }}>
              {on && (
                <div style={{
                  position: 'absolute', top: -10, width: 24, height: 3,
                  background: '#C8102E', borderRadius: 2,
                }} />
              )}
              {item.label}
            </div>
          </Link>
        )
      })}
    </nav>
  )
}

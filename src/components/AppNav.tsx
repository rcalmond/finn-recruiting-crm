'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ThroughballWordmark } from '@/components/brand/ThroughballLogo'
import AccountMenu from '@/components/AccountMenu'

type NavItem = {
  label: string
  href: string
  count?: number
}

type SettingsSubItem = {
  label: string
  href: string
  count?: number
}

// Phase routes — content pages reachable from phase landing pages
const PHASE_CONTENT_PATHS: Record<string, string[]> = {
  '/get-ready':     ['/kit', '/talking-points'],
  '/get-seen':      ['/campaigns', '/calendar'],
  '/get-recruited':  [],
  '/get-in':        [],
}

// Settings sub-items (settings routes)
const SETTINGS_PATHS = [
  '/settings/inbox',
  '/settings/player',
  '/bulk-import',
  '/admin/inbound',
  '/settings/coach-changes',
  '/settings/camp-proposals',
  '/settings/gmail',
  '/tools',
]

function buildPhaseNavItems(): NavItem[] {
  return [
    { label: 'Get Ready.',     href: '/get-ready'     },
    { label: 'Get Seen.',      href: '/get-seen'      },
    { label: 'Get Recruited.', href: '/get-recruited'  },
    { label: 'Get In.',        href: '/get-in'        },
  ]
}

function buildSettingsSubItems(
  pendingCoachChanges: number,
  pendingCampProposals: number,
): SettingsSubItem[] {
  return [
    { label: 'Player Profile', href: '/settings/player' },
    { label: 'Your Inbox',     href: '/settings/inbox' },
    { label: 'Import a Thread', href: '/bulk-import' },
    { label: 'Coach Changes',  href: '/settings/coach-changes',
      count: pendingCoachChanges > 0 ? pendingCoachChanges : undefined },
    { label: 'Camp Proposals', href: '/settings/camp-proposals',
      count: pendingCampProposals > 0 ? pendingCampProposals : undefined },
    { label: 'Gmail Settings', href: '/settings/gmail' },
  ]
}

function isSettingsPath(pathname: string) {
  return SETTINGS_PATHS.some(p => pathname.startsWith(p))
}

function isPhaseActive(href: string, pathname: string) {
  // Direct match
  if (pathname === href) return true
  // Content paths that belong to this phase
  const contentPaths = PHASE_CONTENT_PATHS[href]
  if (contentPaths) {
    return contentPaths.some(p => pathname.startsWith(p))
  }
  return false
}

// ── Sidebar (desktop) ──────────────────────────────────────────────
export function AppSidebar({
  pendingCoachChanges = 0,
  pendingCampProposals = 0,
  userEmail = '',
  displayName = '',
  playerInitials = '',
  playerSubtitle = null,
}: {
  pendingCoachChanges?: number
  pendingCampProposals?: number
  userEmail?: string
  displayName?: string
  playerInitials?: string
  playerSubtitle?: string | null
}) {
  const pathname = usePathname()
  const PHASE_ITEMS = buildPhaseNavItems()
  const SETTINGS_ITEMS = buildSettingsSubItems(pendingCoachChanges, pendingCampProposals)

  const settingsActive = isSettingsPath(pathname)
  const [settingsOpen, setSettingsOpen] = useState(settingsActive)

  const totalSettingsBadge = pendingCoachChanges + pendingCampProposals

  const isTopActive = (href: string) => {
    if (href === '/schools') return pathname.startsWith('/schools')
    return isPhaseActive(href, pathname)
  }

  // Settings sub-items use exact match to avoid /settings/gmail matching /settings/gmail-partials
  const isSubActive = (href: string) => pathname === href

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
      {/* Logo — links to the public marketing home */}
      <Link href="/" style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '4px 12px 28px', textDecoration: 'none',
      }}>
        <ThroughballWordmark size={17} />
      </Link>

      {/* Phase nav items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {PHASE_ITEMS.map(item => {
          const on = isTopActive(item.href)
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 8,
                background: on ? '#1A1A1A' : 'transparent',
                cursor: 'pointer', fontSize: 14,
                color: on ? '#FBF6EC' : '#4A4A4A',
                fontWeight: on ? 600 : 450,
                letterSpacing: -0.1,
                fontStyle: 'italic',
                transition: 'background 0.15s',
              }}>
                <span>{item.label}</span>
              </div>
            </Link>
          )
        })}

        {/* Schools — top-level, phase-independent */}
        {(() => {
          const on = isTopActive('/schools')
          return (
            <Link href="/schools" style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 8,
                background: on ? '#1A1A1A' : 'transparent',
                cursor: 'pointer', fontSize: 14,
                color: on ? '#FBF6EC' : '#4A4A4A',
                fontWeight: on ? 600 : 450,
                letterSpacing: -0.1,
                transition: 'background 0.15s',
                marginTop: 8,
                borderTop: '1px solid #E2DBC9',
                paddingTop: 18,
              }}>
                <span>Schools</span>
              </div>
            </Link>
          )
        })()}

        {/* Settings parent */}
        <button
          onClick={() => setSettingsOpen(prev => !prev)}
          style={{
            all: 'unset',
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', borderRadius: 8,
            background: settingsActive && !settingsOpen ? '#1A1A1A' : 'transparent',
            cursor: 'pointer', fontSize: 14,
            color: settingsActive && !settingsOpen ? '#FBF6EC' : settingsActive ? '#1A1A1A' : '#4A4A4A',
            fontWeight: settingsActive ? 600 : 450,
            letterSpacing: -0.1,
            transition: 'background 0.15s',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <span>Settings</span>
          {/* Chevron */}
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{
              marginLeft: 2,
              transform: settingsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s',
            }}
          >
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {totalSettingsBadge > 0 && (
            <span style={{
              marginLeft: 'auto',
              padding: '1px 7px', borderRadius: 10,
              background: settingsActive && !settingsOpen ? '#1F6B48' : 'transparent',
              color: settingsActive && !settingsOpen ? '#FBF6EC' : '#7A7570',
              fontSize: 11, fontWeight: 700,
            }}>{totalSettingsBadge}</span>
          )}
        </button>

        {/* Settings sub-items */}
        {settingsOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingLeft: 12 }}>
            {SETTINGS_ITEMS.map(item => {
              const on = isSubActive(item.href)
              return (
                <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 14px', borderRadius: 8,
                    background: on ? '#1A1A1A' : 'transparent',
                    cursor: 'pointer', fontSize: 13,
                    color: on ? '#FBF6EC' : '#4A4A4A',
                    fontWeight: on ? 600 : 450,
                    letterSpacing: -0.1,
                    transition: 'background 0.15s',
                  }}>
                    <span>{item.label}</span>
                    {item.count != null && (
                      <span style={{
                        marginLeft: 'auto',
                        padding: '1px 7px', borderRadius: 10,
                        background: on ? '#1F6B48' : 'transparent',
                        color: on ? '#FBF6EC' : '#7A7570',
                        fontSize: 11, fontWeight: 700,
                      }}>{item.count}</span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Account menu — sign out + change password (rehomed from /pipeline) */}
      <AccountMenu email={userEmail} displayName={displayName} initials={playerInitials} subtitle={playerSubtitle} variant="sidebar" />
    </aside>
  )
}

// ── Bottom nav (mobile) ────────────────────────────────────────────
export function AppBottomNav({
  pendingCoachChanges = 0,
  pendingCampProposals = 0,
  userEmail = '',
  displayName = '',
  playerInitials = '',
  playerSubtitle = null,
}: {
  pendingCoachChanges?: number
  pendingCampProposals?: number
  userEmail?: string
  displayName?: string
  playerInitials?: string
  playerSubtitle?: string | null
}) {
  const pathname = usePathname()

  const totalSettingsBadge = pendingCoachChanges + pendingCampProposals

  const MOBILE_ITEMS: NavItem[] = [
    { label: 'Ready',      href: '/get-ready'     },
    { label: 'Seen',       href: '/get-seen'      },
    { label: 'Recruited',  href: '/get-recruited'  },
    { label: 'Get In',     href: '/get-in'        },
    { label: 'Schools',    href: '/schools'        },
    { label: 'Settings',   href: '/settings/coach-changes',
      count: totalSettingsBadge > 0 ? totalSettingsBadge : undefined },
  ]

  const isActive = (href: string) => {
    if (href === '/schools') return pathname.startsWith('/schools')
    if (href === '/settings/coach-changes') return isSettingsPath(pathname)
    return isPhaseActive(href, pathname)
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
      {MOBILE_ITEMS.map(item => {
        const on = isActive(item.href)
        return (
          <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              color: on ? '#1A1A1A' : '#7A7570',
              fontSize: 11, fontWeight: on ? 700 : 500,
              position: 'relative',
              fontStyle: on ? 'italic' : 'normal',
            }}>
              {on && (
                <div style={{
                  position: 'absolute', top: -10, width: 24, height: 3,
                  background: '#1F6B48', borderRadius: 2,
                }} />
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {item.label}
                {item.count != null && (
                  <span style={{
                    padding: '0 5px', borderRadius: 8,
                    background: '#1F6B48', color: '#FBF6EC',
                    fontSize: 9, fontWeight: 700,
                    lineHeight: '16px',
                  }}>{item.count}</span>
                )}
              </span>
            </div>
          </Link>
        )
      })}
      {/* Account menu — sign out + change password (rehomed from /pipeline) */}
      <AccountMenu email={userEmail} displayName={displayName} initials={playerInitials} subtitle={playerSubtitle} variant="mobile" />
    </nav>
  )
}

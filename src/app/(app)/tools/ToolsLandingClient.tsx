'use client'

import Link from 'next/link'

type ToolCard = {
  label: string
  description: string
  href: string
  count: number
}

export default function ToolsLandingClient({
  pendingCoachChanges,
  pendingGmailPartials,
  pendingClassification,
}: {
  pendingCoachChanges: number
  pendingGmailPartials: number
  pendingClassification: number
}) {
  const tools: ToolCard[] = [
    {
      label: 'Coach Changes',
      description: 'Review coach roster changes flagged by the biweekly sync',
      href: '/settings/coach-changes',
      count: pendingCoachChanges,
    },
    {
      label: 'Parse Review',
      description: "Resolve emails the Gmail parser couldn't fully process",
      href: '/settings/gmail-partials',
      count: pendingGmailPartials,
    },
    {
      label: 'Classification Review',
      description: 'Confirm AI intent labels for low-confidence email classifications',
      href: '/settings/classification-review',
      count: pendingClassification,
    },
    {
      label: 'Gmail Settings',
      description: 'Manage Gmail sync and integration settings',
      href: '/settings/gmail',
      count: 0,
    },
  ]

  return (
    <div style={{ padding: '32px 24px', maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{
        fontSize: 22, fontWeight: 700, color: '#0E0E0E',
        letterSpacing: -0.5, marginBottom: 24,
      }}>
        Tools
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tools.map(tool => (
          <Link key={tool.href} href={tool.href} style={{ textDecoration: 'none' }}>
            <div style={{
              padding: '16px 20px',
              background: '#fff',
              border: '1px solid #E2DBC9',
              borderRadius: 10,
              cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 6,
              }}>
                <span style={{
                  fontSize: 15, fontWeight: 600, color: '#0E0E0E',
                  letterSpacing: -0.2,
                }}>
                  {tool.label}
                </span>
                {tool.count > 0 && (
                  <span style={{
                    padding: '1px 8px', borderRadius: 10,
                    background: '#C8102E', color: '#fff',
                    fontSize: 11, fontWeight: 700,
                  }}>
                    {tool.count}
                  </span>
                )}
              </div>
              <div style={{
                fontSize: 13, color: '#7A7570', lineHeight: 1.45,
              }}>
                {tool.description}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

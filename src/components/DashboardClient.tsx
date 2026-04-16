'use client'

import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useSchools, useContactLog, useActionItems } from '@/hooks/useRealtimeData'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { todayStr, formatDate } from '@/lib/utils'
import type { School, ContactLogEntry } from '@/lib/types'
import DashboardView from './DashboardView'
import PipelineTable from './PipelineTable'
import ActionsPanel from './ActionsPanel'
import ContactLogPanel from './ContactLogPanel'
import SchoolModal from './SchoolModal'

type Tab = 'dashboard' | 'pipeline' | 'actions' | 'log'

export default function DashboardClient({ user }: { user: User }) {
  const router = useRouter()
  const supabase = createClient()
  const { schools, loading, updateSchool, insertSchool, deleteSchool, reorderSchools } = useSchools()
  const { entries: contactLog } = useContactLog()
  const { items: actionItems, deleteItem: deleteActionItem, reorderItems: reorderActionItems } = useActionItems()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [pipelineFilters, setPipelineFilters] = useState<Record<string, unknown>>({})
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null)
  const [addingSchool, setAddingSchool] = useState(false)

  function handleNavigate(dest: 'pipeline' | 'actions', filters?: Record<string, unknown>) {
    setPipelineFilters(filters ?? {})
    setTab(dest)
  }

  const [copied, setCopied] = useState(false)

  function formatForClaude(schools: School[], contactLog: ContactLogEntry[], actionItems: typeof activeActionItems): string {
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const active = schools.filter(s => s.category !== 'Nope' && s.status !== 'Inactive')
    const logBySchool = contactLog.reduce<Record<string, ContactLogEntry[]>>((acc, e) => {
      if (!acc[e.school_id]) acc[e.school_id] = []
      acc[e.school_id].push(e)
      return acc
    }, {})
    const actionsBySchool = actionItems.reduce<Record<string, typeof actionItems>>((acc, i) => {
      if (!acc[i.school_id]) acc[i.school_id] = []
      acc[i.school_id].push(i)
      return acc
    }, {})

    const tiers: { label: string; cat: string }[] = [
      { label: 'TIER A', cat: 'A' },
      { label: 'TIER B', cat: 'B' },
      { label: 'TIER C', cat: 'C' },
    ]

    const lines: string[] = [
      `FINN RECRUITING CRM — ${date}`,
      `Active schools: ${active.length} | Contact log entries: ${contactLog.length}`,
      '',
    ]

    for (const { label, cat } of tiers) {
      const tier = active.filter(s => s.category === cat)
      if (tier.length === 0) continue
      lines.push(`━━━ ${label} ━━━`, '')
      for (const s of tier) {
        lines.push(`SCHOOL: ${s.name}`)
        lines.push(`  Stage: ${s.status}`)
        lines.push(`  Division: ${s.division}${s.conference ? ` — ${s.conference}` : ''}`)
        lines.push(`  Location: ${s.location || '—'}`)
        lines.push(`  Admit Likelihood: ${s.admit_likelihood || '—'}`)
        lines.push(`  Last Contact: ${formatDate(s.last_contact) || '—'}`)
        if (s.notes) lines.push(`  Notes: ${s.notes.replace(/\n/g, ' | ')}`)
        const actions = actionsBySchool[s.id]
        if (actions && actions.length > 0) {
          lines.push(`  Action Items:`)
          actions.forEach(i => {
            let line = `    • ${i.action}`
            if (i.owner) line += ` (${i.owner})`
            if (i.due_date) line += ` — due ${formatDate(i.due_date)}`
            lines.push(line)
          })
        }
        const log = logBySchool[s.id]
        if (log && log.length > 0) {
          lines.push(`  Contact Log (${log.length} entries):`)
          log.forEach(e => {
            lines.push(`    [${e.date}] ${e.direction} via ${e.channel}${e.coach_name ? ` — ${e.coach_name}` : ''}:`)
            lines.push(`      ${e.summary}`)
          })
        }
        lines.push('')
      }
    }

    return lines.join('\n')
  }

  function handleCopyForClaude() {
    const text = formatForClaude(schools, contactLog, activeActionItems)
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const today = todayStr()
  const active = schools.filter(s => s.category !== 'Nope' && s.status !== 'Inactive')
  const activeIds = new Set(active.map(s => s.id))
  const activeActionItems = actionItems.filter(i => activeIds.has(i.school_id))
  const overdueCount = activeActionItems.filter(i => i.due_date && i.due_date < today).length
  const actionCount = activeActionItems.length

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'pipeline', label: 'Pipeline', count: schools.filter(s => s.status !== 'Inactive').length },
    { key: 'actions', label: 'Action Items', count: actionCount },
    { key: 'log', label: 'Contact Log', count: contactLog.length },
  ]

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#fafbfc', minHeight: '100vh', color: '#0f172a' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ padding: '20px 20px 0', maxWidth: 960, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
              Finn Almond — Recruiting Tracker
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#64748b' }}>
              Class of 2027 · Left Wingback · Albion SC MLS NEXT · {schools.length} schools
              {overdueCount > 0 && (
                <span style={{ color: '#dc2626', fontWeight: 600 }}> · {overdueCount} overdue</span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>{user.email}</span>
            <button
              onClick={() => router.push('/auth/update-password')}
              style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer', color: '#64748b', fontFamily: 'inherit' }}
            >
              Change password
            </button>
            <button
              onClick={handleSignOut}
              style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer', color: '#64748b', fontFamily: 'inherit' }}
            >
              Sign out
            </button>
            <button
              onClick={handleCopyForClaude}
              style={{ background: copied ? '#059669' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.2s' }}
            >
              {copied ? 'Copied!' : 'Copy for Claude'}
            </button>
            <button
              onClick={() => setAddingSchool(true)}
              style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              + Add School
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 8, padding: 3, width: 'fit-content', marginBottom: 20 }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: tab === t.key ? 700 : 500, fontFamily: 'inherit',
                background: tab === t.key ? '#fff' : 'transparent',
                color: tab === t.key ? '#0f172a' : '#64748b',
                boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {t.label}{t.count != null ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '0 20px 40px', maxWidth: 960, margin: '0 auto' }}>
        {loading && <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Loading…</div>}

        {!loading && tab === 'dashboard' && (
          <DashboardView schools={schools} contactLog={contactLog} actionItems={activeActionItems} onNavigate={handleNavigate} onSelectSchool={setSelectedSchool} />
        )}
        {!loading && tab === 'pipeline' && (
          <PipelineTable
            schools={schools}
            actionItems={actionItems}
            onSelectSchool={setSelectedSchool}
            onUpdateSchool={updateSchool}
            onReorderSchools={reorderSchools}
            initialFilters={pipelineFilters as never}
          />
        )}
        {!loading && tab === 'actions' && (
          <ActionsPanel
            actionItems={activeActionItems}
            schools={schools}
            onSelectSchool={setSelectedSchool}
            onDeleteItem={deleteActionItem}
            onReorderItems={reorderActionItems}
          />
        )}
        {!loading && tab === 'log' && (
          <ContactLogPanel schools={schools} userId={user.id} />
        )}

      </div>

      {/* Modals */}
      {selectedSchool && (
        <SchoolModal
          school={selectedSchool}
          userId={user.id}
          onUpdate={async (updates) => { await updateSchool(selectedSchool.id, updates) }}
          onDelete={async () => { await deleteSchool(selectedSchool.id); setSelectedSchool(null) }}
          onClose={() => setSelectedSchool(null)}
        />
      )}
      {addingSchool && (
        <SchoolModal
          school={null}
          userId={user.id}
          onInsert={async (school) => { await insertSchool(school); setAddingSchool(false) }}
          onClose={() => setAddingSchool(false)}
        />
      )}
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { useSchools, useContactLog, useActionItems, useCamps } from '@/hooks/useRealtimeData'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { todayStr, formatDate } from '@/lib/utils'
import type { School, ContactLogEntry } from '@/lib/types'
import PipelineTable from './PipelineTable'
import ActionsPanel from './ActionsPanel'
import ContactLogPanel from './ContactLogPanel'
import SchoolModal from './SchoolModal'

type Tab = 'pipeline' | 'actions' | 'log'

// ─── Design tokens ───────────────────────────────────────────────────────────
const P = {
  paper:     '#F6F1E8',
  paperDeep: '#EFE8D8',
  ink:       '#0E0E0E',
  inkMid:    '#4A4A4A',
  inkLo:     '#7A7570',
  inkMute:   '#A8A39B',
  line:      '#E2DBC9',
  line2:     '#D3CAB3',
  white:     '#FFFFFF',
  red:       '#C8102E',
  teal:      '#00B2A9',
  tealDeep:  '#006A65',
}

export default function DashboardClient({ user }: { user: User }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { schools, loading, updateSchool, deleteSchool, reorderSchools } = useSchools()
  const { entries: contactLog } = useContactLog()
  const { items: actionItems, completeItem: completeActionItem, reorderItems: reorderActionItems } = useActionItems()
  const { camps } = useCamps(schools)
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab')
    return (t === 'actions' || t === 'log') ? t : 'pipeline'
  })
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null)

  // Open school modal when ?school=<id> is in the URL (e.g. deep-linked from school detail)
  const schoolParam = searchParams.get('school')
  useEffect(() => {
    if (!schoolParam || loading) return
    const match = schools.find(s => s.id === schoolParam)
    if (match) {
      setSelectedSchool(match)
      const url = new URL(window.location.href)
      url.searchParams.delete('school')
      window.history.replaceState(null, '', url.toString())
    }
  }, [schoolParam, schools, loading])

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
    { key: 'pipeline', label: 'Pipeline', count: schools.filter(s => s.status !== 'Inactive').length },
    { key: 'actions', label: 'Actions', count: actionCount },
    { key: 'log', label: 'Contact Log', count: contactLog.length },
  ]

  return (
    <div style={{ background: P.paper, minHeight: '100vh', color: P.ink }}>
      <div style={{ padding: 'clamp(20px, 3vw, 40px)', maxWidth: 960, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 700, fontStyle: 'italic', letterSpacing: '-0.04em' }}>
              Pipeline.
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: P.inkLo, letterSpacing: '-0.01em' }}>
              {schools.length} schools
              {overdueCount > 0 && (
                <span style={{ color: P.red, fontWeight: 600 }}> · {overdueCount} overdue</span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: P.inkMute }}>{user.email}</span>
            <button
              onClick={() => router.push('/auth/update-password')}
              style={outlinedBtn}
            >
              Change password
            </button>
            <button onClick={handleSignOut} style={outlinedBtn}>
              Sign out
            </button>
            <button
              onClick={handleCopyForClaude}
              style={{
                background: copied ? P.tealDeep : P.ink,
                color: P.white, border: 'none', borderRadius: 999,
                padding: '7px 16px', fontSize: 13, fontWeight: 650,
                cursor: 'pointer', fontFamily: 'inherit',
                letterSpacing: '-0.01em', transition: 'background 0.2s',
              }}
            >
              {copied ? 'Copied!' : 'Copy for Claude'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 24 }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '7px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: tab === t.key ? 700 : 500, fontFamily: 'inherit',
                letterSpacing: '-0.01em',
                background: tab === t.key ? P.ink : 'transparent',
                color: tab === t.key ? P.white : P.inkLo,
              }}
            >
              {t.label}{t.count != null ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading && <div style={{ textAlign: 'center', padding: 60, color: P.inkMute }}>Loading…</div>}

        {!loading && tab === 'pipeline' && (
          <PipelineTable
            schools={schools}
            actionItems={actionItems}
            camps={camps}
            onSelectSchool={setSelectedSchool}
            onUpdateSchool={updateSchool}
            onReorderSchools={reorderSchools}
          />
        )}
        {!loading && tab === 'actions' && (
          <ActionsPanel
            actionItems={activeActionItems}
            schools={schools}
            onSelectSchool={setSelectedSchool}
            onDeleteItem={completeActionItem}
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
    </div>
  )
}

const outlinedBtn: React.CSSProperties = {
  background: 'none', border: `1.3px solid #D3CAB3`, borderRadius: 999,
  padding: '5px 12px', fontSize: 11, cursor: 'pointer',
  color: '#7A7570', fontFamily: 'inherit', fontWeight: 600,
}

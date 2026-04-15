'use client'

import type { School, ContactLogEntry, ActionItem } from '@/lib/types'
import { ADMIT_COLORS, CATEGORY_COLORS, STATUS_COLORS, categoryLabel, formatDate, daysBetween, todayStr } from '@/lib/utils'

const STATUSES = ['Not Contacted', 'Intro Sent', 'Ongoing Conversation', 'Visit Scheduled', 'Offer', 'Inactive'] as const
const ADMIT_LEVELS = ['Likely', 'Target', 'Reach', 'Far Reach'] as const

function StatCard({ label, value, sub, color, onClick }: { label: string; value: number; sub?: string; color?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px', flex: '1 1 140px', minWidth: 140, cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow 0.15s' }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color: color || '#0f172a', letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
      {onClick && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Click to view →</div>}
    </div>
  )
}

function MiniBar({ label, count, total, color }: { label: string; count: number; total: number; color?: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <div style={{ width: 120, fontSize: 12, color: '#475569', fontWeight: 500, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 16, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color || '#3b82f6', borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
      <div style={{ width: 32, fontSize: 12, fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>{count}</div>
    </div>
  )
}

interface DashboardViewProps {
  schools: School[]
  contactLog: ContactLogEntry[]
  actionItems: ActionItem[]
  onNavigate: (tab: 'pipeline' | 'actions', filters?: Record<string, unknown>) => void
  onSelectSchool: (s: School) => void
}

export default function DashboardView({ schools, contactLog, actionItems, onNavigate, onSelectSchool }: DashboardViewProps) {
  const active = schools.filter(s => s.status !== 'Inactive' && s.category !== 'Nope')
  const nope = schools.filter(s => s.category === 'Nope')
  const today = todayStr()

  const statusCounts = Object.fromEntries(STATUSES.map(s => [s, 0])) as Record<string, number>
  active.forEach(s => { statusCounts[s.status] = (statusCounts[s.status] || 0) + 1 })

  const divCounts = { D1: 0, D2: 0, D3: 0 }
  active.forEach(s => { if (s.division in divCounts) divCounts[s.division as keyof typeof divCounts]++ })

  const admitCounts = Object.fromEntries(ADMIT_LEVELS.map(a => [a, 0])) as Record<string, number>
  active.forEach(s => { if (s.admit_likelihood) admitCounts[s.admit_likelihood] = (admitCounts[s.admit_likelihood] || 0) + 1 })

  const tierCounts = { A: 0, B: 0, C: 0 }
  active.forEach(s => { if (s.category in tierCounts) tierCounts[s.category as keyof typeof tierCounts]++ })

  const overdueCount = actionItems.filter(i => i.due_date && i.due_date < today).length
  const stale = active.filter(s => s.last_contact && daysBetween(s.last_contact) > 60)
  const ongoing = active.filter(s => s.status === 'Ongoing Conversation')
  const rqDone = active.filter(s => s.rq_status?.toLowerCase().includes('completed'))
  const rqToDo = active.filter(s => s.rq_status?.toLowerCase().includes('to do'))

  // Top 5 action items (already in manual sort order from hook)
  const top5 = actionItems.slice(0, 5)

  return (
    <div>
      {/* Top stats */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard label="Active Schools" value={active.length} sub={`+ ${nope.length} parked`} onClick={() => onNavigate('pipeline')} />
        <StatCard label="Ongoing Conversations" value={ongoing.length} color="#2563eb" onClick={() => onNavigate('pipeline', { status: 'Ongoing Conversation' })} />
        <StatCard label="Overdue Actions" value={overdueCount} color={overdueCount > 0 ? '#dc2626' : '#10b981'} onClick={() => onNavigate('actions')} />
        <StatCard label="Stale (60+ days)" value={stale.length} color={stale.length > 5 ? '#f59e0b' : '#10b981'} sub="No contact" onClick={() => onNavigate('pipeline', { stale: true })} />
      </div>

      {/* Top 5 Actions */}
      {top5.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Top Actions
            </div>
            <button
              onClick={() => onNavigate('actions')}
              style={{ background: 'none', border: 'none', fontSize: 11, color: '#6366f1', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
            >
              View all {actionItems.length} →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {top5.map((item, i) => {
              const school = item.school
              const schoolFull = schools.find(s => s.id === item.school_id)
              const cat = school?.category ?? 'C'
              const cc = CATEGORY_COLORS[cat]
              const overdue = !!(item.due_date && item.due_date < today)
              return (
                <div
                  key={item.id}
                  onClick={() => schoolFull && onSelectSchool(schoolFull)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: 7,
                    background: overdue ? '#fef2f2' : '#f8fafc',
                    border: `1px solid ${overdue ? '#fecaca' : '#f1f5f9'}`,
                    cursor: schoolFull ? 'pointer' : 'default',
                  }}
                  onMouseEnter={e => { if (schoolFull) e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)' }}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', width: 14, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: cc + '18', color: cc, flexShrink: 0 }}>
                    {categoryLabel(cat)}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 12, flexShrink: 0, color: '#0f172a' }}>
                    {school?.short_name || school?.name || '—'}
                  </span>
                  <span style={{ fontSize: 12, color: '#475569', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.action}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {item.owner && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: item.owner === 'Finn' ? '#2563eb' : '#059669' }}>{item.owner}</span>
                    )}
                    {item.due_date && (
                      <span style={{ fontSize: 10, color: overdue ? '#dc2626' : '#94a3b8', fontWeight: overdue ? 700 : 400 }}>
                        {overdue ? 'OVERDUE' : formatDate(item.due_date)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Status breakdown */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>By Status</div>
          <MiniBar label="Not Contacted"  count={statusCounts['Not Contacted']}        total={active.length} color={STATUS_COLORS['Not Contacted'].dot} />
          <MiniBar label="Intro Sent"     count={statusCounts['Intro Sent']}           total={active.length} color={STATUS_COLORS['Intro Sent'].dot} />
          <MiniBar label="Ongoing"        count={statusCounts['Ongoing Conversation']} total={active.length} color={STATUS_COLORS['Ongoing Conversation'].dot} />
          <MiniBar label="Visit Scheduled"count={statusCounts['Visit Scheduled']}      total={active.length} color={STATUS_COLORS['Visit Scheduled'].dot} />
          <MiniBar label="Offer"          count={statusCounts['Offer']}                total={active.length} color={STATUS_COLORS['Offer'].dot} />
          <MiniBar label="Inactive"       count={statusCounts['Inactive']}             total={active.length} color={STATUS_COLORS['Inactive'].dot} />
        </div>

        {/* Division + Tier */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>By Division</div>
          <MiniBar label="D1" count={divCounts.D1} total={active.length} color="#ef4444" />
          <MiniBar label="D2" count={divCounts.D2} total={active.length} color="#f59e0b" />
          <MiniBar label="D3" count={divCounts.D3} total={active.length} color="#10b981" />
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>By Tier</div>
            <MiniBar label="Tier A" count={tierCounts.A} total={active.length} color={CATEGORY_COLORS.A} />
            <MiniBar label="Tier B" count={tierCounts.B} total={active.length} color={CATEGORY_COLORS.B} />
            <MiniBar label="Tier C" count={tierCounts.C} total={active.length} color={CATEGORY_COLORS.C} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Admit likelihood */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Admit Likelihood</div>
          {ADMIT_LEVELS.map(a => (
            <MiniBar key={a} label={a} count={admitCounts[a]} total={active.length} color={ADMIT_COLORS[a]} />
          ))}
        </div>

        {/* Progress indicators */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Progress Indicators</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Recruiting Questionnaire Done', value: `${rqDone.length} / ${active.length}`, warn: false },
              { label: 'RQ Still To Do',                 value: String(rqToDo.length),                 warn: rqToDo.length > 0 },
              { label: 'Video Sent',                     value: `${active.filter(s => s.videos_sent).length} / ${active.length}`, warn: false },
              { label: 'Contact Log Entries',            value: String(contactLog.length),              warn: false },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#475569' }}>{row.label}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: row.warn ? '#f59e0b' : '#0f172a' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stale callout */}
      {stale.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 20px', marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
            SCHOOLS GOING STALE (60+ days since last contact)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {stale
              .sort((a, b) => (a.last_contact || '') < (b.last_contact || '') ? -1 : 1)
              .map(s => (
                <span key={s.id} onClick={() => onSelectSchool(s)} style={{ padding: '3px 8px', borderRadius: 4, background: '#fef3c7', fontSize: 11, fontWeight: 600, color: '#92400e', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                  {s.short_name || s.name} ({daysBetween(s.last_contact!)}d)
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

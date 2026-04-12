'use client'

import { useState } from 'react'
import type { School, Status } from '@/lib/types'
import { STATUS_COLORS, CATEGORY_COLORS, categoryLabel, formatDate, todayStr } from '@/lib/utils'

const STATUSES: Status[] = ['Not Contacted', 'Intro Sent', 'Ongoing Conversation', 'Visit Scheduled', 'Offer', 'Inactive']
void STATUSES

type SortKey = 'overdue' | 'tier' | 'school' | 'due' | 'owner'
const CATEGORY_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, Nope: 3 }

interface Props {
  schools: School[]
  onSelectSchool: (s: School) => void
  onUpdateSchool: (id: string, updates: Partial<School>) => Promise<unknown>
}

export default function ActionsPanel({ schools, onSelectSchool, onUpdateSchool }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('overdue')
  const today = todayStr()

  const items = schools
    .filter(s => s.next_action && s.status !== 'Inactive' && s.category !== 'Nope')
    .map(s => ({ ...s, overdue: !!(s.next_action_due && s.next_action_due < today) }))
    .sort((a, b) => {
      switch (sortKey) {
        case 'overdue':
          if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
          return (a.next_action_due || '9999').localeCompare(b.next_action_due || '9999')
        case 'tier':
          return (CATEGORY_ORDER[a.category] ?? 9) - (CATEGORY_ORDER[b.category] ?? 9)
        case 'school':
          return (a.short_name || a.name).localeCompare(b.short_name || b.name)
        case 'due':
          return (a.next_action_due || '9999').localeCompare(b.next_action_due || '9999')
        case 'owner':
          return (a.next_action_owner || '').localeCompare(b.next_action_owner || '')
        default:
          return 0
      }
    })

  function markDone(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    onUpdateSchool(id, { next_action: '', next_action_due: null, next_action_owner: null })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sort by</span>
        {([
          ['overdue', 'Due Date'],
          ['tier', 'Tier'],
          ['school', 'School'],
          ['owner', 'Owner'],
        ] as [SortKey, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: sortKey === key ? 700 : 500, fontFamily: 'inherit', background: sortKey === key ? '#0f172a' : '#f1f5f9', color: sortKey === key ? '#fff' : '#475569' }}
          >
            {label}
          </button>
        ))}
        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>{items.length} items</span>
      </div>

      {items.length === 0 && (
        <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb' }}>
          No action items. Nice work!
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(s => {
          const sc = STATUS_COLORS[s.status]
          return (
            <div
              key={s.id}
              onClick={() => onSelectSchool(s)}
              style={{
                background: '#fff', borderRadius: 8,
                border: `1px solid ${s.overdue ? '#fecaca' : '#e5e7eb'}`,
                padding: '12px 16px', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{s.short_name || s.name}</span>
                  <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: CATEGORY_COLORS[s.category] + '18', color: CATEGORY_COLORS[s.category] }}>
                    {categoryLabel(s.category)}
                  </span>
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.text, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot, display: 'inline-block' }} />
                    {s.status}
                  </span>
                  {s.overdue && (
                    <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#fef2f2', color: '#dc2626' }}>OVERDUE</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: '#334155' }}>{s.next_action}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                  {s.next_action_owner && (
                    <span style={{ fontWeight: 600, color: s.next_action_owner === 'Finn' ? '#2563eb' : '#059669' }}>
                      {s.next_action_owner}
                    </span>
                  )}
                  {s.next_action_due && <span> · Due {formatDate(s.next_action_due)}</span>}
                </div>
              </div>
              <button
                onClick={e => markDone(e, s.id)}
                style={{ padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', background: '#f1f5f9', color: '#475569', flexShrink: 0 }}
              >
                Done ✓
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

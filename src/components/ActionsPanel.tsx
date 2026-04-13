'use client'

import type { School, ActionItem } from '@/lib/types'
import { useState } from 'react'
import { STATUS_COLORS, CATEGORY_COLORS, categoryLabel, formatDate, todayStr } from '@/lib/utils'

type SortKey = 'overdue' | 'tier' | 'school' | 'due' | 'owner'
const CATEGORY_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, Nope: 3 }

interface Props {
  actionItems: ActionItem[]
  schools: School[]
  onSelectSchool: (s: School) => void
  onDeleteItem: (id: string) => Promise<unknown>
}

export default function ActionsPanel({ actionItems, schools, onSelectSchool, onDeleteItem }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('overdue')
  const today = todayStr()

  const items = actionItems
    .map(i => ({ ...i, overdue: !!(i.due_date && i.due_date < today) }))
    .sort((a, b) => {
      switch (sortKey) {
        case 'overdue':
          if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
          return (a.due_date || '9999').localeCompare(b.due_date || '9999')
        case 'tier':
          return (CATEGORY_ORDER[a.school?.category ?? 'Nope'] ?? 9) - (CATEGORY_ORDER[b.school?.category ?? 'Nope'] ?? 9)
        case 'school':
          return (a.school?.short_name || a.school?.name || '').localeCompare(b.school?.short_name || b.school?.name || '')
        case 'due':
          return (a.due_date || '9999').localeCompare(b.due_date || '9999')
        case 'owner':
          return (a.owner || '').localeCompare(b.owner || '')
        default:
          return 0
      }
    })

  function handleDone(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    onDeleteItem(id)
  }

  function handleRowClick(item: ActionItem) {
    const school = schools.find(s => s.id === item.school_id)
    if (school) onSelectSchool(school)
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
        {items.map(item => {
          const school = item.school
          const status = schools.find(s => s.id === item.school_id)?.status
          const sc = status ? STATUS_COLORS[status] : STATUS_COLORS['Not Contacted']
          const cat = school?.category ?? 'C'
          const cc = CATEGORY_COLORS[cat]
          return (
            <div
              key={item.id}
              onClick={() => handleRowClick(item)}
              style={{
                background: '#fff', borderRadius: 8,
                border: `1px solid ${item.overdue ? '#fecaca' : '#e5e7eb'}`,
                padding: '12px 16px', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{school?.short_name || school?.name || '—'}</span>
                  <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: cc + '18', color: cc }}>
                    {categoryLabel(cat)}
                  </span>
                  {status && (
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.text, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot, display: 'inline-block' }} />
                      {status}
                    </span>
                  )}
                  {item.overdue && (
                    <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#fef2f2', color: '#dc2626' }}>OVERDUE</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: '#334155' }}>{item.action}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                  {item.owner && (
                    <span style={{ fontWeight: 600, color: item.owner === 'Finn' ? '#2563eb' : '#059669' }}>
                      {item.owner}
                    </span>
                  )}
                  {item.due_date && <span> · Due {formatDate(item.due_date)}</span>}
                </div>
              </div>
              <button
                onClick={e => handleDone(e, item.id)}
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

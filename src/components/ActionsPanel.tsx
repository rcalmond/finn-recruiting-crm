'use client'

import type { School, Status, ActionOwner } from '@/lib/types'
import { STATUS_COLORS, formatDate, todayStr } from '@/lib/utils'

const STATUSES: Status[] = ['Not Contacted', 'Intro Sent', 'Ongoing Conversation', 'Visit Scheduled', 'Offer', 'Inactive']

interface Props {
  schools: School[]
  onSelectSchool: (s: School) => void
  onUpdateSchool: (id: string, updates: Partial<School>) => Promise<unknown>
}

export default function ActionsPanel({ schools, onSelectSchool, onUpdateSchool }: Props) {
  const today = todayStr()

  const items = schools
    .filter(s => s.next_action && s.status !== 'Inactive')
    .map(s => ({ ...s, overdue: !!(s.next_action_due && s.next_action_due < today) }))
    .sort((a, b) => {
      if (a.overdue && !b.overdue) return -1
      if (!a.overdue && b.overdue) return 1
      return (a.next_action_due || '9999') < (b.next_action_due || '9999') ? -1 : 1
    })

  function markDone(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    onUpdateSchool(id, { next_action: '', next_action_due: null, next_action_owner: null })
  }

  return (
    <div>
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

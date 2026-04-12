'use client'

import { useState, useMemo } from 'react'
import type { School, PipelineFilters, Division, Status, AdmitLikelihood, Category, ActionOwner } from '@/lib/types'
import { STATUS_COLORS, ADMIT_COLORS, CATEGORY_COLORS, categoryLabel, formatDate, daysBetween, todayStr } from '@/lib/utils'

const STATUSES: Status[] = ['Not Contacted', 'Intro Sent', 'Ongoing Conversation', 'Visit Scheduled', 'Offer', 'Inactive']
const CATEGORIES: Category[] = ['A', 'B', 'C', 'Nope']
const DIVISIONS: Division[] = ['D1', 'D2', 'D3']
const ADMITS: AdmitLikelihood[] = ['Likely', 'Target', 'Reach', 'Far Reach']
const OWNERS: ActionOwner[] = ['Finn', 'Randy']

const DEFAULT_FILTERS: PipelineFilters = { status: '', category: '', division: '', admit: '', owner: '', search: '' }

interface Props {
  schools: School[]
  onSelectSchool: (s: School) => void
  onUpdateSchool: (id: string, updates: Partial<School>) => Promise<unknown>
}

export default function PipelineTable({ schools, onSelectSchool, onUpdateSchool }: Props) {
  const [filters, setFilters] = useState<PipelineFilters>(DEFAULT_FILTERS)
  const today = todayStr()

  const filtered = useMemo(() => schools.filter(s => {
    if (filters.status && s.status !== filters.status) return false
    if (filters.category && s.category !== filters.category) return false
    if (filters.division && s.division !== filters.division) return false
    if (filters.admit && s.admit_likelihood !== filters.admit) return false
    if (filters.owner && s.next_action_owner !== filters.owner) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (!s.name.toLowerCase().includes(q) && !(s.short_name ?? '').toLowerCase().includes(q)) return false
    }
    return true
  }), [schools, filters])

  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <input
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          placeholder="Search schools..."
          style={inputStyle}
        />
        <FilterSelect label="Status"   value={filters.status}   onChange={v => setFilters(f => ({ ...f, status: v as Status | '' }))}   options={STATUSES} />
        <FilterSelect label="Tier"     value={filters.category} onChange={v => setFilters(f => ({ ...f, category: v as Category | '' }))} options={CATEGORIES} optionLabel={categoryLabel} />
        <FilterSelect label="Division" value={filters.division} onChange={v => setFilters(f => ({ ...f, division: v as Division | '' }))} options={DIVISIONS} />
        <FilterSelect label="Admit"    value={filters.admit}    onChange={v => setFilters(f => ({ ...f, admit: v as AdmitLikelihood | '' }))} options={ADMITS} />
        <FilterSelect label="Owner"    value={filters.owner}    onChange={v => setFilters(f => ({ ...f, owner: v as ActionOwner | '' }))}   options={OWNERS} />
        {hasFilters && (
          <button onClick={() => setFilters(DEFAULT_FILTERS)} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Clear</button>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>{filtered.length} of {schools.length} schools</div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                {['School', 'Div', 'Status', 'Admit', 'Tier', 'Last Contact', 'Next Action', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const overdue = !!(s.next_action_due && s.next_action_due < today)
                const sc = STATUS_COLORS[s.status] || STATUS_COLORS['Not Contacted']
                const ac = s.admit_likelihood ? ADMIT_COLORS[s.admit_likelihood] : '#94a3b8'
                const cc = CATEGORY_COLORS[s.category]
                return (
                  <tr
                    key={s.id}
                    onClick={() => onSelectSchool(s)}
                    style={{ borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                      <div>{s.short_name || s.name}</div>
                      {s.location && <div style={{ fontWeight: 400, color: '#94a3b8', fontSize: 11 }}>{s.location}</div>}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>{s.division}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {/* Inline status dropdown — stops propagation so row click still opens modal */}
                      <select
                        value={s.status}
                        onClick={e => e.stopPropagation()}
                        onChange={e => { e.stopPropagation(); onUpdateSchool(s.id, { status: e.target.value as Status }) }}
                        style={{ padding: '2px 8px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: sc.bg, color: sc.text, fontFamily: 'inherit', outline: 'none' }}
                      >
                        {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {s.admit_likelihood && (
                        <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: ac + '18', color: ac }}>{s.admit_likelihood}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: cc + '14', color: cc }}>{categoryLabel(s.category)}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {formatDate(s.last_contact)}
                      {s.last_contact && <span style={{ color: '#94a3b8', fontSize: 11 }}> ({daysBetween(s.last_contact)}d)</span>}
                    </td>
                    <td style={{ padding: '10px 12px', maxWidth: 200 }}>
                      {s.next_action && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {overdue && <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#fef2f2', color: '#dc2626' }}>OVERDUE</span>}
                          <span style={{ color: overdue ? '#dc2626' : '#475569', fontSize: 12 }}>{s.next_action}</span>
                        </div>
                      )}
                      {s.next_action_owner && (
                        <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>
                          {s.next_action_owner}{s.next_action_due ? ` · due ${formatDate(s.next_action_due)}` : ''}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <button
                        onClick={e => { e.stopPropagation(); onSelectSchool(s) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, padding: 4 }}
                      >✎</button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>No schools match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
  fontSize: 12.5, fontFamily: 'inherit', width: 160, outline: 'none',
}

function FilterSelect<T extends string>({
  label, value, onChange, options, optionLabel,
}: {
  label: string; value: string; onChange: (v: string) => void; options: T[]; optionLabel?: (v: T) => string
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', background: '#fff', color: '#475569', cursor: 'pointer', outline: 'none' }}
    >
      <option value="">All {label}s</option>
      {options.map(o => <option key={o} value={o}>{optionLabel ? optionLabel(o) : o}</option>)}
    </select>
  )
}

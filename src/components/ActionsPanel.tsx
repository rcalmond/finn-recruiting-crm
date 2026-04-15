'use client'

import type { School, ActionItem } from '@/lib/types'
import { useRef, useState, useMemo } from 'react'
import { STATUS_COLORS, CATEGORY_COLORS, categoryLabel, formatDate, todayStr } from '@/lib/utils'

const CATEGORY_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, Nope: 3 }

interface Props {
  actionItems: ActionItem[]
  schools: School[]
  onSelectSchool: (s: School) => void
  onDeleteItem: (id: string) => Promise<unknown>
  onReorderItems: (orderedIds: string[]) => Promise<void>
}

export default function ActionsPanel({ actionItems, schools, onSelectSchool, onDeleteItem, onReorderItems }: Props) {
  const [sortMode, setSortMode] = useState<'manual' | 'smart'>('manual')
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragIndexRef = useRef<number | null>(null)
  const today = todayStr()

  const items = useMemo(() => {
    const withOverdue = actionItems.map(i => ({ ...i, overdue: !!(i.due_date && i.due_date < today) }))
    if (sortMode === 'smart') {
      return [...withOverdue].sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
        const aDate = a.due_date ?? '9999'
        const bDate = b.due_date ?? '9999'
        if (aDate !== bDate) return aDate.localeCompare(bDate)
        return (CATEGORY_ORDER[a.school?.category ?? 'Nope'] ?? 9) - (CATEGORY_ORDER[b.school?.category ?? 'Nope'] ?? 9)
      })
    }
    // manual: already sorted by sort_order from the hook
    return withOverdue
  }, [actionItems, sortMode, today])

  function handleRowClick(item: ActionItem) {
    const school = schools.find(s => s.id === item.school_id)
    if (school) onSelectSchool(school)
  }

  function handleDone(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    onDeleteItem(id)
  }

  function handleDragStart(e: React.DragEvent, index: number) {
    dragIndexRef.current = index
    e.dataTransfer.effectAllowed = 'move'
    // Minimal ghost: just let the browser use the element itself
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  function handleDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault()
    const fromIndex = dragIndexRef.current
    if (fromIndex === null || fromIndex === dropIndex) {
      dragIndexRef.current = null
      setDragOverIndex(null)
      return
    }
    const reordered = [...items]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(dropIndex, 0, moved)
    onReorderItems(reordered.map(i => i.id))
    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  function handleDragEnd() {
    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  const overdueCount = items.filter(i => i.overdue).length

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sort</span>
        {(['manual', 'smart'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setSortMode(mode)}
            style={{
              padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: sortMode === mode ? 700 : 500, fontFamily: 'inherit',
              background: sortMode === mode ? '#0f172a' : '#f1f5f9',
              color: sortMode === mode ? '#fff' : '#475569',
            }}
          >
            {mode === 'manual' ? 'Manual' : 'Smart (due + tier)'}
          </button>
        ))}
        {sortMode === 'manual' && (
          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 2 }}>Drag to reorder</span>
        )}
        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>
          {items.length} items
          {overdueCount > 0 && (
            <span style={{ color: '#dc2626', fontWeight: 600 }}> · {overdueCount} overdue</span>
          )}
        </span>
      </div>

      {items.length === 0 && (
        <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb' }}>
          No action items. Nice work!
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item, index) => {
          const school = item.school
          const status = schools.find(s => s.id === item.school_id)?.status
          const sc = status ? STATUS_COLORS[status] : STATUS_COLORS['Not Contacted']
          const cat = school?.category ?? 'C'
          const cc = CATEGORY_COLORS[cat]
          const isDragTarget = dragOverIndex === index && dragIndexRef.current !== null && dragIndexRef.current !== index

          return (
            <div
              key={item.id}
              draggable={sortMode === 'manual'}
              onDragStart={sortMode === 'manual' ? e => handleDragStart(e, index) : undefined}
              onDragOver={sortMode === 'manual' ? e => handleDragOver(e, index) : undefined}
              onDrop={sortMode === 'manual' ? e => handleDrop(e, index) : undefined}
              onDragEnd={sortMode === 'manual' ? handleDragEnd : undefined}
              onClick={() => handleRowClick(item)}
              style={{
                background: '#fff',
                borderRadius: 8,
                border: `1px solid ${isDragTarget ? '#6366f1' : item.overdue ? '#fecaca' : '#e5e7eb'}`,
                borderTop: isDragTarget ? '3px solid #6366f1' : undefined,
                padding: '12px 16px',
                cursor: sortMode === 'manual' ? 'grab' : 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                opacity: dragIndexRef.current === index ? 0.5 : 1,
                transition: 'border-color 0.1s, opacity 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              {sortMode === 'manual' && (
                <div style={{ color: '#cbd5e1', fontSize: 14, flexShrink: 0, userSelect: 'none', lineHeight: 1 }}>⠿</div>
              )}
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

'use client'

import { useState, useEffect } from 'react'
import type { ActionItem } from '@/lib/types'

// Default colors matching the Liverpool design system
const COLORS = {
  ink:     '#3A3530',
  inkLo:   '#7A7570',
  inkMute: '#A8A39B',
  line:    '#E2DBC9',
  red:     '#C8102E',
}

interface Props {
  item: ActionItem
  today: string
  onComplete: (id: string) => Promise<void>
  onUpdate: (id: string, updates: { action?: string; due_date?: string | null }) => Promise<void>
  /** Format a date string for display. Defaults to short month + day. */
  formatDate?: (date: string) => string
}

function defaultFormatDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
}

export default function EditableActionRow({
  item, today, onComplete, onUpdate,
  formatDate = defaultFormatDate,
}: Props) {
  const isOverdue = !!(item.due_date && item.due_date < today)
  const [editingAction, setEditingAction] = useState(false)
  const [actionText, setActionText] = useState(item.action)
  const [editingDate, setEditingDate] = useState(false)

  // Sync local text if item.action changes externally (realtime)
  useEffect(() => { setActionText(item.action) }, [item.action])

  async function saveAction() {
    const trimmed = actionText.trim()
    if (!trimmed || trimmed === item.action) {
      setActionText(item.action)
      setEditingAction(false)
      return
    }
    setEditingAction(false)
    await onUpdate(item.id, { action: trimmed })
  }

  async function saveDate(newDate: string) {
    setEditingDate(false)
    if (newDate === (item.due_date ?? '')) return
    await onUpdate(item.id, { due_date: newDate || null })
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <input
        type="checkbox"
        onChange={() => onComplete(item.id)}
        style={{
          marginTop: 2, width: 14, height: 14,
          cursor: 'pointer', flexShrink: 0,
          accentColor: COLORS.red,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Description — click to edit */}
        {editingAction ? (
          <input
            type="text"
            value={actionText}
            onChange={e => setActionText(e.target.value)}
            onBlur={saveAction}
            onKeyDown={e => {
              if (e.key === 'Enter') saveAction()
              if (e.key === 'Escape') { setActionText(item.action); setEditingAction(false) }
            }}
            autoFocus
            onFocus={e => e.target.select()}
            style={{
              width: '100%', padding: '1px 4px', margin: '-2px -4px',
              fontSize: 12, fontWeight: 600, color: COLORS.ink,
              border: `1px solid ${COLORS.line}`, borderRadius: 4,
              fontFamily: 'inherit', outline: 'none', lineHeight: 1.4,
              background: '#fff',
            }}
          />
        ) : (
          <div
            onClick={() => setEditingAction(true)}
            style={{
              fontSize: 12, color: COLORS.ink,
              fontWeight: 600, lineHeight: 1.4,
              cursor: 'text', borderRadius: 3,
              padding: '1px 4px', margin: '-2px -4px',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.03)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >{item.action}</div>
        )}

        {/* Due date + owner row — date is editable */}
        <div style={{
          marginTop: 2, fontSize: 10, fontWeight: 600,
          color: isOverdue ? COLORS.red : COLORS.inkLo,
          display: 'flex', alignItems: 'center', gap: 0,
        }}>
          {isOverdue && <span>Overdue · </span>}
          {editingDate ? (
            <input
              type="date"
              defaultValue={item.due_date ?? ''}
              onChange={e => saveDate(e.target.value)}
              onBlur={() => setEditingDate(false)}
              onKeyDown={e => { if (e.key === 'Escape') setEditingDate(false) }}
              autoFocus
              style={{
                fontSize: 10, fontWeight: 600, fontFamily: 'inherit',
                border: `1px solid ${COLORS.line}`, borderRadius: 3,
                padding: '0 3px', color: 'inherit', background: '#fff',
                outline: 'none',
              }}
            />
          ) : item.due_date ? (
            <span
              onClick={() => setEditingDate(true)}
              style={{ cursor: 'pointer', borderRadius: 3, padding: '0 2px', margin: '0 -2px' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.05)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >{formatDate(item.due_date)}</span>
          ) : (
            <span
              onClick={() => setEditingDate(true)}
              style={{ cursor: 'pointer', color: COLORS.inkMute, fontStyle: 'italic' }}
            >add date</span>
          )}
          {item.owner ? <span> · {item.owner}</span> : null}
        </div>
      </div>
    </div>
  )
}

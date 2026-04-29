'use client'

import { useRouter } from 'next/navigation'
import type { TacticalItem } from '@/lib/today-scoring'

const LV = {
  paper: '#F6F1E8',
  paperDeep: '#EFE8D8',
  ink: '#0E0E0E',
  inkMid: '#4A4A4A',
  inkLo: '#7A7570',
  inkMute: '#A8A39B',
  line: '#E2DBC9',
  teal: '#00B2A9',
  tealDeep: '#006A65',
  tealSoft: '#D7F0ED',
  red: '#C8102E',
  gold: '#B8860B',
  goldSoft: '#FDF6E3',
}

const TIER_STYLE: Record<string, { bg: string; color: string }> = {
  A: { bg: '#FEE2E2', color: '#991B1B' },
  B: { bg: '#DBEAFE', color: '#1E40AF' },
  C: { bg: '#F3F4F6', color: '#374151' },
}

const CHANNEL_STYLE: Record<string, { bg: string; color: string }> = {
  'Email':           { bg: LV.tealSoft,  color: LV.tealDeep },
  'Sports Recruits': { bg: LV.paperDeep, color: LV.inkMid   },
}

interface Props {
  items: TacticalItem[]
  onDraftReply: (schoolId: string, coachName: string | null, entryId: string, channel: string) => void
  onDraftFresh: (schoolId: string) => void
  onComplete: (actionItemId: string) => Promise<void>
  onSnooze: (entryId: string) => Promise<void>
  onDismiss: (entryId: string) => Promise<void>
}

export default function TacticalSection({
  items, onDraftReply, onDraftFresh, onComplete, onSnooze, onDismiss,
}: Props) {
  const router = useRouter()

  if (items.length === 0) {
    return (
      <section style={{
        margin: 'clamp(32px, 5vw, 52px) clamp(16px, 5vw, 56px) 0',
        background: LV.tealSoft,
        borderRadius: 18,
        padding: 'clamp(40px, 6vw, 64px) clamp(24px, 4vw, 40px)',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 700,
          color: LV.tealDeep, letterSpacing: '-0.03em',
          marginBottom: 8,
        }}>Caught up.</div>
        <div style={{
          fontSize: 14, color: LV.inkLo,
        }}>Nothing pressing right now.</div>
      </section>
    )
  }

  return (
    <section style={{
      margin: 'clamp(32px, 5vw, 52px) clamp(16px, 5vw, 56px) 0',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 14,
        marginBottom: 'clamp(16px, 2vw, 24px)',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '0.15em',
          textTransform: 'uppercase', color: LV.inkLo,
          padding: '4px 0', borderTop: `2px solid ${LV.inkLo}`,
        }}>Today</div>
        <div style={{
          fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 700,
          letterSpacing: '-0.03em', color: LV.ink, fontStyle: 'italic',
        }}>Your top {items.length}.</div>
      </div>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item, i) => (
          <TacticalCard
            key={item.entry?.id ?? item.actionItem?.id ?? i}
            item={item}
            rank={i + 1}
            onDraftReply={onDraftReply}
            onDraftFresh={onDraftFresh}
            onComplete={onComplete}
            onSnooze={onSnooze}
            onDismiss={onDismiss}
            onNavigate={(schoolId) => router.push(`/schools/${schoolId}`)}
          />
        ))}
      </div>
    </section>
  )
}

function TacticalCard({
  item, rank, onDraftReply, onDraftFresh, onComplete, onSnooze, onDismiss, onNavigate,
}: {
  item: TacticalItem
  rank: number
  onDraftReply: Props['onDraftReply']
  onDraftFresh: Props['onDraftFresh']
  onComplete: Props['onComplete']
  onSnooze: Props['onSnooze']
  onDismiss: Props['onDismiss']
  onNavigate: (schoolId: string) => void
}) {
  const isInbound = item.type === 'inbound_awaiting'
  const isCold = item.type === 'going_cold'
  const isAction = item.type === 'action_item'

  const borderColor = isCold ? LV.gold : isInbound ? LV.teal : LV.line
  const bgColor = isCold ? LV.goldSoft : isInbound ? LV.tealSoft : '#fff'

  const tierStyle = TIER_STYLE[item.school.category] ?? TIER_STYLE.C
  const schoolName = item.school.short_name || item.school.name

  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${borderColor}44`,
      borderLeft: `4px solid ${borderColor}`,
      borderRadius: '0 14px 14px 0',
      padding: 'clamp(14px, 2vw, 20px) clamp(16px, 2.5vw, 24px)',
      display: 'flex', gap: 14, alignItems: 'flex-start',
    }}>
      {/* Rank */}
      <div style={{
        fontSize: 20, fontWeight: 700, color: borderColor,
        fontStyle: 'italic', lineHeight: 1, flexShrink: 0,
        width: 24, textAlign: 'center', paddingTop: 2,
        opacity: 0.6,
      }}>{rank}</div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top line: school + tier + type label */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          marginBottom: 6,
        }}>
          <span
            onClick={() => onNavigate(item.school.id)}
            style={{
              fontSize: 14, fontWeight: 700, color: LV.ink,
              cursor: 'pointer', letterSpacing: '-0.01em',
            }}
          >{schoolName}</span>
          <span style={{
            ...tierStyle, fontSize: 9, fontWeight: 800,
            padding: '2px 6px', borderRadius: 4,
          }}>{item.school.category}</span>
          {(isInbound || isCold) && item.entry && (
            <>
              {item.coachName && (
                <span style={{ fontSize: 12, color: LV.inkMid }}>· {item.coachName}</span>
              )}
              <span style={{
                ...CHANNEL_STYLE[item.entry.channel] ?? { bg: LV.paperDeep, color: LV.inkMid },
                display: 'inline-block', padding: '2px 7px', borderRadius: 999,
                fontSize: 9, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase',
                background: (CHANNEL_STYLE[item.entry.channel] ?? { bg: LV.paperDeep }).bg,
                color: (CHANNEL_STYLE[item.entry.channel] ?? { color: LV.inkMid }).color,
              }}>{item.entry.channel}</span>
            </>
          )}
          {isCold && item.daysWaiting !== undefined && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: LV.gold,
            }}>{item.daysWaiting}d silent</span>
          )}
          {isInbound && item.daysWaiting !== undefined && (
            <span style={{
              fontSize: 11, fontWeight: 600, color: LV.tealDeep,
            }}>{item.daysWaiting}d waiting</span>
          )}
        </div>

        {/* Summary / action text */}
        {(isInbound || isCold) && item.entry?.summary && (
          <div style={{
            fontSize: 12, color: LV.inkMid, lineHeight: 1.5,
            marginBottom: 10,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {item.entry.summary.replace(/\n+/g, ' ').trim()}
          </div>
        )}
        {isAction && item.actionItem && (
          <div style={{
            fontSize: 12, color: LV.inkMid, lineHeight: 1.5,
            marginBottom: 10,
          }}>
            {item.actionItem.action}
            {item.actionItem.due_date && (
              <span style={{
                marginLeft: 8, fontSize: 10, fontWeight: 600,
                color: item.actionItem.due_date < new Date().toISOString().split('T')[0] ? LV.red : LV.inkLo,
              }}>
                {item.actionItem.due_date < new Date().toISOString().split('T')[0] ? 'Overdue · ' : ''}
                {new Date(item.actionItem.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {item.actionItem.owner ? ` · ${item.actionItem.owner}` : ''}
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {isInbound && item.entry && (
            <>
              <button
                onClick={() => onDraftReply(item.school.id, item.coachName ?? null, item.entry!.id, item.entry!.channel)}
                style={{
                  padding: '6px 14px', background: LV.tealDeep, color: '#fff',
                  border: 'none', borderRadius: 999, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >Draft reply</button>
              <button onClick={() => onSnooze(item.entry!.id)} style={secondaryBtn}>Snooze 7d</button>
              <button onClick={() => onDismiss(item.entry!.id)} style={secondaryBtn}>Dismiss</button>
            </>
          )}
          {isCold && item.entry && (
            <>
              <button
                onClick={() => onNavigate(item.school.id)}
                style={{
                  padding: '6px 14px', background: LV.ink, color: '#fff',
                  border: 'none', borderRadius: 999, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >Open school</button>
              <button onClick={() => onSnooze(item.entry!.id)} style={secondaryBtn}>Snooze 7d</button>
              <button onClick={() => onDismiss(item.entry!.id)} style={secondaryBtn}>Dismiss</button>
            </>
          )}
          {isAction && item.actionItem && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 600, color: LV.tealDeep,
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                onChange={() => onComplete(item.actionItem!.id)}
                style={{ width: 14, height: 14, accentColor: LV.tealDeep, cursor: 'pointer' }}
              />
              Mark complete
            </label>
          )}
        </div>
      </div>
    </div>
  )
}

const secondaryBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 11, fontWeight: 600, color: LV.inkLo,
  fontFamily: 'inherit', padding: 0, letterSpacing: -0.1,
}

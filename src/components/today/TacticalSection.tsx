'use client'

import { useRouter } from 'next/navigation'
import type { TacticalItem } from '@/lib/today-scoring'

const LV = {
  paper:    '#F6F1E8',
  paperDeep:'#EFE8D8',
  ink:      '#0E0E0E',
  inkMid:   '#4A4A4A',
  inkLo:    '#7A7570',
  inkMute:  '#A8A39B',
  line:     '#E2DBC9',
  line2:    '#D3CAB3',
  red:      '#C8102E',
  redInk:   '#FFE4E8',
}

const TIER_STYLE: Record<string, { bg: string; color: string }> = {
  A: { bg: '#FEE2E2', color: '#991B1B' },
  B: { bg: '#DBEAFE', color: '#1E40AF' },
  C: { bg: '#F3F4F6', color: '#374151' },
}

const TIER_STYLE_ACCENT: Record<string, { bg: string; color: string }> = {
  A: { bg: 'rgba(255,255,255,0.18)', color: '#fff' },
  B: { bg: 'rgba(255,255,255,0.18)', color: '#fff' },
  C: { bg: 'rgba(255,255,255,0.18)', color: '#fff' },
}

interface Props {
  items: TacticalItem[]
  onDraftReply: (schoolId: string, coachName: string | null, entryId: string, channel: string) => void
  onDraftFresh: (schoolId: string) => void
  onComplete: (actionItemId: string) => Promise<void>
  onSnooze: (entryId: string) => Promise<void>
  onDone: (entryId: string) => Promise<void>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getHeroText(item: TacticalItem): string {
  if (item.type === 'inbound_awaiting' && item.coachName) return `Reply to ${item.coachName}.`
  if (item.type === 'going_cold' && item.coachName) return `Re-engage ${item.coachName}.`
  if (item.type === 'action_item' && item.actionItem) return `${item.actionItem.action}.`
  // Fallback to school name
  const name = item.school.short_name || item.school.name
  if (item.type === 'inbound_awaiting') return `Reply to ${name}.`
  if (item.type === 'going_cold') return `Re-engage ${name}.`
  return name
}

function getContext(item: TacticalItem): string {
  if ((item.type === 'inbound_awaiting' || item.type === 'going_cold') && item.daysWaiting !== undefined) {
    return item.type === 'going_cold' ? `${item.daysWaiting}d silent` : `${item.daysWaiting}d waiting`
  }
  if (item.type === 'action_item' && item.actionItem?.due_date) {
    const today = new Date().toISOString().split('T')[0]
    if (item.actionItem.due_date < today) return 'overdue'
    return `due ${new Date(item.actionItem.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  }
  return ''
}

function getPreview(item: TacticalItem): string | null {
  if (item.entry?.summary) return item.entry.summary.replace(/\n+/g, ' ').trim()
  if (item.type === 'action_item' && item.actionItem) {
    // Show due date + owner as preview for action items
    const parts: string[] = []
    if (item.actionItem.due_date) {
      parts.push(new Date(item.actionItem.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
    }
    if (item.actionItem.owner) parts.push(item.actionItem.owner)
    return parts.length > 0 ? parts.join(' · ') : null
  }
  return null
}

function getCta(item: TacticalItem): string {
  if (item.type === 'inbound_awaiting') return 'Draft reply'
  if (item.type === 'going_cold') return 'Open school'
  return 'Mark complete'
}

// ── Chevron SVG ──────────────────────────────────────────────────────────────

function ChevronRight({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14m-5-6l6 6-6 6" stroke="currentColor" strokeWidth="2.6"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Tier badge ───────────────────────────────────────────────────────────────

function TierBadge({ tier, onAccent }: { tier: string; onAccent?: boolean }) {
  const t = (onAccent ? TIER_STYLE_ACCENT : TIER_STYLE)[tier] ?? TIER_STYLE.C
  return (
    <span style={{
      background: t.bg, color: t.color,
      fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
      padding: '2px 7px', borderRadius: 4,
      lineHeight: 1.4,
    }}>{tier}</span>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function TacticalSection({
  items, onDraftReply, onDraftFresh, onComplete, onSnooze, onDone,
}: Props) {
  const router = useRouter()

  return (
    <section style={{
      margin: 'clamp(24px, 3vw, 36px) clamp(28px, 4vw, 56px) 0',
    }}>
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 14,
        marginBottom: 16,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: LV.inkLo,
          padding: '4px 0', borderTop: `2px solid ${LV.inkLo}`,
        }}>Today</div>
        <div style={{
          fontSize: 24, fontWeight: 700,
          letterSpacing: '-0.03em', color: LV.ink, fontStyle: 'italic',
        }}>Your top {items.length || 3}.</div>
      </div>

      {items.length === 0 ? (
        <CaughtUpPanel onScanPipeline={() => {
          // Scroll to pipeline rail
          const el = document.getElementById('pipeline-rail')
          if (el) el.scrollIntoView({ behavior: 'smooth' })
        }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map((item, i) => (
            <TacticalCard
              key={item.entry?.id ?? item.actionItem?.id ?? i}
              item={item}
              rank={i + 1}
              hero={i === 0}
              onDraftReply={onDraftReply}
              onDraftFresh={onDraftFresh}
              onComplete={onComplete}
              onSnooze={onSnooze}
              onDone={onDone}
              onNavigate={(schoolId) => router.push(`/schools/${schoolId}`)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// ── Caught-up panel ──────────────────────────────────────────────────────────

function CaughtUpPanel({ onScanPipeline }: { onScanPipeline: () => void }) {
  return (
    <div style={{
      background: LV.ink, color: '#fff',
      borderRadius: 16, padding: '40px 32px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Watermark 0 */}
      <div style={{
        position: 'absolute', right: -20, bottom: -50,
        fontSize: 280, fontWeight: 800, fontStyle: 'italic',
        letterSpacing: '-0.06em', lineHeight: 1,
        color: 'rgba(255,255,255,0.06)',
        pointerEvents: 'none', userSelect: 'none',
      }}>0</div>

      <div style={{ position: 'relative' }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: 0.24,
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)',
        }}>Priority</div>

        <div style={{
          fontSize: 'clamp(40px, 4.4vw, 56px)', fontWeight: 700,
          fontStyle: 'italic', letterSpacing: '-0.035em',
          color: '#fff', lineHeight: 0.98, marginTop: 12, marginBottom: 12,
          display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap',
        }}>
          Caught up.
          <span style={{
            fontSize: 14, fontStyle: 'normal', fontWeight: 700,
            color: LV.red, letterSpacing: 0,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6.25" stroke={LV.red} strokeWidth="1.6" />
              <path d="M4 7.4L6.2 9.4L10 5.2" stroke={LV.red}
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            All clear
          </span>
        </div>

        <div style={{
          fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.55,
          maxWidth: 520, marginBottom: 22,
        }}>
          Nothing pressing right now. Strategic prompts and pipeline
          activity are still worth a look below.
        </div>

        <button
          onClick={onScanPipeline}
          style={{
            padding: '10px 20px', background: '#fff', color: LV.ink,
            border: 'none', borderRadius: 999,
            fontSize: 12, fontWeight: 800, cursor: 'pointer',
            fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          Scan pipeline
          <ChevronRight />
        </button>
      </div>
    </div>
  )
}

// ── Tactical card ────────────────────────────────────────────────────────────

function TacticalCard({
  item, rank, hero, onDraftReply, onDraftFresh, onComplete, onSnooze, onDone, onNavigate,
}: {
  item: TacticalItem
  rank: number
  hero: boolean
  onDraftReply: Props['onDraftReply']
  onDraftFresh: Props['onDraftFresh']
  onComplete: Props['onComplete']
  onSnooze: Props['onSnooze']
  onDone: Props['onDone']
  onNavigate: (schoolId: string) => void
}) {
  const isInbound = item.type === 'inbound_awaiting'
  const isCold = item.type === 'going_cold'
  const isAction = item.type === 'action_item'

  const onAccent = hero
  const softInk = onAccent ? LV.redInk : LV.inkLo
  const midInk = onAccent ? 'rgba(255,255,255,0.86)' : LV.inkMid
  const titleInk = onAccent ? '#fff' : LV.ink

  const schoolName = item.school.short_name || item.school.name
  const heroText = getHeroText(item)
  const context = getContext(item)
  const preview = getPreview(item)
  const cta = getCta(item)

  function handlePrimary() {
    if (isInbound && item.entry) {
      onDraftReply(item.school.id, item.coachName ?? null, item.entry.id, item.entry.channel)
    } else if (isCold) {
      onNavigate(item.school.id)
    } else if (isAction && item.actionItem) {
      onComplete(item.actionItem.id)
    }
  }

  function handleDone() {
    if (item.entry) onDone(item.entry.id)
  }

  function handleSnooze() {
    if (item.entry) onSnooze(item.entry.id)
  }

  const hasDoneSnooze = !!item.entry

  // ── Rank label row ──────────────────────────────────────────────────────
  const RankLabel = (
    <div style={{
      fontSize: 10, fontWeight: 800, letterSpacing: 0.24,
      textTransform: 'uppercase', color: softInk,
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      marginBottom: hero ? 6 : 10,
    }}>
      {hero && <span style={{ opacity: 0.85 }}>Priority</span>}
      <span style={{ fontStyle: 'italic', fontSize: hero ? 12 : 11 }}>
        {'\u2116'} {rank}
      </span>
      {context && (
        <>
          <span style={{ opacity: 0.55 }}>·</span>
          <span style={{ fontWeight: 700, color: softInk }}>{context}</span>
        </>
      )}
    </div>
  )

  // ── Top meta row ────────────────────────────────────────────────────────
  const TopMeta = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      fontSize: 12, color: midInk,
    }}>
      <span style={{
        fontWeight: 700, color: titleInk, letterSpacing: '-0.01em',
      }}>{schoolName}</span>
      <TierBadge tier={item.school.category} onAccent={onAccent} />
      {item.coachName && (
        <>
          <span style={{ opacity: 0.55 }}>·</span>
          <span>{item.coachName}</span>
        </>
      )}
    </div>
  )

  // ── Hero text ───────────────────────────────────────────────────────────
  const HeroText = (
    <div style={{
      fontSize: hero ? 'clamp(26px, 2.4vw, 32px)' : 'clamp(20px, 1.9vw, 26px)',
      fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05,
      fontStyle: 'italic', color: titleInk,
      marginTop: hero ? 12 : 8,
      marginBottom: hero ? 12 : 10,
      textWrap: 'balance' as React.CSSProperties['textWrap'],
    }}>{heroText}</div>
  )

  // ── Preview ─────────────────────────────────────────────────────────────
  const Preview = preview ? (
    <div style={{
      fontSize: hero ? 14 : 13,
      lineHeight: 1.55, color: midInk,
      marginBottom: hero ? 22 : 14,
      maxWidth: hero ? 640 : 540,
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
    }}>{preview}</div>
  ) : <div style={{ marginBottom: hero ? 22 : 14 }} />

  // ── Primary CTA ─────────────────────────────────────────────────────────
  const PrimaryBtn = (
    <button
      onClick={handlePrimary}
      style={{
        padding: hero ? '9px 18px' : '8px 16px',
        background: onAccent ? '#fff' : LV.red,
        color: onAccent ? LV.red : '#fff',
        border: 'none', borderRadius: 999,
        fontSize: 12, fontWeight: 800, letterSpacing: -0.1,
        cursor: 'pointer', fontFamily: 'inherit',
        display: 'inline-flex', alignItems: 'center', gap: 8,
      }}
    >
      {cta}
      <ChevronRight />
    </button>
  )

  // ── Ghost buttons ───────────────────────────────────────────────────────
  const ghostStyle: React.CSSProperties = {
    background: 'transparent', border: 'none', cursor: 'pointer',
    padding: 0, fontFamily: 'inherit', letterSpacing: -0.1,
    fontSize: hero ? 12 : 11, fontWeight: 700,
    color: softInk,
  }

  // ── Hero card (rank 1) ─────────────────────────────────────────────────
  if (hero) {
    return (
      <div style={{
        position: 'relative',
        background: LV.red,
        borderRadius: 16,
        padding: '26px 30px',
        overflow: 'hidden',
      }}>
        {/* Watermark numeral */}
        <div style={{
          position: 'absolute', right: 28, top: 8,
          fontSize: 180, fontWeight: 800, fontStyle: 'italic',
          letterSpacing: '-0.06em', lineHeight: 1,
          color: 'rgba(255,255,255,0.10)',
          pointerEvents: 'none', userSelect: 'none',
        }}>{rank}</div>

        <div style={{ position: 'relative', zIndex: 1, paddingRight: 80 }}>
          {RankLabel}
          {TopMeta}
          {HeroText}
          {Preview}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 18,
            flexWrap: 'wrap',
          }}>
            {PrimaryBtn}
            {hasDoneSnooze && (
              <>
                <span style={{
                  display: 'inline-block', width: 1, height: 14,
                  background: 'rgba(255,255,255,0.25)',
                }} />
                <button onClick={handleDone} style={ghostStyle}>Done</button>
                <button onClick={handleSnooze} style={ghostStyle}>Snooze 7d</button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Compact card (ranks 2, 3) ──────────────────────────────────────────
  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${LV.line}`,
      borderRadius: 16,
      padding: '22px 26px',
      display: 'flex',
      gap: 'clamp(12px, 2vw, 22px)',
      alignItems: 'flex-start',
    }}>
      {/* Left rail numeral */}
      <div style={{
        fontStyle: 'italic', fontWeight: 800,
        letterSpacing: '-0.06em', lineHeight: 0.85,
        color: LV.red,
        flexShrink: 0,
        fontSize: 'clamp(40px, 8vw, 64px)',
        width: 'clamp(36px, 7vw, 56px)',
        textAlign: 'center',
        paddingTop: 2,
        opacity: 0.85,
      }}>{rank}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {RankLabel}
        {TopMeta}
        {HeroText}
        {Preview}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          flexWrap: 'wrap',
        }}>
          {PrimaryBtn}
          {hasDoneSnooze && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              flex: '0 0 auto',
            }}>
              <span style={{
                display: 'inline-block', width: 1, height: 14,
                background: LV.line2,
              }} />
              <button onClick={handleDone} style={ghostStyle}>Done</button>
              <button onClick={handleSnooze} style={ghostStyle}>Snooze 7d</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

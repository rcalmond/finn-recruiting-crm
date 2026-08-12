'use client'

import { useMemo, useState } from 'react'
import { useSchools } from '@/hooks/useRealtimeData'
import type { School, Category } from '@/lib/types'
import {
  rqBucket, rqAgeDays, summarizeRq, rqSearchUrl,
  rqMarkCompletedPatch, rqMarkUpdatedPatch, rqSetDatePatch, rqSetLinkPatch,
} from '@/lib/rq'

// Brand chrome (Throughball, Brand Sweep Pass 4D). The old petrol accent is
// repointed at the shared --tb-pitch; softer ink. TIER_STYLE + the staleness
// banding are DATA and stay.
const PETROL = { accent: '#1F6B48', soft: '#E3EFE9', deep: '#1F6B48' }
const C = {
  paper: '#F6F1E8', white: '#fff', ink: '#1A1A1A', inkMid: '#4A4A4A',
  inkLo: '#6B655A', inkMute: '#8A8478', line: '#E2DBC9', pitch: '#1F6B48',
  rust: '#B5502F', amber: '#D4A017', green: '#2D6A4F',
}

const TIER_STYLE: Record<Category, { bg: string; color: string }> = {
  A: { bg: '#FEE2E2', color: '#991B1B' },
  B: { bg: '#DBEAFE', color: '#1E40AF' },
  C: { bg: '#F3F4F6', color: '#374151' },
  Nope: { bg: '#E5E7EB', color: '#6B7280' },
}

const TIER_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, Nope: 3 }

function byTierThenName(a: School, b: School): number {
  return (TIER_ORDER[a.category] ?? 9) - (TIER_ORDER[b.category] ?? 9)
    || a.name.localeCompare(b.name)
}

function ageLabel(days: number): string {
  if (days < 365) return `${Math.round(days / 30)} months ago`
  const y = days / 365
  return y < 1.5 ? 'over a year ago' : `${Math.round(y)} years ago`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function QuestionnairesClient() {
  const { schools, loading, updateSchool } = useSchools()

  const active = useMemo(
    () => schools.filter(s => s.category !== 'Nope' && s.status !== 'Inactive').sort(byTierThenName),
    [schools],
  )

  const notStarted = useMemo(() => active.filter(s => rqBucket(s) === 'not_started'), [active])
  const needsUpdate = useMemo(() => active.filter(s => rqBucket(s) === 'needs_update'), [active])
  const current = useMemo(() => active.filter(s => rqBucket(s) === 'current'), [active])
  const summary = useMemo(() => summarizeRq(active), [active])

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 820, margin: '0 auto' }}>
        <div style={{ fontSize: 13, color: C.inkLo }}>Loading your questionnaires…</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.paper, fontFamily: "'Inter', -apple-system, sans-serif", paddingBottom: 80 }}>
      {/* Masthead */}
      <div style={{ padding: '24px clamp(28px, 4vw, 56px) 4px', maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(44px, 6vw, 68px)', fontWeight: 700, letterSpacing: '-0.04em', color: C.ink, lineHeight: 0.95, fontStyle: 'italic' }}>
          Questionnaires<span style={{ color: C.pitch }}>.</span>
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: 15, color: C.inkLo, fontWeight: 450, letterSpacing: '-0.01em', maxWidth: 560, lineHeight: 1.5 }}>
          Every program&apos;s first filter — free to complete, noticed when missing.
        </p>
        {/* Count summary from live data */}
        <p style={{ margin: '10px 0 0', fontSize: 13, fontWeight: 600, color: PETROL.accent, letterSpacing: '-0.01em' }}>
          {summary.current} current
          <span style={{ color: C.inkMute, fontWeight: 500 }}> · </span>
          {summary.needsUpdate} need an update
          <span style={{ color: C.inkMute, fontWeight: 500 }}> · </span>
          {summary.notStarted} not started
        </p>
      </div>

      {/* Content */}
      <div style={{ padding: '20px clamp(28px, 4vw, 56px)', maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* ── Not started (only when non-empty — empty is the goal) ── */}
        {notStarted.length > 0 && (
          <section>
            <SectionHeader title="Not started." count={notStarted.length} />
            <RowList>
              {notStarted.map(s => (
                <RqRow key={s.id} school={s} variant="not_started" updateSchool={updateSchool} />
              ))}
            </RowList>
          </section>
        )}

        {/* ── Needs an update (only when non-empty) ── */}
        {needsUpdate.length > 0 && (
          <section>
            <SectionHeader title="Needs an update." count={needsUpdate.length} />
            <RowList>
              {needsUpdate.map(s => (
                <RqRow key={s.id} school={s} variant="needs_update" updateSchool={updateSchool} />
              ))}
            </RowList>
          </section>
        )}

        {/* ── Current (the resting state — always rendered) ── */}
        <section>
          <SectionHeader title="Current." count={current.length} />
          {current.length > 0 ? (
            <RowList>
              {current.map(s => (
                <RqRow key={s.id} school={s} variant="current" updateSchool={updateSchool} />
              ))}
            </RowList>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: C.inkLo, fontStyle: 'italic' }}>
              No questionnaires are current yet — start with the ones above.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

// ─── Section header ──────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <h2 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 'clamp(16px, 2.2vw, 20px)', fontWeight: 700, letterSpacing: '-0.02em', color: C.ink, fontStyle: 'italic' }}>
      <span>{title.replace(/\.$/, '')}<span style={{ color: C.pitch }}>.</span></span>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.inkLo, fontStyle: 'normal' }}>{count}</span>
    </h2>
  )
}

function RowList({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
}

// ─── Row ─────────────────────────────────────────────────────────────────────

type RqVariant = 'not_started' | 'needs_update' | 'current'

function RqRow({
  school, variant, updateSchool,
}: {
  school: School
  variant: RqVariant
  updateSchool: (id: string, updates: Partial<School>) => Promise<unknown>
  }) {
  const [editingLink, setEditingLink] = useState(false)
  const [linkText, setLinkText] = useState(school.rq_link ?? '')
  const [settingDate, setSettingDate] = useState(false)
  const tier = TIER_STYLE[school.category] ?? TIER_STYLE.C
  const age = rqAgeDays(school)

  const saveLink = async () => {
    await updateSchool(school.id, rqSetLinkPatch(linkText))
    setEditingLink(false)
  }

  // Sub-line copy per variant.
  let subline: React.ReactNode = null
  if (variant === 'needs_update') {
    subline = age === null
      ? <span style={{ color: C.rust }}>Completed — date unknown</span>
      : <span style={{ color: C.rust }}>Updated {ageLabel(age)}</span>
  } else if (variant === 'current' && school.rq_updated_at) {
    subline = <span style={{ color: C.inkLo }}>Completed {fmtDate(school.rq_updated_at)}</span>
  }

  return (
    <div style={{
      background: C.white, border: `1px solid ${C.line}`, borderRadius: 10,
      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      {/* Tier chip */}
      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, letterSpacing: '0.02em', color: tier.color, background: tier.bg, borderRadius: 6, padding: '2px 7px' }}>
        {school.category}
      </span>

      {/* School + division + subline */}
      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontStyle: 'italic', letterSpacing: '-0.01em' }}>
          {school.short_name || school.name}
        </div>
        <div style={{ fontSize: 11.5, color: C.inkLo, marginTop: 1 }}>
          {school.division}
          {subline && <> · {subline}</>}
        </div>
      </div>

      {/* Right-side affordances */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {/* Link affordance */}
        {school.rq_link ? (
          <a href={school.rq_link} target="_blank" rel="noopener noreferrer"
            style={variant === 'current' ? quietLink : primaryPill}>
            {variant === 'current' ? 'Open RQ →' : 'Open questionnaire →'}
          </a>
        ) : editingLink ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              autoFocus
              value={linkText}
              onChange={e => setLinkText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setEditingLink(false); if (e.key === 'Enter') saveLink() }}
              placeholder="https://…"
              style={{ width: 160, padding: '5px 8px', border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
            />
            <button onClick={saveLink} style={ghostBtn}>Save</button>
            <button onClick={() => setEditingLink(false)} style={mutedBtn}>Cancel</button>
          </div>
        ) : (
          <>
            <button onClick={() => { setLinkText(''); setEditingLink(true) }} style={ghostBtn}>+ Add link</button>
            <a href={rqSearchUrl(school.name)} target="_blank" rel="noopener noreferrer" style={mutedLink}>Find it ↗</a>
          </>
        )}

        {/* State action */}
        {variant === 'not_started' && (
          <button onClick={() => updateSchool(school.id, rqMarkCompletedPatch())} style={darkPill}>Mark completed</button>
        )}
        {variant === 'needs_update' && (
          age === null ? (
            settingDate ? (
              <input
                type="date"
                autoFocus
                max={new Date().toISOString().split('T')[0]}
                onChange={async e => { if (e.target.value) { await updateSchool(school.id, rqSetDatePatch(new Date(e.target.value).toISOString())); setSettingDate(false) } }}
                onBlur={() => setSettingDate(false)}
                style={{ padding: '4px 6px', border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
              />
            ) : (
              <button onClick={() => setSettingDate(true)} style={darkPill}>Set date</button>
            )
          ) : (
            <button onClick={() => updateSchool(school.id, rqMarkUpdatedPatch())} style={darkPill}>Mark updated</button>
          )
        )}
      </div>
    </div>
  )
}

// ─── Row action styles ───────────────────────────────────────────────────────

const primaryPill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', padding: '6px 13px', background: PETROL.accent,
  color: '#fff', borderRadius: 999, fontSize: 12, fontWeight: 650, textDecoration: 'none', letterSpacing: '-0.01em',
}
const darkPill: React.CSSProperties = {
  padding: '6px 13px', background: C.ink, color: '#fff', border: 'none', borderRadius: 999,
  fontSize: 12, fontWeight: 650, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em',
}
const quietLink: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: PETROL.accent, textDecoration: 'none', letterSpacing: '-0.01em',
}
const ghostBtn: React.CSSProperties = {
  padding: '5px 11px', background: 'none', border: `1px solid ${C.line}`, borderRadius: 999,
  fontSize: 12, fontWeight: 600, color: C.inkMid, cursor: 'pointer', fontFamily: 'inherit',
}
const mutedBtn: React.CSSProperties = {
  padding: '5px 8px', background: 'none', border: 'none', fontSize: 12, fontWeight: 600,
  color: C.inkMute, cursor: 'pointer', fontFamily: 'inherit',
}
const mutedLink: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 600, color: C.inkMute, textDecoration: 'none',
}

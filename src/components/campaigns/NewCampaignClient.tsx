'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { School, Coach } from '@/lib/types'

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  paper:   '#F6F1E8',
  white:   '#fff',
  border:  '#E2DBC9',
  ink:     '#0E0E0E',
  inkSoft: '#1F1F1F',
  inkLo:   '#7A7570',
  red:     '#C8102E',
  amber:   '#B45309',
  green:   '#16A34A',
  teal:    '#00B2A9',
}

// ── Mustache renderer ─────────────────────────────────────────────────────────

function renderTemplate(body: string, school: School | null, coach: Coach | null): string {
  if (!school) return body
  const parts = (coach?.name ?? '').trim().split(/\s+/)
  const firstName = parts[0] ?? ''
  const lastName  = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? ''
  return body
    .replace(/\{\{coach_last_name\}\}/g,  lastName  || '[Coach]')
    .replace(/\{\{coach_first_name\}\}/g, firstName || '[Coach]')
    .replace(/\{\{school_name\}\}/g,      school.name)
    .replace(/\{\{coach_role\}\}/g,       coach?.role ?? '[Role]')
}

// ── Supported placeholders ────────────────────────────────────────────────────

const PLACEHOLDERS = [
  { label: '{{coach_last_name}}',  value: '{{coach_last_name}}'  },
  { label: '{{coach_first_name}}', value: '{{coach_first_name}}' },
  { label: '{{school_name}}',      value: '{{school_name}}'      },
  { label: '{{coach_role}}',       value: '{{coach_role}}'       },
]

// ── Unknown placeholder warning ───────────────────────────────────────────────

function findUnknownPlaceholders(body: string): string[] {
  const supported = new Set(PLACEHOLDERS.map(p => p.value))
  const all = body.match(/\{\{[^}]+\}\}/g) ?? []
  return Array.from(new Set(all.filter(p => !supported.has(p))))
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function btn(variant: 'primary' | 'ghost' | 'outline', disabled = false): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', border: 'none',
    flexShrink: 0, transition: 'opacity 0.1s',
    opacity: disabled ? 0.5 : 1,
  }
  if (variant === 'primary')  return { ...base, background: C.ink, color: '#fff' }
  if (variant === 'outline')  return { ...base, background: C.white, color: C.ink, border: `1px solid ${C.border}` }
  return { ...base, background: 'transparent', color: C.inkLo, border: `1px solid ${C.border}` }
}

function inputStyle(multiline = false): React.CSSProperties {
  return {
    width: '100%', boxSizing: 'border-box',
    padding: '8px 12px', borderRadius: 7,
    border: `1px solid ${C.border}`,
    fontSize: 13, color: C.ink, background: C.white,
    outline: 'none', fontFamily: 'inherit',
    ...(multiline ? { resize: 'vertical', minHeight: 180 } : {}),
  }
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700,
        background: done ? C.ink : active ? C.teal : C.border,
        color: done || active ? '#fff' : C.inkLo,
      }}>
        {done ? '✓' : n}
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  schools: School[]
  coachBySchool: Record<string, Coach>
  sampleSchool: School | null
  sampleCoach: Coach | null
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NewCampaignClient({ schools, coachBySchool, sampleSchool, sampleCoach }: Props) {
  const router = useRouter()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Step state: 1=name+template, 2=scope, 3=throttle, 4=review
  const [step, setStep] = useState(1)

  // Step 1
  const [campaignName, setCampaignName]     = useState('')
  const [templateName, setTemplateName]     = useState('')
  const [body, setBody]                     = useState('')
  const [showPreview, setShowPreview]       = useState(true)

  // Step 2 — school scope
  const nonNope = schools.filter(s => s.category !== 'Nope')
  const abTier  = nonNope.filter(s => s.category === 'A' || s.category === 'B')
  const cTier   = nonNope.filter(s => s.category === 'C')
  const initSelected = new Set(abTier.map(s => s.id))
  const [selected, setSelected] = useState<Set<string>>(initSelected)
  const [showCTier, setShowCTier] = useState(false)

  // Step 3
  const [throttleDays, setThrottleDays] = useState(7)

  // Submission
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // ── Derived ────────────────────────────────────────────────────────────────

  const unknown = findUnknownPlaceholders(body)
  const preview = renderTemplate(body, sampleSchool, sampleCoach)
  const canAdvanceStep1 = campaignName.trim().length > 0 && body.trim().length > 0
  const selectedSchools = nonNope.filter(s => selected.has(s.id))

  // ── Handlers ───────────────────────────────────────────────────────────────

  function insertPlaceholder(value: string) {
    const el = textareaRef.current
    if (!el) { setBody(b => b + value); return }
    const start = el.selectionStart ?? body.length
    const end   = el.selectionEnd   ?? body.length
    const next  = body.slice(0, start) + value + body.slice(end)
    setBody(next)
    // Restore cursor position after React re-render
    setTimeout(() => {
      el.selectionStart = el.selectionEnd = start + value.length
      el.focus()
    }, 0)
  }

  function toggleSchool(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleTier(tier: 'A' | 'B' | 'C', checked: boolean) {
    const ids = nonNope.filter(s => s.category === tier).map(s => s.id)
    setSelected(prev => {
      const next = new Set(prev)
      ids.forEach(id => checked ? next.add(id) : next.delete(id))
      return next
    })
  }

  async function handleCreate() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName.trim(),
          templateName: templateName.trim() || `${campaignName.trim()} — template`,
          body,
          throttleDays,
          schoolIds: selectedSchools.map(s => s.id),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to create campaign'); return }
      router.push(`/campaigns/${json.campaignId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Tier summary helper ────────────────────────────────────────────────────

  function tierCount(tier: string) {
    return nonNope.filter(s => s.category === tier && selected.has(s.id)).length
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 64px' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <button
          onClick={() => router.push('/campaigns')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: C.inkLo, padding: 0, marginBottom: 12 }}
        >
          ← Campaigns
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 750, color: C.ink, letterSpacing: -0.5, margin: 0 }}>
          New campaign
        </h1>
      </div>

      {/* Step dots */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32 }}>
        {[1, 2, 3].map(n => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StepDot n={n} active={step === n} done={step > n} />
            {n < 3 && <div style={{ width: 32, height: 1, background: C.border }} />}
          </div>
        ))}
        <span style={{ fontSize: 12, color: C.inkLo, marginLeft: 8 }}>
          {step === 1 ? 'Name & template' : step === 2 ? 'School scope' : 'Settings'}
        </span>
      </div>

      {/* ── Step 1: Name + Template ───────────────────────────────────────── */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div>
            <label style={labelStyle}>Campaign name</label>
            <input
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder="e.g. Wingback update — May 2026"
              style={inputStyle()}
              autoFocus
            />
          </div>

          <div>
            <label style={labelStyle}>Template name <span style={{ color: C.inkLo, fontWeight: 400 }}>(optional)</span></label>
            <input
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder={campaignName.trim() ? `${campaignName.trim()} — template` : 'Template name'}
              style={inputStyle()}
            />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Email body</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PLACEHOLDERS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => insertPlaceholder(p.value)}
                    style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: '#E0F2FE', color: '#0369A1', border: 'none', cursor: 'pointer',
                    }}
                    title={`Insert ${p.value}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              ref={textareaRef}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={'Coach {{coach_last_name}},\n\nI wanted to follow up…'}
              style={{ ...inputStyle(true), minHeight: 220 }}
            />
            {unknown.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, color: C.amber }}>
                Unknown placeholder{unknown.length > 1 ? 's' : ''} (will not be replaced): {unknown.join(', ')}
              </div>
            )}
          </div>

          {/* Live preview */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>
                Preview
                {sampleSchool && (
                  <span style={{ fontWeight: 400, color: C.inkLo }}>
                    {' '}— {sampleSchool.short_name ?? sampleSchool.name}
                    {sampleCoach ? ` / ${sampleCoach.name}` : ' (no coach)'}
                  </span>
                )}
              </label>
              <button
                onClick={() => setShowPreview(p => !p)}
                style={{ fontSize: 11, color: C.inkLo, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {showPreview ? 'hide' : 'show'}
              </button>
            </div>
            {showPreview && (
              <div style={{
                background: C.paper, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: '14px 16px',
                fontSize: 13, color: C.inkSoft, whiteSpace: 'pre-wrap',
                lineHeight: 1.6, minHeight: 80,
                fontFamily: 'Georgia, serif',
              }}>
                {body.trim() ? preview : <span style={{ color: C.inkLo, fontStyle: 'italic' }}>Start typing to see preview…</span>}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setStep(2)}
              disabled={!canAdvanceStep1}
              style={btn('primary', !canAdvanceStep1)}
            >
              Next: School scope →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: School scope ──────────────────────────────────────────── */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Tier toggles */}
          <div style={{
            background: C.paper, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: '12px 16px',
            display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.inkLo }}>Select all by tier:</span>
            {(['A', 'B', 'C'] as const).map(tier => {
              const tierSchools = nonNope.filter(s => s.category === tier)
              const allOn = tierSchools.every(s => selected.has(s.id))
              return (
                <label key={tier} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={allOn}
                    onChange={e => {
                      toggleTier(tier, e.target.checked)
                      if (tier === 'C' && e.target.checked) setShowCTier(true)
                    }}
                  />
                  <span>Tier {tier}</span>
                  <span style={{ fontSize: 11, color: C.inkLo }}>({tierCount(tier)}/{tierSchools.length})</span>
                </label>
              )
            })}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: C.inkLo }}>
              <strong style={{ color: C.ink }}>{selected.size}</strong> schools selected
            </span>
          </div>

          {/* A + B schools */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.inkLo, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
              Tier A & B
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {abTier.map(s => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 0' }}>
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggleSchool(s.id)}
                  />
                  <span style={{ fontSize: 13, color: C.ink }}>{s.name}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                    background: s.category === 'A' ? '#FEE2E2' : '#DBEAFE',
                    color: s.category === 'A' ? '#991B1B' : '#1E40AF',
                  }}>{s.category}</span>
                  {coachBySchool[s.id] && (
                    <span style={{ fontSize: 11, color: C.inkLo, marginLeft: 'auto' }}>
                      {coachBySchool[s.id].name}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* C tier (collapsed by default) */}
          <div>
            <button
              onClick={() => setShowCTier(p => !p)}
              style={{ fontSize: 12, color: C.inkLo, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span>{showCTier ? '▾' : '▸'}</span>
              <span>Tier C ({tierCount('C')}/{cTier.length} selected)</span>
            </button>
            {showCTier && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {cTier.map(s => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 0' }}>
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggleSchool(s.id)}
                    />
                    <span style={{ fontSize: 13, color: C.ink }}>{s.name}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                      background: '#F3F4F6', color: '#374151',
                    }}>C</span>
                    {coachBySchool[s.id] && (
                      <span style={{ fontSize: 11, color: C.inkLo, marginLeft: 'auto' }}>
                        {coachBySchool[s.id].name}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep(1)} style={btn('outline')}>← Back</button>
            <button
              onClick={() => setStep(3)}
              disabled={selected.size === 0}
              style={btn('primary', selected.size === 0)}
            >
              Next: Settings →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Throttle + Create ─────────────────────────────────────── */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          <div>
            <label style={labelStyle}>Throttle days</label>
            <input
              type="number"
              min={1}
              max={90}
              value={throttleDays}
              onChange={e => setThrottleDays(Number(e.target.value))}
              style={{ ...inputStyle(), maxWidth: 120 }}
            />
            <p style={{ fontSize: 11, color: C.inkLo, marginTop: 6 }}>
              Not enforced yet — will take effect in Phase 2b.
            </p>
          </div>

          {/* Summary card */}
          <div style={{
            background: C.paper, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: '16px 20px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.inkLo, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Review before creating
            </div>
            <Row label="Campaign name" value={campaignName} />
            <Row label="Schools" value={`${selected.size} selected`} />
            <Row label="Throttle" value={`${throttleDays} days (advisory)`} />
            <Row label="Status" value="draft" />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: C.red, background: '#FEF2F2', border: `1px solid #FCA5A5`, borderRadius: 7, padding: '10px 14px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep(2)} style={btn('outline')}>← Back</button>
            <button
              onClick={handleCreate}
              disabled={submitting}
              style={btn('primary', submitting)}
            >
              {submitting ? 'Creating…' : 'Create as draft'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Micro-components ──────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
      <span style={{ color: C.inkLo, minWidth: 120 }}>{label}</span>
      <span style={{ color: C.ink, fontWeight: 500 }}>{value}</span>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700,
  color: C.inkLo, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4,
}

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SettingsMasthead, SP, pill } from '@/components/settings/SettingsChrome'
import IntakeSuggest, { type IntakeSuggestion } from '@/components/IntakeSuggest'
import { toSchoolInsert } from '@/lib/discovery-add'
import { POSITION_GROUPS, SPORTS, DEFAULT_SPORT } from '@/lib/positions'
import type { Player } from '@/lib/types'

// ─── Timezone choices (IANA) ─────────────────────────────────────────────────
const TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/New_York',    label: 'Eastern — America/New_York' },
  { value: 'America/Chicago',     label: 'Central — America/Chicago' },
  { value: 'America/Denver',      label: 'Mountain — America/Denver' },
  { value: 'America/Phoenix',     label: 'Arizona — America/Phoenix' },
  { value: 'America/Los_Angeles', label: 'Pacific — America/Los_Angeles' },
  { value: 'America/Anchorage',   label: 'Alaska — America/Anchorage' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii — Pacific/Honolulu' },
]
const DEFAULT_TZ = 'America/Denver'

// Echo-field contracts in plain words — surfaced where the fields live (the
// staged optional section), matching the spirit of the binding column comments.
const PREP_HELP =
  'Written by you. Describe the routine your player already has — equipment, ' +
  'timing, food preferences, recovery habits. Documents echo this at the right ' +
  'moment of a schedule; they never extend it, never diagnose, and never ' +
  'prescribe. Left empty, generated guidance stays general.'
const PREFS_HELP =
  'Written by you. State declared preferences and anything that must not be ' +
  'said to schools — which program holds the top-choice card, language that is ' +
  'off the table. Documents echo this exactly; they never infer or invent a ' +
  'ranking. Left empty, documents say no preference is on record.'

type Step = 'form' | 'suggesting' | 'suggest' | 'done'

interface FormState {
  name: string
  sport: string
  position: string
  secondary_position: string
  grad_year: string
  home_timezone: string
  preparation_notes: string
  recruiting_preferences: string
  intake: string
}

function toForm(p: Player | null): FormState {
  return {
    name: p?.name ?? '',
    sport: p?.sport ?? DEFAULT_SPORT,
    position: p?.position ?? '',
    secondary_position: p?.secondary_position ?? '',
    grad_year: p?.grad_year ? String(p.grad_year) : '',
    home_timezone: p?.home_timezone?.trim() || DEFAULT_TZ,
    preparation_notes: p?.preparation_notes ?? '',
    recruiting_preferences: p?.recruiting_preferences ?? '',
    intake: '',
  }
}

export default function PlayerSettingsClient({ initialPlayer }: { initialPlayer: Player | null }) {
  const supabase = useMemo(() => createClient(), [])
  const [player, setPlayer] = useState<Player | null>(initialPlayer)
  const [form, setForm] = useState<FormState>(() => toForm(initialPlayer))
  const [step, setStep] = useState<Step>('form')
  const [suggestions, setSuggestions] = useState<IntakeSuggestion[]>([])
  const [addedCount, setAddedCount] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isCreate = player === null
  const set = (k: keyof FormState) => (v: string) => { setForm(f => ({ ...f, [k]: v })); setSavedAt(null) }

  const gradYearNum = /^\d{4}$/.test(form.grad_year.trim()) ? Number(form.grad_year.trim()) : null
  const canSave = form.name.trim().length > 0 &&
    form.position.trim().length > 0 &&
    gradYearNum !== null &&
    !saving

  const firstName = form.name.trim().split(/\s+/)[0] || 'your player'

  // ── Create: birth the row, then (with intake) build the starting list ──────
  async function handleCreate() {
    if (!canSave) return
    setSaving(true); setError(null)
    const intakeText = form.intake.trim()
    // No family_id — the RLS helper default stamps it.
    // intake_notes is NON-CANONICAL: stored for the record, read by no generator.
    const { data, error: err } = await supabase.from('players').insert({
      name: form.name.trim(),
      sport: form.sport,
      position: form.position,
      secondary_position: form.secondary_position || null,
      grad_year: gradYearNum,
      home_timezone: form.home_timezone,
      intake_notes: intakeText || null,
    }).select().single()
    setSaving(false)
    if (err) { setError(err.message); return }
    setPlayer(data as Player)
    setForm(f => ({ ...toForm(data as Player), intake: f.intake }))

    if (!intakeText) { setStep('done'); return }

    // Fail-soft suggestion fetch: any error or empty result lands on the
    // normal flow with a browse pointer — signup never blocks on a model call.
    setStep('suggesting')
    try {
      const res = await fetch('/api/discover/intake-suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intake: intakeText }),
      })
      const json = res.ok ? await res.json() : { suggestions: [] }
      const sugg = (json.suggestions ?? []) as IntakeSuggestion[]
      if (sugg.length > 0) { setSuggestions(sugg); setStep('suggest') }
      else setStep('done')
    } catch { setStep('done') }
  }

  // ── Adopt the checked suggestions via the shared add-from-catalog path ─────
  // TODO(demo-funnel): this adoption write is the authenticated side of the
  // IntakeSuggest seam — the demo renders the same component without it.
  async function handleAddChecked(rows: IntakeSuggestion[]) {
    setAdding(true)
    let added = 0
    for (const r of rows) {
      const { error: err } = await supabase.from('schools').insert({
        ...toSchoolInsert({
          id: r.id, name: r.name, short_name: r.short_name, division: r.division,
          conference: r.conference, region: r.region,
          academic_band: (r.academic_band ?? null) as import('@/lib/types').AcademicBand | null, has_engineering: false,
          city: r.city, state: r.state,
        }),
        sort_order: added + 1,
      })
      if (!err) added++
    }
    setAdding(false)
    setAddedCount(added)
    setStep('done')
  }

  // ── Edit: the full record, one save ────────────────────────────────────────
  async function handleSaveEdit() {
    if (!canSave || !player) return
    setSaving(true); setError(null)
    const { data, error: err } = await supabase.from('players').update({
      name: form.name.trim(),
      sport: form.sport,
      position: form.position,
      secondary_position: form.secondary_position || null,
      grad_year: gradYearNum,
      home_timezone: form.home_timezone,
      preparation_notes: form.preparation_notes.trim() || null,
      recruiting_preferences: form.recruiting_preferences.trim() || null,
    }).eq('id', player.id).select().single()
    setSaving(false)
    if (err) setError(err.message)
    else { setPlayer(data as Player); setSavedAt(Date.now()) }
  }

  // ── Shared field blocks ────────────────────────────────────────────────────
  const basicsFields = (
    <>
      <Field label="Player name" required>
        <input style={inputStyle} value={form.name} onChange={e => set('name')(e.target.value)}
          placeholder="First and last name" />
      </Field>

      <Field label="Sport" required>
        <div style={{ display: 'flex', gap: 18 }}>
          {SPORTS.map(sp => (
            <label key={sp} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: SP.ink, cursor: 'pointer' }}>
              <input type="radio" name="sport" checked={form.sport === sp}
                onChange={() => set('sport')(sp)} style={{ accentColor: SP.tealDeep }} />
              {sp}
            </label>
          ))}
        </div>
      </Field>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <Field label="Position" required>
            <PositionSelect value={form.position} onChange={set('position')} placeholder="Select position…" />
          </Field>
        </div>
        {!isCreate && (
          <div style={{ flex: '1 1 200px' }}>
            <Field label="Secondary position">
              <PositionSelect value={form.secondary_position} onChange={set('secondary_position')} placeholder="None" allowNone />
            </Field>
          </div>
        )}
        <div style={{ flex: '0 1 140px' }}>
          <Field label="Grad year" required>
            <input style={inputStyle} value={form.grad_year} inputMode="numeric"
              onChange={e => set('grad_year')(e.target.value)} placeholder="e.g. 2027" />
          </Field>
        </div>
      </div>

      <Field label="Home timezone">
        <select style={{ ...inputStyle, appearance: 'auto' as const }} value={form.home_timezone}
          onChange={e => set('home_timezone')(e.target.value)}>
          {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
        </select>
      </Field>
    </>
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: SP.paper, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px 80px' }}>
        <SettingsMasthead
          title="Player Profile"
          subtitle={isCreate
            ? 'A 30-second first step — the profile grows with your journey.'
            : 'Your player, as every email subject, document, and screen will name them.'}
        />

        {/* CREATE — the slim first step */}
        {isCreate && step === 'form' && (
          <>
            <div style={{
              background: SP.white, border: `1px solid ${SP.line}`, borderRadius: 14,
              padding: '12px 16px', marginBottom: 16, fontSize: 13, color: SP.inkMid, lineHeight: 1.5,
            }}>
              <span style={{ fontWeight: 650, fontStyle: 'italic', color: SP.ink }}>Add your player.</span>{' '}
              Drafting stays paused until this exists.
            </div>

            <div style={{ background: SP.white, border: `1px solid ${SP.line}`, borderRadius: 14, padding: '22px 22px 18px' }}>
              {basicsFields}

              <Field
                label={`What kind of schools is ${firstName} aiming for?`}
                help="Optional — level, region, academics, program, in your own words. We'll turn it into a starting list you can edit."
              >
                <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' as const }}
                  value={form.intake} onChange={e => set('intake')(e.target.value)}
                  placeholder={'e.g. "small engineering schools in the northeast, strong academics, D3"'} />
              </Field>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                <button style={pill('primary', !canSave)} disabled={!canSave} onClick={handleCreate}>
                  {saving ? 'Adding…' : 'Add player'}
                </button>
                {error && <span style={{ fontSize: 12, color: SP.red }}>{error}</span>}
              </div>
            </div>
          </>
        )}

        {/* CREATE — building the starting list */}
        {step === 'suggesting' && (
          <div style={{
            background: SP.white, border: `1px solid ${SP.line}`, borderRadius: 14,
            padding: '44px 28px', textAlign: 'center', fontSize: 14, color: SP.inkMid,
          }}>
            Building {firstName}&apos;s starting list…
          </div>
        )}

        {/* CREATE — the starting list */}
        {step === 'suggest' && (
          <IntakeSuggest
            suggestions={suggestions}
            adding={adding}
            onAdd={handleAddChecked}
            onSkip={() => setStep('done')}
          />
        )}

        {/* Post-create confirmation + the full record (edit mode) */}
        {!isCreate && (step === 'done' || step === 'form') && (
          <>
            {step === 'done' && (
              <div style={{
                background: SP.tealSoft, border: '1px solid #CFE0D5', borderRadius: 12,
                padding: '12px 16px', marginBottom: 16, fontSize: 13, color: SP.ink, lineHeight: 1.5,
              }}>
                {addedCount != null && addedCount > 0 ? (
                  <><b>{form.name.trim()}</b> is set up and {addedCount} school{addedCount === 1 ? '' : 's'} landed on{' '}
                  <Link href="/schools" style={{ color: SP.tealDeep, fontWeight: 650 }}>your list</Link>.</>
                ) : (
                  <><b>{form.name.trim()}</b> is set up. Build the list whenever you&apos;re ready —{' '}
                  <Link href="/get-ready" style={{ color: SP.tealDeep, fontWeight: 650 }}>browse schools in Find Schools</Link>.</>
                )}
              </div>
            )}

            {/* Basics */}
            <SectionCard title="The basics">
              {basicsFields}
            </SectionCard>

            {/* The written record — staged, clearly optional */}
            <SectionCard
              title="The written record"
              eyebrowNote="Optional — used when documents are generated. Add anytime."
            >
              <div id="preparation-notes">
                <Field label="Preparation notes" help={PREP_HELP}>
                  <textarea style={{ ...inputStyle, minHeight: 96, resize: 'vertical' as const }}
                    value={form.preparation_notes} onChange={e => set('preparation_notes')(e.target.value)} />
                </Field>
              </div>
              <div id="recruiting-preferences">
                <Field label="Recruiting preferences" help={PREFS_HELP}>
                  <textarea style={{ ...inputStyle, minHeight: 96, resize: 'vertical' as const }}
                    value={form.recruiting_preferences} onChange={e => set('recruiting_preferences')(e.target.value)} />
                </Field>
              </div>
            </SectionCard>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button style={pill('primary', !canSave)} disabled={!canSave} onClick={handleSaveEdit}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              {savedAt && <span style={{ fontSize: 12, color: SP.tealDeep, fontWeight: 600 }}>Saved.</span>}
              {error && <span style={{ fontSize: 12, color: SP.red }}>{error}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Small pieces ────────────────────────────────────────────────────────────

function SectionCard({ title, eyebrowNote, children }: {
  title: string; eyebrowNote?: string; children: React.ReactNode
}) {
  return (
    <div style={{ background: SP.white, border: `1px solid ${SP.line}`, borderRadius: 14, padding: '20px 22px 14px', marginBottom: 16 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, fontStyle: 'italic', color: SP.ink }}>
          {title}<span style={{ color: SP.teal }}>.</span>
        </div>
        {eyebrowNote && <div style={{ fontSize: 12, color: SP.inkLo, marginTop: 3 }}>{eyebrowNote}</div>}
      </div>
      {children}
    </div>
  )
}

function PositionSelect({ value, onChange, placeholder, allowNone }: {
  value: string; onChange: (v: string) => void; placeholder: string; allowNone?: boolean
}) {
  return (
    <select style={{ ...inputStyle, appearance: 'auto' as const }} value={value}
      onChange={e => onChange(e.target.value)}>
      <option value="">{allowNone ? 'None' : placeholder}</option>
      {POSITION_GROUPS.map(g => (
        <optgroup key={g.group} label={g.group}>
          {g.positions.map(p => <option key={p} value={p}>{p}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

function Field({ label, required, help, children }: {
  label: string; required?: boolean; help?: string; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: SP.ink, marginBottom: 5 }}>
        {label}{required && <span style={{ color: SP.inkMute, fontWeight: 500 }}> — required</span>}
      </label>
      {children}
      {help && <p style={{ margin: '6px 0 0', fontSize: 12, color: SP.inkLo, lineHeight: 1.5 }}>{help}</p>}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '9px 12px', borderRadius: 8,
  border: `1px solid ${SP.line2}`, background: SP.white,
  fontSize: 13.5, color: SP.ink, fontFamily: 'inherit',
}

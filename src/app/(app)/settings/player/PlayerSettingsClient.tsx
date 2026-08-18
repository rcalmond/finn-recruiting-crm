'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SettingsMasthead, SP, pill } from '@/components/settings/SettingsChrome'
import type { Player } from '@/lib/types'

// ─── Timezone choices (IANA) ─────────────────────────────────────────────────
// A curated US-first list — free-typing an IANA string is a footgun; the select
// stays honest because every value is a real zone.
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

// Echo-field contracts, in plain words (the spirit of the binding column
// comments, not a paste of them).
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

interface FormState {
  name: string
  position: string
  grad_year: string
  home_timezone: string
  preparation_notes: string
  recruiting_preferences: string
}

function toForm(p: Player | null): FormState {
  return {
    name: p?.name ?? '',
    position: p?.position ?? '',
    grad_year: p?.grad_year ? String(p.grad_year) : '',
    home_timezone: p?.home_timezone?.trim() || DEFAULT_TZ,
    preparation_notes: p?.preparation_notes ?? '',
    recruiting_preferences: p?.recruiting_preferences ?? '',
  }
}

export default function PlayerSettingsClient({ initialPlayer }: { initialPlayer: Player | null }) {
  const supabase = useMemo(() => createClient(), [])
  const [player, setPlayer] = useState<Player | null>(initialPlayer)
  const [form, setForm] = useState<FormState>(() => toForm(initialPlayer))
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isCreate = player === null
  const set = (k: keyof FormState) => (v: string) => { setForm(f => ({ ...f, [k]: v })); setSavedAt(null) }

  const gradYearNum = /^\d{4}$/.test(form.grad_year.trim()) ? Number(form.grad_year.trim()) : null
  const canSave = form.name.trim().length > 0 &&
    form.position.trim().length > 0 &&
    gradYearNum !== null &&
    !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    const payload = {
      name: form.name.trim(),
      position: form.position.trim(),
      grad_year: gradYearNum,
      home_timezone: form.home_timezone,
      preparation_notes: form.preparation_notes.trim() || null,
      recruiting_preferences: form.recruiting_preferences.trim() || null,
    }
    if (isCreate) {
      // No family_id in the payload — the RLS helper default stamps it.
      const { data, error: err } = await supabase.from('players').insert(payload).select().single()
      if (err) setError(err.message)
      else { setPlayer(data as Player); setSavedAt(Date.now()) }
    } else {
      const { data, error: err } = await supabase.from('players').update(payload).eq('id', player.id).select().single()
      if (err) setError(err.message)
      else { setPlayer(data as Player); setSavedAt(Date.now()) }
    }
    setSaving(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: SP.paper, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px 80px' }}>
        <SettingsMasthead
          title="Player Profile"
          subtitle={isCreate
            ? 'Add your player. Their name, position, and class year carry through every email subject, document, and screen.'
            : 'Your player, as every email subject, document, and screen will name them.'}
        />

        {isCreate && (
          <div style={{
            background: SP.white, border: `1px solid ${SP.line}`, borderRadius: 14,
            padding: '14px 18px', marginBottom: 18, fontSize: 13, color: SP.inkMid, lineHeight: 1.55,
          }}>
            <span style={{ fontWeight: 650, fontStyle: 'italic', color: SP.ink }}>Add your player.</span>{' '}
            Nothing here is guessed — until this exists, drafting is paused and
            screens show your account name instead.
          </div>
        )}

        <div style={{ background: SP.white, border: `1px solid ${SP.line}`, borderRadius: 14, padding: '22px 22px 18px' }}>
          <Field label="Player name" required>
            <input style={inputStyle} value={form.name} onChange={e => set('name')(e.target.value)}
              placeholder="First and last name" />
          </Field>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px' }}>
              <Field label="Position" required>
                <input style={inputStyle} value={form.position} onChange={e => set('position')(e.target.value)}
                  placeholder="e.g. Left Wingback" />
              </Field>
            </div>
            <div style={{ flex: '0 1 160px' }}>
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

          <Field label="Preparation notes" help={PREP_HELP}>
            <textarea style={{ ...inputStyle, minHeight: 96, resize: 'vertical' as const }}
              value={form.preparation_notes} onChange={e => set('preparation_notes')(e.target.value)} />
          </Field>

          <Field label="Recruiting preferences" help={PREFS_HELP}>
            <textarea style={{ ...inputStyle, minHeight: 96, resize: 'vertical' as const }}
              value={form.recruiting_preferences} onChange={e => set('recruiting_preferences')(e.target.value)} />
          </Field>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
            <button style={pill('primary', !canSave)} disabled={!canSave} onClick={handleSave}>
              {saving ? 'Saving…' : isCreate ? 'Add player' : 'Save changes'}
            </button>
            {savedAt && <span style={{ fontSize: 12, color: SP.tealDeep, fontWeight: 600 }}>Saved.</span>}
            {error && <span style={{ fontSize: 12, color: SP.red }}>{error}</span>}
          </div>
        </div>
      </div>
    </div>
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

'use client'

import { useState } from 'react'
import type { CampExtraction, CampPrepInputs } from '@/lib/camp-prep'

// Throughball chrome — capture + organization, no judgment, no Regista.
const C = {
  paper:'#F6F1E8', warmWhite:'#FFFDF9', cream:'#FBF6EC', ink:'#1A1A1A', inkMid:'#4A4A4A',
  muted:'#6B655A', faint:'#8A8478', line:'#E2DBC9', line2:'#D3CAB3', pitch:'#1F6B48', danger:'#9A0B23',
}

type Stage = 'input' | 'extracting' | 'confirm' | 'saving' | 'saved' | 'error'

const TRAVEL_PLACEHOLDER =
  'Flights: DEN→BTV Fri 4:10p, arrive 11:55p (connect ORD). Drive Burlington→Middlebury ~45 min.\n' +
  'Lodging: Courtyard Middlebury, breakfast 6:30–9:30a.\n' +
  'Competing: Sunday 9:10a tee time in Burlington (Dad).\n' +
  'Travelling: player + parent.'

export default function CampPrepModal({
  campId, campName, existingDoc, onClose, onSaved,
}: {
  campId: string
  campName: string
  existingDoc?: { id: string; inputs: CampPrepInputs | null; extracted_schedule: CampExtraction | null } | null
  onClose: () => void
  onSaved: () => void
}) {
  const resuming = !!existingDoc?.extracted_schedule
  const [stage, setStage] = useState<Stage>(resuming ? 'confirm' : 'input')
  const [inputs, setInputs] = useState<CampPrepInputs>(existingDoc?.inputs ?? { camp_email_raw: '', travel_prose: '', extra_notes: '' })
  const [ext, setExt] = useState<CampExtraction | null>(existingDoc?.extracted_schedule ?? null)
  const [error, setError] = useState('')

  // Immutable-ish deep update helper.
  const mut = (fn: (draft: CampExtraction) => void) =>
    setExt(prev => { if (!prev) return prev; const n = JSON.parse(JSON.stringify(prev)) as CampExtraction; fn(n); return n })

  async function handleExtract() {
    if (!inputs.camp_email_raw.trim()) { setError('Paste the camp email first.'); return }
    setStage('extracting'); setError('')
    try {
      const res = await fetch('/api/camp-prep/extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campId, inputs }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Extraction failed')
      setExt(json.extraction as CampExtraction)
      setStage('confirm')
    } catch (e) { setError(e instanceof Error ? e.message : 'Extraction failed'); setStage('error') }
  }

  async function handleSave() {
    if (!ext) return
    setStage('saving'); setError('')
    try {
      const res = await fetch('/api/camp-prep/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campId, inputs, extractedSchedule: ext, existingDocId: existingDoc?.id ?? null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      setStage('saved'); onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); setStage('error') }
  }

  return (
    <Overlay onClose={stage === 'extracting' || stage === 'saving' ? undefined : onClose}>
      {/* Header */}
      <div style={{ padding: '20px 24px 14px', borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, fontStyle: 'italic', letterSpacing: '-0.03em', color: C.ink }}>
            Camp prep<span style={{ color: C.pitch }}>.</span>
          </h2>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{campName}</div>
        </div>
        {stage !== 'extracting' && stage !== 'saving' && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.faint, padding: 4, lineHeight: 1 }}>&times;</button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {stage === 'input' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
              Paste the camp email and your travel notes. Regista extracts the schedule, check-in, surface, and the operational constraints for you to confirm — nothing is generated yet.
            </div>
            <Field label="Paste the camp email" required>
              <textarea value={inputs.camp_email_raw} onChange={e => setInputs(v => ({ ...v, camp_email_raw: e.target.value }))}
                rows={10} placeholder="Paste the whole email verbatim — schedule, forms, equipment notes, and the coach's signature." style={ta} />
            </Field>
            <Field label="Travel, timing, and anything else this week">
              <textarea value={inputs.travel_prose} onChange={e => setInputs(v => ({ ...v, travel_prose: e.target.value }))}
                rows={6} placeholder={TRAVEL_PLACEHOLDER} style={ta} />
            </Field>
            <Field label="Anything else this doc should account for" optional>
              <textarea value={inputs.extra_notes} onChange={e => setInputs(v => ({ ...v, extra_notes: e.target.value }))}
                rows={2} placeholder="Optional." style={ta} />
            </Field>
            {error && <ErrorNote>{error}</ErrorNote>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <PitchButton onClick={handleExtract} disabled={!inputs.camp_email_raw.trim()}>Extract &amp; review →</PitchButton>
            </div>
          </div>
        )}

        {(stage === 'extracting' || stage === 'saving') && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '48px 0', color: C.inkMid, fontSize: 14 }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${C.line2}`, borderTopColor: C.pitch, animation: 'tb-spin 0.8s linear infinite' }} />
            {stage === 'extracting' ? 'Reading the email and travel notes…' : 'Saving draft…'}
            <style>{`@keyframes tb-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {stage === 'confirm' && ext && (
          <ConfirmForm ext={ext} mut={mut} />
        )}

        {stage === 'saved' && (
          <div style={{ textAlign: 'center', padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.cream, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.pitch, fontSize: 22 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 650, color: C.ink }}>Draft saved.</div>
            <div style={{ fontSize: 13, color: C.muted, maxWidth: 340, lineHeight: 1.5 }}>
              The confirmed schedule is stored. Generate document is now available on the camp page — and you can reopen and edit this draft anytime.
            </div>
            <PitchButton onClick={onClose}>Done</PitchButton>
          </div>
        )}

        {stage === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '32px 0' }}>
            <ErrorNote>{error}</ErrorNote>
            <GhostButton onClick={() => setStage(ext ? 'confirm' : 'input')}>Back</GhostButton>
          </div>
        )}
      </div>

      {/* Footer for confirm */}
      {stage === 'confirm' && ext && (
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <GhostButton onClick={() => setStage('input')}>← Edit inputs</GhostButton>
          <PitchButton onClick={handleSave}>Confirm &amp; save draft</PitchButton>
        </div>
      )}
    </Overlay>
  )
}

// ─── Confirm form (fully editable extraction) ────────────────────────────────

function ConfirmForm({ ext, mut }: {
  ext: CampExtraction
  mut: (fn: (d: CampExtraction) => void) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
        Check every field. Fix a time, drop a block, add a missed constraint, correct the timezone. This is what gets saved — nothing here is a guess unless you leave it as one.
      </div>

      {/* HARD CONSTRAINTS — most likely wrong, most costly. Prominent. */}
      <SectionCard title="Hard constraints" accent>
        <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8 }}>Operational things to plan around — forms, trainer on site, equipment, unsupervised gaps, timing caveats, optional sessions. Add anything the extractor missed.</div>
        {ext.hard_constraints.map((hc, i) => (
          <Row key={i} onRemove={() => mut(d => { d.hard_constraints.splice(i, 1) })}>
            <input value={hc.text} onChange={e => mut(d => { d.hard_constraints[i].text = e.target.value })} style={inp} placeholder="Constraint" />
          </Row>
        ))}
        <AddButton onClick={() => mut(d => { d.hard_constraints.push({ text: '' }) })}>+ Add constraint</AddButton>
      </SectionCard>

      {/* Venue / surface */}
      <SectionCard title="Venue">
        <TwoCol>
          <LabeledInput label="Venue" value={ext.venue} onChange={v => mut(d => { d.venue = v })} />
          <LabeledInput label="Surface" value={ext.surface} onChange={v => mut(d => { d.surface = v })} />
        </TwoCol>
      </SectionCard>

      {/* Days */}
      <SectionCard title="Schedule">
        {ext.days.map((day, di) => (
          <div key={di} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, marginBottom: 10, background: C.warmWhite }}>
            <Row onRemove={() => mut(d => { d.days.splice(di, 1) })}>
              <input value={day.label} onChange={e => mut(d => { d.days[di].label = e.target.value })} style={{ ...inp, fontWeight: 650 }} placeholder="Day label" />
            </Row>
            <TwoCol>
              <LabeledInput label="Check-in time" value={day.check_in_time} onChange={v => mut(d => { d.days[di].check_in_time = v })} placeholder="null if not given" />
              <LabeledInput label="Check-in location" value={day.check_in_location} onChange={v => mut(d => { d.days[di].check_in_location = v })} />
            </TwoCol>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 4px' }}>Blocks</div>
            {day.blocks.map((b, bi) => (
              <Row key={bi} onRemove={() => mut(d => { d.days[di].blocks.splice(bi, 1) })}>
                <input value={b.time ?? ''} onChange={e => mut(d => { d.days[di].blocks[bi].time = e.target.value || null })} style={{ ...inp, width: 96, flexShrink: 0 }} placeholder="time" />
                <input value={b.activity} onChange={e => mut(d => { d.days[di].blocks[bi].activity = e.target.value })} style={inp} placeholder="activity" />
                <input value={b.location ?? ''} onChange={e => mut(d => { d.days[di].blocks[bi].location = e.target.value || null })} style={{ ...inp, width: 120, flexShrink: 0 }} placeholder="location" />
              </Row>
            ))}
            <AddButton onClick={() => mut(d => { d.days[di].blocks.push({ time: null, activity: '', location: null }) })}>+ Add block</AddButton>
          </div>
        ))}
        <AddButton onClick={() => mut(d => { d.days.push({ label: '', check_in_time: null, check_in_location: null, blocks: [] }) })}>+ Add day</AddButton>
      </SectionCard>

      {/* Timezone */}
      <SectionCard title="Time zone">
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Home: <span style={{ color: C.ink, fontWeight: 600 }}>{ext.timezone.home_tz}</span> (from your profile)</div>
        <TwoCol>
          <LabeledInput label="Venue time zone" value={ext.timezone.venue_tz} onChange={v => mut(d => { d.timezone.venue_tz = v })} />
          <LabeledInput label="Delta" value={ext.timezone.delta} onChange={v => mut(d => { d.timezone.delta = v })} placeholder="e.g. venue is 2h ahead" />
        </TwoCol>
      </SectionCard>

      {/* Travel */}
      <SectionCard title="Travel & logistics">
        <div style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Segments</div>
        {ext.travel.segments.map((s, i) => (
          <Row key={i} onRemove={() => mut(d => { d.travel.segments.splice(i, 1) })}>
            <input value={s.mode} onChange={e => mut(d => { d.travel.segments[i].mode = e.target.value })} style={{ ...inp, width: 80, flexShrink: 0 }} placeholder="mode" />
            <input value={s.detail} onChange={e => mut(d => { d.travel.segments[i].detail = e.target.value })} style={inp} placeholder="detail" />
            <input value={s.time ?? ''} onChange={e => mut(d => { d.travel.segments[i].time = e.target.value || null })} style={{ ...inp, width: 120, flexShrink: 0 }} placeholder="time" />
          </Row>
        ))}
        <AddButton onClick={() => mut(d => { d.travel.segments.push({ mode: '', detail: '', time: null }) })}>+ Add segment</AddButton>

        <div style={{ height: 10 }} />
        <TwoCol>
          <LabeledInput label="Lodging" value={ext.travel.lodging} onChange={v => mut(d => { d.travel.lodging = v })} />
          <LabeledInput label="Breakfast window" value={ext.travel.lodging_breakfast_window} onChange={v => mut(d => { d.travel.lodging_breakfast_window = v })} />
        </TwoCol>
        <LabeledInput label="Who's travelling" value={ext.travel.who_traveling} onChange={v => mut(d => { d.travel.who_traveling = v })} />

        <div style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 4px' }}>Competing commitments</div>
        {ext.travel.competing_commitments.map((c, i) => (
          <Row key={i} onRemove={() => mut(d => { d.travel.competing_commitments.splice(i, 1) })}>
            <input value={c.text} onChange={e => mut(d => { d.travel.competing_commitments[i].text = e.target.value })} style={inp} placeholder="commitment" />
            <input type="date" value={c.date ?? ''} onChange={e => mut(d => { d.travel.competing_commitments[i].date = e.target.value || null })} style={{ ...inp, width: 140, flexShrink: 0, color: c.date ? C.ink : C.danger }} title={c.date ? undefined : 'Undated — will not be placed on a specific day'} />
            <input value={c.time ?? ''} onChange={e => mut(d => { d.travel.competing_commitments[i].time = e.target.value || null })} style={{ ...inp, width: 100, flexShrink: 0 }} placeholder="time" />
          </Row>
        ))}
        {ext.travel.competing_commitments.some(c => !c.date) && (
          <div style={{ fontSize: 10.5, color: C.danger, margin: '2px 0 4px' }}>Undated commitments (red date) won&apos;t be placed on a specific day — add a date to pin one.</div>
        )}
        <AddButton onClick={() => mut(d => { d.travel.competing_commitments.push({ text: '', time: null, date: null }) })}>+ Add commitment</AddButton>

        <div style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 4px' }}>Meal windows</div>
        {ext.travel.meal_windows.map((m, i) => (
          <Row key={i} onRemove={() => mut(d => { d.travel.meal_windows.splice(i, 1) })}>
            <input value={m} onChange={e => mut(d => { d.travel.meal_windows[i] = e.target.value })} style={inp} placeholder="e.g. hotel breakfast 6:30–9:30a" />
          </Row>
        ))}
        <AddButton onClick={() => mut(d => { d.travel.meal_windows.push('') })}>+ Add meal window</AddButton>
      </SectionCard>
    </div>
  )
}

// ─── Small pieces ────────────────────────────────────────────────────────────

function Overlay({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.4)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.paper, borderRadius: 14, width: '100%', maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(26,26,26,0.22)' }}>
        {children}
      </div>
    </div>
  )
}
function SectionCard({ title, children, accent }: { title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ background: accent ? C.cream : C.warmWhite, border: `1px solid ${accent ? C.line2 : C.line}`, borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, fontStyle: 'italic', letterSpacing: '-0.02em', color: C.ink, marginBottom: 8 }}>{title}<span style={{ color: C.pitch }}>.</span></div>
      {children}
    </div>
  )
}
function Row({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      {children}
      <button onClick={onRemove} title="Remove" style={{ background: 'none', border: 'none', color: C.faint, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>&times;</button>
    </div>
  )
}
function TwoCol({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 }}>{children}</div>
}
function LabeledInput({ label, value, onChange, placeholder }: { label: string; value: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <input value={value ?? ''} onChange={e => onChange(e.target.value || null)} style={inp} placeholder={placeholder} />
    </label>
  )
}
function Field({ label, children, required, optional }: { label: string; children: React.ReactNode; required?: boolean; optional?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}{required && <span style={{ color: C.pitch }}> *</span>}{optional && <span style={{ color: C.faint, fontWeight: 400 }}> (optional)</span>}
      </span>
      {children}
    </label>
  )
}
function AddButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} style={{ background: 'none', border: `1px dashed ${C.line2}`, borderRadius: 999, padding: '3px 12px', fontSize: 11.5, fontWeight: 600, color: C.pitch, cursor: 'pointer', fontFamily: 'inherit', marginTop: 2 }}>{children}</button>
}
function PitchButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} style={{ padding: '9px 20px', borderRadius: 999, border: 'none', background: C.pitch, color: C.cream, fontSize: 13.5, fontWeight: 650, fontFamily: 'inherit', letterSpacing: '-0.01em', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>{children}</button>
}
function GhostButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} style={{ padding: '8px 14px', borderRadius: 999, border: `1.3px solid ${C.line2}`, background: 'transparent', color: C.inkMid, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>{children}</button>
}
function ErrorNote({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: C.danger, background: '#FCE4E8', border: `1px solid ${C.line}`, borderRadius: 8, padding: '9px 12px', lineHeight: 1.45 }}>{children}</div>
}

const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 7, fontSize: 13, fontFamily: 'inherit', background: C.warmWhite, color: C.ink, outline: 'none' }
const ta: React.CSSProperties = { ...inp, resize: 'vertical', lineHeight: 1.5, fontSize: 13 }

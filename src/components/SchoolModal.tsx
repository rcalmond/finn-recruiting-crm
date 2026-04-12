'use client'

import { useState } from 'react'
import type { School, Division, Status, AdmitLikelihood, Category, ActionOwner } from '@/lib/types'
import { useContactLog } from '@/hooks/useRealtimeData'
import { STATUS_COLORS, ADMIT_COLORS, CATEGORY_COLORS, categoryLabel, formatDate, todayStr } from '@/lib/utils'
import ContactLogPanel from './ContactLogPanel'

const STATUSES: Status[] = ['Not Contacted', 'Intro Sent', 'Ongoing Conversation', 'Visit Scheduled', 'Offer', 'Inactive']
const DIVISIONS: Division[] = ['D1', 'D2', 'D3']
const ADMITS: AdmitLikelihood[] = ['Likely', 'Target', 'Reach', 'Far Reach']
const CATEGORIES: Category[] = ['A', 'B', 'C', 'Nope']
const OWNERS: ActionOwner[] = ['Finn', 'Randy']

type Tab = 'info' | 'log'

interface EditProps {
  school: School
  userId: string
  onUpdate: (updates: Partial<School>) => Promise<void>
  onDelete: () => Promise<void>
  onClose: () => void
}

interface AddProps {
  school: null
  userId: string
  onInsert: (school: Omit<School, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  onClose: () => void
}

type Props = EditProps | AddProps

export default function SchoolModal(props: Props) {
  const isEdit = props.school !== null
  const s = props.school
  const today = todayStr()

  const [tab, setTab] = useState<Tab>('info')
  const [name, setName] = useState(s?.name ?? '')
  const [shortName, setShortName] = useState(s?.short_name ?? '')
  const [category, setCategory] = useState<Category>(s?.category ?? 'B')
  const [division, setDivision] = useState<Division>(s?.division ?? 'D3')
  const [conference, setConference] = useState(s?.conference ?? '')
  const [location, setLocation] = useState(s?.location ?? '')
  const [status, setStatus] = useState<Status>(s?.status ?? 'Not Contacted')
  const [lastContact, setLastContact] = useState(s?.last_contact ?? '')
  const [headCoach, setHeadCoach] = useState(s?.head_coach ?? '')
  const [coachEmail, setCoachEmail] = useState(s?.coach_email ?? '')
  const [admit, setAdmit] = useState<AdmitLikelihood | ''>(s?.admit_likelihood ?? 'Target')
  const [rqStatus, setRqStatus] = useState(s?.rq_status ?? '')
  const [videosSent, setVideosSent] = useState(s?.videos_sent ?? false)
  const [notes, setNotes] = useState(s?.notes ?? '')
  const [nextAction, setNextAction] = useState(s?.next_action ?? '')
  const [nextActionOwner, setNextActionOwner] = useState<ActionOwner | ''>(s?.next_action_owner ?? '')
  const [nextActionDue, setNextActionDue] = useState(s?.next_action_due ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { entries: contactLog } = useContactLog(s?.id)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const data = {
      name, short_name: shortName || null, category, division,
      conference: conference || null, location: location || null,
      status, last_contact: lastContact || null, head_coach: headCoach || null,
      coach_email: coachEmail || null,
      admit_likelihood: (admit || null) as AdmitLikelihood | null,
      rq_status: rqStatus || null, videos_sent: videosSent,
      notes: notes || null, next_action: nextAction || null,
      next_action_owner: (nextActionOwner || null) as ActionOwner | null,
      next_action_due: nextActionDue || null,
    }
    if (isEdit) {
      await (props as EditProps).onUpdate(data)
    } else {
      await (props as AddProps).onInsert(data as Omit<School, 'id' | 'created_at' | 'updated_at'>)
    }
    setSaving(false)
    props.onClose()
  }

  const overdue = !!(s?.next_action_due && s.next_action_due < today)

  return (
    <div
      onClick={props.onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 700, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}
      >
        {/* Modal header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
              {isEdit ? s!.name : 'Add School'}
            </h3>
            {isEdit && s!.location && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{s!.location}</div>}
          </div>
          <button onClick={props.onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', padding: 4, fontFamily: 'inherit' }}>&times;</button>
        </div>

        {/* Quick-status badges (edit mode only) */}
        {isEdit && (
          <div style={{ padding: '12px 24px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(() => {
              const sc = STATUS_COLORS[s!.status]
              const ac = s!.admit_likelihood ? ADMIT_COLORS[s!.admit_likelihood] : '#94a3b8'
              const cc = CATEGORY_COLORS[s!.category]
              return (
                <>
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.text }}>{s!.status}</span>
                  {s!.admit_likelihood && <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: ac + '18', color: ac }}>{s!.admit_likelihood}</span>}
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: cc + '14', color: cc }}>{categoryLabel(s!.category)}</span>
                  {s!.division && <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>{s!.division}{s!.conference ? ` · ${s!.conference}` : ''}</span>}
                </>
              )
            })()}
          </div>
        )}

        {/* Tabs (edit mode only) */}
        {isEdit && (
          <div style={{ padding: '12px 24px 0', display: 'flex', gap: 2, background: 'transparent' }}>
            {(['info', 'log'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: tab === t ? 700 : 500, fontFamily: 'inherit',
                  background: tab === t ? '#f1f5f9' : 'transparent',
                  color: tab === t ? '#0f172a' : '#64748b',
                }}
              >
                {t === 'log' ? `Contact Log (${contactLog.length})` : 'Info'}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {tab === 'info' && (
            <form onSubmit={handleSave} id="school-form" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <Field label="School Name" required>
                  <input value={name} onChange={e => setName(e.target.value)} required style={fieldStyle} placeholder="e.g. University of Rochester" />
                </Field>
                <Field label="Short Name">
                  <input value={shortName} onChange={e => setShortName(e.target.value)} style={fieldStyle} placeholder="e.g. Rochester" />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                <Field label="Tier">
                  <select value={category} onChange={e => setCategory(e.target.value as Category)} style={fieldStyle}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                  </select>
                </Field>
                <Field label="Division">
                  <select value={division} onChange={e => setDivision(e.target.value as Division)} style={fieldStyle}>
                    {DIVISIONS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </Field>
                <Field label="Admit Level">
                  <select value={admit} onChange={e => setAdmit(e.target.value as AdmitLikelihood | '')} style={fieldStyle}>
                    <option value="">—</option>
                    {ADMITS.map(a => <option key={a}>{a}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select value={status} onChange={e => setStatus(e.target.value as Status)} style={fieldStyle}>
                    {STATUSES.map(st => <option key={st}>{st}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Location">
                  <input value={location} onChange={e => setLocation(e.target.value)} style={fieldStyle} placeholder="City, ST" />
                </Field>
                <Field label="Conference">
                  <input value={conference} onChange={e => setConference(e.target.value)} style={fieldStyle} placeholder="e.g. UAA" />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Head Coach">
                  <input value={headCoach} onChange={e => setHeadCoach(e.target.value)} style={fieldStyle} />
                </Field>
                <Field label="Coach Email">
                  <input type="email" value={coachEmail} onChange={e => setCoachEmail(e.target.value)} style={fieldStyle} />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <Field label="Last Contact">
                  <input type="date" value={lastContact} onChange={e => setLastContact(e.target.value)} style={fieldStyle} />
                </Field>
                <Field label="RQ Status">
                  <select value={rqStatus} onChange={e => setRqStatus(e.target.value)} style={fieldStyle}>
                    <option value="">—</option>
                    {['To Do', 'Completed', 'Updated', 'Not Available'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Videos Sent">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', paddingTop: 6 }}>
                    <input type="checkbox" checked={videosSent} onChange={e => setVideosSent(e.target.checked)} />
                    Yes
                  </label>
                </Field>
              </div>
              <Field label="Notes">
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
              </Field>

              {/* Next Action */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>NEXT ACTION</div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                  <Field label="Action">
                    <input value={nextAction} onChange={e => setNextAction(e.target.value)} style={fieldStyle} placeholder="e.g. Send wingback reel" />
                  </Field>
                  <Field label="Owner">
                    <select value={nextActionOwner} onChange={e => setNextActionOwner(e.target.value as ActionOwner | '')} style={fieldStyle}>
                      <option value="">—</option>
                      {OWNERS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Due Date">
                    <input type="date" value={nextActionDue} onChange={e => setNextActionDue(e.target.value)} style={fieldStyle} />
                  </Field>
                </div>
              </div>
            </form>
          )}

          {tab === 'log' && isEdit && (
            <ContactLogPanel schools={[]} userId={props.userId} schoolId={s!.id} />
          )}
        </div>

        {/* Footer */}
        {tab === 'info' && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {isEdit && !confirmDelete && (
                <button type="button" onClick={() => setConfirmDelete(true)} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Delete School
                </button>
              )}
              {isEdit && confirmDelete && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#dc2626' }}>Are you sure?</span>
                  <button onClick={(props as EditProps).onDelete} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Yes, delete</button>
                  <button onClick={() => setConfirmDelete(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={props.onClose} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#f1f5f9', color: '#475569' }}>Cancel</button>
              <button form="school-form" type="submit" disabled={saving || !name} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#0f172a', color: '#fff', opacity: saving || !name ? 0.5 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}{required && ' *'}
      </span>
      {children}
    </label>
  )
}

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
  fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#0f172a',
  outline: 'none', boxSizing: 'border-box',
}

'use client'

import { useState } from 'react'
import type { School, Division, Status, AdmitLikelihood, Category, ActionOwner, ActionItem, Coach, CoachRole } from '@/lib/types'
import { useContactLog, useActionItems, useCoaches } from '@/hooks/useRealtimeData'
import { STATUS_COLORS, ADMIT_COLORS, CATEGORY_COLORS, categoryLabel, formatDate } from '@/lib/utils'
import ContactLogPanel from './ContactLogPanel'
import DraftModal from './DraftModal'
import PrepForCallModal from './PrepForCallModal'

const STATUSES: Status[] = ['Not Contacted', 'Intro Sent', 'Ongoing Conversation', 'Visit Scheduled', 'Offer', 'Inactive']
const DIVISIONS: Division[] = ['D1', 'D2', 'D3']
const ADMITS: AdmitLikelihood[] = ['Likely', 'Target', 'Reach', 'Far Reach']
const CATEGORIES: Category[] = ['A', 'B', 'C', 'Nope']
const OWNERS: ActionOwner[] = ['Finn', 'Randy']
const COACH_ROLES: CoachRole[] = ['Head Coach', 'Interim Head Coach', 'Associate Head Coach', 'Assistant Coach', 'Interim Assistant Coach', 'Other']

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
  const [idCamp1, setIdCamp1] = useState(s?.id_camp_1 ?? '')
  const [idCamp2, setIdCamp2] = useState(s?.id_camp_2 ?? '')
  const [idCamp3, setIdCamp3] = useState(s?.id_camp_3 ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [draftingEmail, setDraftingEmail] = useState(false)
  const [preppingCall, setPreppingCall] = useState(false)

  // Action items (edit mode only)
  const { items: actionItems, insertItem, updateItem, deleteItem: deleteActionItem } = useActionItems(s?.id)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ action: string; owner: string; due_date: string }>({ action: '', owner: '', due_date: '' })
  const [addingNew, setAddingNew] = useState(false)
  const [newDraft, setNewDraft] = useState<{ action: string; owner: string; due_date: string }>({ action: '', owner: '', due_date: '' })

  const { entries: contactLog } = useContactLog(s?.id)

  // Coaches (edit mode only)
  const { coaches, insertCoach, updateCoach, deleteCoach, setPrimary } = useCoaches(s?.id)
  const [editingCoachId, setEditingCoachId] = useState<string | null>(null)
  const [coachEditDraft, setCoachEditDraft] = useState<{ name: string; role: CoachRole; email: string }>({ name: '', role: 'Head Coach', email: '' })
  const [addingCoach, setAddingCoach] = useState(false)
  const [newCoachDraft, setNewCoachDraft] = useState<{ name: string; role: CoachRole; email: string }>({ name: '', role: 'Head Coach', email: '' })

  function startEditCoach(coach: Coach) {
    setEditingCoachId(coach.id)
    setCoachEditDraft({ name: coach.name, role: coach.role, email: coach.email ?? '' })
  }

  async function saveEditCoach() {
    if (!editingCoachId || !coachEditDraft.name.trim()) return
    await updateCoach(editingCoachId, {
      name: coachEditDraft.name.trim(),
      role: coachEditDraft.role,
      email: coachEditDraft.email.trim() || null,
    })
    setEditingCoachId(null)
  }

  async function saveNewCoach() {
    if (!newCoachDraft.name.trim() || !s?.id) return
    await insertCoach({
      school_id: s.id,
      name: newCoachDraft.name.trim(),
      role: newCoachDraft.role,
      email: newCoachDraft.email.trim() || null,
      is_primary: coaches.length === 0,   // first coach added becomes primary automatically
      needs_review: false,
      sort_order: coaches.length * 10,
      notes: null,
    })
    setNewCoachDraft({ name: '', role: 'Head Coach', email: '' })
    setAddingCoach(false)
  }

  function startEditItem(item: ActionItem) {
    setEditingItemId(item.id)
    setEditDraft({ action: item.action, owner: item.owner ?? '', due_date: item.due_date ?? '' })
  }

  async function saveEditItem() {
    if (!editingItemId || !editDraft.action.trim()) return
    await updateItem(editingItemId, {
      action: editDraft.action.trim(),
      owner: (editDraft.owner || null) as 'Finn' | 'Randy' | null,
      due_date: editDraft.due_date || null,
    })
    setEditingItemId(null)
  }

  async function saveNewItem() {
    if (!newDraft.action.trim() || !s?.id) return
    await insertItem({
      school_id: s.id,
      action: newDraft.action.trim(),
      owner: (newDraft.owner || null) as 'Finn' | 'Randy' | null,
      due_date: newDraft.due_date || null,
    })
    setNewDraft({ action: '', owner: '', due_date: '' })
    setAddingNew(false)
  }

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
      notes: notes || null,
      id_camp_1: idCamp1 || null,
      id_camp_2: idCamp2 || null,
      id_camp_3: idCamp3 || null,
    }
    if (isEdit) {
      await (props as EditProps).onUpdate(data)
    } else {
      await (props as AddProps).onInsert(data as Omit<School, 'id' | 'created_at' | 'updated_at'>)
    }
    setSaving(false)
    props.onClose()
  }

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
            {([
              ['info', 'Info'],
              ['log', `Contact Log (${contactLog.length})`],
            ] as [Tab, string][]).map(([t, label]) => (
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
                {label}
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
              {/* Coaches section (edit mode only) */}
              {isEdit && (
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>
                      COACHES <span style={{ fontWeight: 400, color: '#94a3b8' }}>({coaches.length})</span>
                    </div>
                    {!addingCoach && (
                      <button
                        type="button"
                        onClick={() => { setAddingCoach(true); setNewCoachDraft({ name: '', role: 'Head Coach', email: '' }) }}
                        style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 5, padding: '3px 10px', fontSize: 11.5, cursor: 'pointer', color: '#475569', fontFamily: 'inherit' }}
                      >+ Add</button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {coaches.map(coach => (
                      editingCoachId === coach.id ? (
                        <div key={coach.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 2fr auto auto', gap: 6, alignItems: 'end', background: '#f8fafc', borderRadius: 6, padding: '8px 10px', border: '1px solid #e2e8f0' }}>
                          <input value={coachEditDraft.name} onChange={e => setCoachEditDraft(d => ({ ...d, name: e.target.value }))} style={{ ...fieldStyle, fontSize: 12 }} placeholder="Name" autoFocus />
                          <select value={coachEditDraft.role} onChange={e => setCoachEditDraft(d => ({ ...d, role: e.target.value as CoachRole }))} style={{ ...fieldStyle, fontSize: 12 }}>
                            {COACH_ROLES.map(r => <option key={r}>{r}</option>)}
                          </select>
                          <input type="email" value={coachEditDraft.email} onChange={e => setCoachEditDraft(d => ({ ...d, email: e.target.value }))} style={{ ...fieldStyle, fontSize: 12 }} placeholder="Email (optional)" />
                          <button type="button" onClick={saveEditCoach} style={actionBtnStyle('#0f172a', '#fff')}>Save</button>
                          <button type="button" onClick={() => setEditingCoachId(null)} style={actionBtnStyle('#f1f5f9', '#475569')}>×</button>
                        </div>
                      ) : (
                        <div key={coach.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fafbfc', borderRadius: 6, padding: '8px 10px', border: '1px solid #f1f5f9' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 12.5, color: '#334155', fontWeight: 600 }}>{coach.name}</span>
                            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>{coach.role}</span>
                            {coach.email && <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6 }}>{coach.email}</span>}
                            {coach.needs_review && (
                              <span
                                title="Flagged during backfill — verify name, role, and email"
                                style={{
                                  marginLeft: 6, display: 'inline-block',
                                  padding: '1px 6px', borderRadius: 4,
                                  background: '#fef9c3', color: '#854d0e',
                                  fontSize: 10, fontWeight: 700, border: '1px solid #ca8a04',
                                  cursor: 'help',
                                }}
                              >Needs review</span>
                            )}
                          </div>
                          {coach.is_primary && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#0f172a', background: '#e2e8f0', borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>Primary</span>
                          )}
                          {!coach.is_primary && (
                            <button type="button" onClick={() => s?.id && setPrimary(coach.id)} style={{ ...actionBtnStyle('#f8fafc', '#64748b'), fontSize: 10, border: '1px solid #e2e8f0' }}>
                              Set primary
                            </button>
                          )}
                          <button type="button" onClick={() => startEditCoach(coach)} style={{ ...actionBtnStyle('#f1f5f9', '#475569'), fontSize: 11 }}>Edit</button>
                          <button type="button" onClick={() => deleteCoach(coach.id)} style={{ ...actionBtnStyle('#fef2f2', '#dc2626'), fontSize: 11 }}>✕</button>
                        </div>
                      )
                    ))}

                    {addingCoach && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 2fr auto auto', gap: 6, alignItems: 'end', background: '#eff6ff', borderRadius: 6, padding: '8px 10px', border: '1px dashed #93c5fd' }}>
                        <input value={newCoachDraft.name} onChange={e => setNewCoachDraft(d => ({ ...d, name: e.target.value }))} style={{ ...fieldStyle, fontSize: 12 }} placeholder="Coach name" autoFocus />
                        <select value={newCoachDraft.role} onChange={e => setNewCoachDraft(d => ({ ...d, role: e.target.value as CoachRole }))} style={{ ...fieldStyle, fontSize: 12 }}>
                          {COACH_ROLES.map(r => <option key={r}>{r}</option>)}
                        </select>
                        <input type="email" value={newCoachDraft.email} onChange={e => setNewCoachDraft(d => ({ ...d, email: e.target.value }))} style={{ ...fieldStyle, fontSize: 12 }} placeholder="Email (optional)" />
                        <button type="button" onClick={saveNewCoach} disabled={!newCoachDraft.name.trim()} style={actionBtnStyle('#0f172a', '#fff')}>Add</button>
                        <button type="button" onClick={() => setAddingCoach(false)} style={actionBtnStyle('#f1f5f9', '#475569')}>×</button>
                      </div>
                    )}

                    {coaches.length === 0 && !addingCoach && (
                      <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No coach records yet. Click + Add to create one.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Legacy fields — read only */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Legacy fields (read only — coach data now lives in Coaches above)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Head Coach (legacy)">
                    <input value={headCoach} readOnly style={{ ...fieldStyle, background: '#f8fafc', color: '#94a3b8', cursor: 'default' }} />
                  </Field>
                  <Field label="Coach Email (legacy)">
                    <input value={coachEmail} readOnly style={{ ...fieldStyle, background: '#f8fafc', color: '#94a3b8', cursor: 'default' }} />
                  </Field>
                </div>
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

              {/* ID Camps */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>ID CAMPS</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <Field label="Camp Date 1">
                    <input type="date" value={idCamp1} onChange={e => setIdCamp1(e.target.value)} style={fieldStyle} />
                  </Field>
                  <Field label="Camp Date 2">
                    <input type="date" value={idCamp2} onChange={e => setIdCamp2(e.target.value)} style={fieldStyle} />
                  </Field>
                  <Field label="Camp Date 3">
                    <input type="date" value={idCamp3} onChange={e => setIdCamp3(e.target.value)} style={fieldStyle} />
                  </Field>
                </div>
              </div>

              {/* Action Items (edit mode only) */}
              {isEdit && (
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>
                      ACTION ITEMS <span style={{ fontWeight: 400, color: '#94a3b8' }}>({actionItems.length}/3)</span>
                    </div>
                    {actionItems.length < 3 && !addingNew && (
                      <button
                        type="button"
                        onClick={() => { setAddingNew(true); setNewDraft({ action: '', owner: '', due_date: '' }) }}
                        style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 5, padding: '3px 10px', fontSize: 11.5, cursor: 'pointer', color: '#475569', fontFamily: 'inherit' }}
                      >
                        + Add
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {actionItems.map(item => (
                      editingItemId === item.id ? (
                        <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto auto', gap: 6, alignItems: 'end', background: '#f8fafc', borderRadius: 6, padding: '8px 10px', border: '1px solid #e2e8f0' }}>
                          <input value={editDraft.action} onChange={e => setEditDraft(d => ({ ...d, action: e.target.value }))} style={{ ...fieldStyle, fontSize: 12 }} placeholder="Action" autoFocus />
                          <select value={editDraft.owner} onChange={e => setEditDraft(d => ({ ...d, owner: e.target.value }))} style={{ ...fieldStyle, fontSize: 12 }}>
                            <option value="">—</option>
                            {OWNERS.map(o => <option key={o}>{o}</option>)}
                          </select>
                          <input type="date" value={editDraft.due_date} onChange={e => setEditDraft(d => ({ ...d, due_date: e.target.value }))} style={{ ...fieldStyle, fontSize: 12 }} />
                          <button type="button" onClick={saveEditItem} style={actionBtnStyle('#0f172a', '#fff')}>Save</button>
                          <button type="button" onClick={() => setEditingItemId(null)} style={actionBtnStyle('#f1f5f9', '#475569')}>×</button>
                        </div>
                      ) : (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fafbfc', borderRadius: 6, padding: '8px 10px', border: '1px solid #f1f5f9' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 12.5, color: '#334155' }}>{item.action}</span>
                          </div>
                          {item.owner && (
                            <span style={{ fontSize: 11, fontWeight: 600, color: item.owner === 'Finn' ? '#2563eb' : '#059669', flexShrink: 0 }}>{item.owner}</span>
                          )}
                          {item.due_date && (
                            <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>{formatDate(item.due_date)}</span>
                          )}
                          <button type="button" onClick={() => startEditItem(item)} style={{ ...actionBtnStyle('#f1f5f9', '#475569'), fontSize: 11 }}>Edit</button>
                          <button type="button" onClick={() => deleteActionItem(item.id)} style={{ ...actionBtnStyle('#fef2f2', '#dc2626'), fontSize: 11 }}>✕</button>
                        </div>
                      )
                    ))}

                    {addingNew && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto auto', gap: 6, alignItems: 'end', background: '#eff6ff', borderRadius: 6, padding: '8px 10px', border: '1px dashed #93c5fd' }}>
                        <input value={newDraft.action} onChange={e => setNewDraft(d => ({ ...d, action: e.target.value }))} style={{ ...fieldStyle, fontSize: 12 }} placeholder="Action description" autoFocus />
                        <select value={newDraft.owner} onChange={e => setNewDraft(d => ({ ...d, owner: e.target.value }))} style={{ ...fieldStyle, fontSize: 12 }}>
                          <option value="">—</option>
                          {OWNERS.map(o => <option key={o}>{o}</option>)}
                        </select>
                        <input type="date" value={newDraft.due_date} onChange={e => setNewDraft(d => ({ ...d, due_date: e.target.value }))} style={{ ...fieldStyle, fontSize: 12 }} />
                        <button type="button" onClick={saveNewItem} disabled={!newDraft.action.trim()} style={actionBtnStyle('#0f172a', '#fff')}>Add</button>
                        <button type="button" onClick={() => setAddingNew(false)} style={actionBtnStyle('#f1f5f9', '#475569')}>×</button>
                      </div>
                    )}

                    {actionItems.length === 0 && !addingNew && (
                      <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No action items yet.</div>
                    )}
                  </div>
                </div>
              )}
            </form>
          )}

          {tab === 'log' && isEdit && (
            <ContactLogPanel schools={[]} userId={props.userId} schoolId={s!.id} />
          )}
        </div>

        {draftingEmail && isEdit && (() => {
          const pc = coaches.find(c => c.is_primary) ?? coaches[0] ?? null
          return pc ? (
            <DraftModal
              mode={{
                kind: 'fresh',
                schoolId: s!.id,
                coachId: pc.id,
                schoolName: s!.name,
                coachName: pc.name,
              }}
              userId={props.userId}
              onClose={() => setDraftingEmail(false)}
            />
          ) : null
        })()}
        {preppingCall && isEdit && (
          <PrepForCallModal
            school={s!}
            onClose={() => setPreppingCall(false)}
          />
        )}

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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {isEdit && (() => {
                const onHold = s!.name === 'Colorado School of Mines'
                const notContacted = s!.status === 'Not Contacted'
                return (
                  <>
                    <span title={onHold ? 'Outreach on hold — HC vacancy' : notContacted ? 'No contact yet — reach out first' : undefined} style={{ display: 'inline-block' }}>
                      <button
                        type="button"
                        onClick={() => setPreppingCall(true)}
                        disabled={onHold || notContacted}
                        style={{ padding: '7px 14px', borderRadius: 6, border: 'none', cursor: (onHold || notContacted) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#0369a1', color: '#fff', opacity: (onHold || notContacted) ? 0.4 : 1 }}
                      >
                        Prep for call
                      </button>
                    </span>
                    <span title={onHold ? 'Outreach on hold — HC vacancy' : undefined} style={{ display: 'inline-block' }}>
                      <button
                        type="button"
                        onClick={() => setDraftingEmail(true)}
                        disabled={onHold}
                        style={{ padding: '7px 14px', borderRadius: 6, border: 'none', cursor: onHold ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#7c3aed', color: '#fff', opacity: onHold ? 0.4 : 1 }}
                      >
                        Draft Email
                      </button>
                    </span>
                  </>
                )
              })()}
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

function actionBtnStyle(bg: string, color: string): React.CSSProperties {
  return { padding: '4px 8px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', background: bg, color, flexShrink: 0 }
}

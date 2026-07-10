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

// ─── Design tokens (matches app design language) ─────────────────────────────
const M = {
  paper:     '#F6F1E8',
  paperDeep: '#EFE8D8',
  ink:       '#0E0E0E',
  inkMid:    '#4A4A4A',
  inkLo:     '#7A7570',
  inkMute:   '#A8A39B',
  line:      '#E2DBC9',
  line2:     '#D3CAB3',
  white:     '#FFFFFF',
  red:       '#C8102E',
  redSoft:   '#FCE4E8',
  teal:      '#00B2A9',
  tealDeep:  '#006A65',
  tealSoft:  '#D7F0ED',
  gold:      '#F6EB61',
  goldDeep:  '#C8B22E',
  goldSoft:  '#FBF3C4',
  goldInk:   '#5A4E0F',
}

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
  const [notes, setNotes] = useState(s?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [draftingEmail, setDraftingEmail] = useState(false)
  const [preppingCall, setPreppingCall] = useState(false)

  // Action items (edit mode only)
  const { items: actionItems, insertItem, updateItem, completeItem: completeActionItem } = useActionItems(s?.id)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ action: string; owner: string; due_date: string }>({ action: '', owner: '', due_date: '' })
  const [addingNew, setAddingNew] = useState(false)
  const [newDraft, setNewDraft] = useState<{ action: string; owner: string; due_date: string }>({ action: '', owner: '', due_date: '' })

  const { entries: contactLog } = useContactLog(s?.id)

  // Coaches (edit mode only)
  const { coaches, archivedCoaches, insertCoach, updateCoach, archiveCoach, unarchiveCoach, setPrimary } = useCoaches(s?.id)
  const [editingCoachId, setEditingCoachId] = useState<string | null>(null)
  const [coachEditDraft, setCoachEditDraft] = useState<{ name: string; role: CoachRole; email: string }>({ name: '', role: 'Head Coach', email: '' })
  const [addingCoach, setAddingCoach] = useState(false)
  const [newCoachDraft, setNewCoachDraft] = useState<{ name: string; role: CoachRole; email: string }>({ name: '', role: 'Head Coach', email: '' })
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

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
      is_primary: coaches.length === 0,
      is_active: true,
      needs_review: false,
      sort_order: coaches.length * 10,
      notes: null,
      archived_at: null,
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
      rq_status: rqStatus || null,
      notes: notes || null,
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
      style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,14,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: M.paper, borderRadius: 14, width: '100%', maxWidth: 700, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(14,14,14,0.18)' }}
      >
        {/* Header */}
        <div style={{ padding: '24px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, fontStyle: 'italic', letterSpacing: '-0.04em', color: M.ink }}>
              {isEdit ? s!.name : 'Add School.'}
              {isEdit && '.'}
            </h2>
            {isEdit && s!.location && <div style={{ fontSize: 12, color: M.inkLo, marginTop: 3, letterSpacing: '-0.01em' }}>{s!.location}</div>}
          </div>
          <button onClick={props.onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: M.inkMute, padding: 4, fontFamily: 'inherit', lineHeight: 1 }}>&times;</button>
        </div>

        {/* Quick-status pills (edit mode only) */}
        {isEdit && (
          <div style={{ padding: '14px 28px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(() => {
              const sc = STATUS_COLORS[s!.status]
              const ac = s!.admit_likelihood ? ADMIT_COLORS[s!.admit_likelihood] : M.inkMute
              const cc = CATEGORY_COLORS[s!.category]
              return (
                <>
                  <span style={pill(sc.bg, sc.text)}>{s!.status}</span>
                  {s!.admit_likelihood && <span style={pill(ac + '18', ac)}>{s!.admit_likelihood}</span>}
                  <span style={pill(cc + '14', cc)}>{categoryLabel(s!.category)}</span>
                  {s!.division && <span style={pill(M.paperDeep, M.inkMid)}>{s!.division}{s!.conference ? ` · ${s!.conference}` : ''}</span>}
                </>
              )
            })()}
          </div>
        )}

        {/* Tabs (edit mode only) */}
        {isEdit && (
          <div style={{ padding: '14px 28px 0', display: 'flex', gap: 2 }}>
            {([
              ['info', 'Info'],
              ['log', `Contact Log (${contactLog.length})`],
            ] as [Tab, string][]).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: tab === t ? 700 : 500, fontFamily: 'inherit',
                  letterSpacing: '-0.01em',
                  background: tab === t ? M.ink : 'transparent',
                  color: tab === t ? M.white : M.inkLo,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 28px' }}>
          {tab === 'info' && (
            <form onSubmit={handleSave} id="school-form" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                <div style={{ borderTop: `1px solid ${M.line}`, paddingTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h3 style={sectionHeader}>Coaches. <span style={{ fontStyle: 'normal', fontWeight: 400, color: M.inkMute, fontSize: 12 }}>({coaches.length})</span></h3>
                    {!addingCoach && (
                      <button
                        type="button"
                        onClick={() => { setAddingCoach(true); setNewCoachDraft({ name: '', role: 'Head Coach', email: '' }) }}
                        style={ghostBtn}
                      >+ Add</button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {coaches.map(coach => (
                      editingCoachId === coach.id ? (
                        <div key={coach.id} style={editRow}>
                          <input value={coachEditDraft.name} onChange={e => setCoachEditDraft(d => ({ ...d, name: e.target.value }))} style={inlineField} placeholder="Name" autoFocus />
                          <select value={coachEditDraft.role} onChange={e => setCoachEditDraft(d => ({ ...d, role: e.target.value as CoachRole }))} style={inlineField}>
                            {COACH_ROLES.map(r => <option key={r}>{r}</option>)}
                          </select>
                          <input type="email" value={coachEditDraft.email} onChange={e => setCoachEditDraft(d => ({ ...d, email: e.target.value }))} style={inlineField} placeholder="Email (optional)" />
                          <button type="button" onClick={saveEditCoach} style={primarySmBtn}>Save</button>
                          <button type="button" onClick={() => setEditingCoachId(null)} style={mutedSmBtn}>&times;</button>
                        </div>
                      ) : confirmArchiveId === coach.id ? (
                        <div key={coach.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: M.goldSoft, borderRadius: 8, padding: '8px 12px', border: `1px solid ${M.goldDeep}40` }}>
                          <div style={{ flex: 1, fontSize: 12, color: M.goldInk }}>
                            Archive {coach.name}? They&apos;ll be hidden from active staff but contact history is preserved.
                          </div>
                          <button type="button" onClick={async () => { await archiveCoach(coach.id); setConfirmArchiveId(null) }} style={{ ...primarySmBtn, background: M.goldInk }}>Archive</button>
                          <button type="button" onClick={() => setConfirmArchiveId(null)} style={mutedSmBtn}>Cancel</button>
                        </div>
                      ) : (
                        <div key={coach.id} style={displayRow}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 13, color: M.ink, fontWeight: 600 }}>{coach.name}</span>
                            <span style={{ fontSize: 11, color: M.inkLo, marginLeft: 6 }}>{coach.role}</span>
                            {coach.email && <span style={{ fontSize: 11, color: M.inkMid, marginLeft: 6 }}>{coach.email}</span>}
                            {coach.needs_review && (
                              <span
                                title="Flagged during backfill — verify name, role, and email"
                                style={{
                                  marginLeft: 6, display: 'inline-block',
                                  padding: '1px 7px', borderRadius: 999,
                                  background: M.goldSoft, color: M.goldInk,
                                  fontSize: 10, fontWeight: 700, border: `1px solid ${M.goldDeep}50`,
                                  cursor: 'help',
                                }}
                              >Needs review</span>
                            )}
                          </div>
                          {coach.is_primary && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: M.ink, background: M.paperDeep, borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>Primary</span>
                          )}
                          {!coach.is_primary && (
                            <button type="button" onClick={() => s?.id && setPrimary(coach.id)} style={{ ...ghostBtn, fontSize: 10, padding: '2px 8px' }}>
                              Set primary
                            </button>
                          )}
                          <button type="button" onClick={() => startEditCoach(coach)} style={mutedSmBtn}>Edit</button>
                          <button type="button" onClick={() => setConfirmArchiveId(coach.id)} title="Archive coach" style={{ ...mutedSmBtn, color: M.inkMute }}>Archive</button>
                        </div>
                      )
                    ))}

                    {addingCoach && (
                      <div key="add-coach" style={addRow}>
                        <input value={newCoachDraft.name} onChange={e => setNewCoachDraft(d => ({ ...d, name: e.target.value }))} style={inlineField} placeholder="Coach name" autoFocus />
                        <select value={newCoachDraft.role} onChange={e => setNewCoachDraft(d => ({ ...d, role: e.target.value as CoachRole }))} style={inlineField}>
                          {COACH_ROLES.map(r => <option key={r}>{r}</option>)}
                        </select>
                        <input type="email" value={newCoachDraft.email} onChange={e => setNewCoachDraft(d => ({ ...d, email: e.target.value }))} style={inlineField} placeholder="Email (optional)" />
                        <button type="button" onClick={saveNewCoach} disabled={!newCoachDraft.name.trim()} style={primarySmBtn}>Add</button>
                        <button type="button" onClick={() => setAddingCoach(false)} style={mutedSmBtn}>&times;</button>
                      </div>
                    )}

                    {coaches.length === 0 && !addingCoach && (
                      <div style={{ fontSize: 12, color: M.inkMute, fontStyle: 'italic' }}>No coach records yet. Click + Add to create one.</div>
                    )}

                    {/* Archived coaches disclosure */}
                    {archivedCoaches.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <button
                          type="button"
                          onClick={() => setShowArchived(o => !o)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: M.inkMute, fontFamily: 'inherit', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <span style={{ display: 'inline-block', transform: showArchived ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
                          Archived coaches ({archivedCoaches.length})
                        </button>
                        {showArchived && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                            {archivedCoaches.map(coach => (
                              <div key={coach.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: M.paperDeep, borderRadius: 8, padding: '6px 12px', border: `1px solid ${M.line}`, opacity: 0.7 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ fontSize: 12, color: M.inkMute, fontStyle: 'italic' }}>{coach.name}</span>
                                  <span style={{ fontSize: 10, color: M.inkMute, marginLeft: 6 }}>{coach.role}</span>
                                  {coach.archived_at && (
                                    <span style={{ fontSize: 10, color: M.inkMute, marginLeft: 6 }}>
                                      Archived {new Date(coach.archived_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                  )}
                                </div>
                                <button type="button" onClick={() => unarchiveCoach(coach.id)} style={{ ...ghostBtn, fontSize: 10, padding: '2px 8px' }}>Unarchive</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

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
              </div>
              <Field label="Notes">
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
              </Field>

              {/* Action Items (edit mode only) */}
              {isEdit && (
                <div style={{ borderTop: `1px solid ${M.line}`, paddingTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h3 style={sectionHeader}>Actions. <span style={{ fontStyle: 'normal', fontWeight: 400, color: M.inkMute, fontSize: 12 }}>({actionItems.length}/3)</span></h3>
                    {actionItems.length < 3 && !addingNew && (
                      <button
                        type="button"
                        onClick={() => { setAddingNew(true); setNewDraft({ action: '', owner: '', due_date: '' }) }}
                        style={ghostBtn}
                      >
                        + Add
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {actionItems.map(item => (
                      editingItemId === item.id ? (
                        <div key={item.id} style={{ ...editRow, gridTemplateColumns: '2fr 1fr 1fr auto auto' }}>
                          <input value={editDraft.action} onChange={e => setEditDraft(d => ({ ...d, action: e.target.value }))} style={inlineField} placeholder="Action" autoFocus />
                          <select value={editDraft.owner} onChange={e => setEditDraft(d => ({ ...d, owner: e.target.value }))} style={inlineField}>
                            <option value="">—</option>
                            {OWNERS.map(o => <option key={o}>{o}</option>)}
                          </select>
                          <input type="date" value={editDraft.due_date} onChange={e => setEditDraft(d => ({ ...d, due_date: e.target.value }))} style={inlineField} />
                          <button type="button" onClick={saveEditItem} style={primarySmBtn}>Save</button>
                          <button type="button" onClick={() => setEditingItemId(null)} style={mutedSmBtn}>&times;</button>
                        </div>
                      ) : (
                        <div key={item.id} style={displayRow}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 13, color: M.ink }}>{item.action}</span>
                          </div>
                          {item.owner && (
                            <span style={{ fontSize: 11, fontWeight: 600, color: item.owner === 'Finn' ? M.tealDeep : M.goldInk, flexShrink: 0 }}>{item.owner}</span>
                          )}
                          {item.due_date && (
                            <span style={{ fontSize: 11, color: M.inkMute, flexShrink: 0 }}>{formatDate(item.due_date)}</span>
                          )}
                          <button type="button" onClick={() => startEditItem(item)} style={mutedSmBtn}>Edit</button>
                          <button type="button" onClick={() => completeActionItem(item.id)} style={{ ...mutedSmBtn, color: M.red }}>✓</button>
                        </div>
                      )
                    ))}

                    {addingNew && (
                      <div style={{ ...addRow, gridTemplateColumns: '2fr 1fr 1fr auto auto' }}>
                        <input value={newDraft.action} onChange={e => setNewDraft(d => ({ ...d, action: e.target.value }))} style={inlineField} placeholder="Action description" autoFocus />
                        <select value={newDraft.owner} onChange={e => setNewDraft(d => ({ ...d, owner: e.target.value }))} style={inlineField}>
                          <option value="">—</option>
                          {OWNERS.map(o => <option key={o}>{o}</option>)}
                        </select>
                        <input type="date" value={newDraft.due_date} onChange={e => setNewDraft(d => ({ ...d, due_date: e.target.value }))} style={inlineField} />
                        <button type="button" onClick={saveNewItem} disabled={!newDraft.action.trim()} style={primarySmBtn}>Add</button>
                        <button type="button" onClick={() => setAddingNew(false)} style={mutedSmBtn}>&times;</button>
                      </div>
                    )}

                    {actionItems.length === 0 && !addingNew && (
                      <div style={{ fontSize: 12, color: M.inkMute, fontStyle: 'italic' }}>No action items yet.</div>
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
          const pc = coaches.find(c => c.is_primary)
            ?? coaches.find(c => c.role?.toLowerCase().includes('head'))
            ?? coaches[0] ?? null
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
            coaches={coaches}
            onClose={() => setPreppingCall(false)}
          />
        )}

        {/* Footer */}
        {tab === 'info' && (
          <div style={{ padding: '16px 28px', borderTop: `1px solid ${M.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {isEdit && !confirmDelete && (
                <button type="button" onClick={() => setConfirmDelete(true)} style={{ background: M.redSoft, color: M.red, border: 'none', borderRadius: 999, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Delete School
                </button>
              )}
              {isEdit && confirmDelete && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: M.red }}>Are you sure?</span>
                  <button onClick={(props as EditProps).onDelete} style={{ background: M.red, color: M.white, border: 'none', borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Yes, delete</button>
                  <button onClick={() => setConfirmDelete(false)} style={{ background: 'none', border: 'none', color: M.inkMute, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
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
                        style={{ ...outlinedBtn, opacity: (onHold || notContacted) ? 0.4 : 1, cursor: (onHold || notContacted) ? 'not-allowed' : 'pointer' }}
                      >
                        Prep for call
                      </button>
                    </span>
                    <span title={onHold ? 'Outreach on hold — HC vacancy' : undefined} style={{ display: 'inline-block' }}>
                      <button
                        type="button"
                        onClick={() => setDraftingEmail(true)}
                        disabled={onHold}
                        style={{ ...outlinedBtn, opacity: onHold ? 0.4 : 1, cursor: onHold ? 'not-allowed' : 'pointer' }}
                      >
                        Draft Email
                      </button>
                    </span>
                  </>
                )
              })()}
              <button type="button" onClick={props.onClose} style={outlinedBtn}>Cancel</button>
              <button form="school-form" type="submit" disabled={saving || !name} style={{ padding: '7px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 650, fontFamily: 'inherit', letterSpacing: '-0.01em', background: M.ink, color: M.white, opacity: saving || !name ? 0.4 : 1 }}>
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
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: M.inkLo, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}{required && ' *'}
      </span>
      {children}
    </label>
  )
}

// ─── Shared style objects ────────────────────────────────────────────────────

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: `1px solid ${M.line}`, borderRadius: 8,
  fontSize: 13, fontFamily: 'inherit', background: M.white, color: M.ink,
  outline: 'none', boxSizing: 'border-box',
}

const inlineField: React.CSSProperties = { ...fieldStyle, fontSize: 12, padding: '6px 8px' }

const sectionHeader: React.CSSProperties = {
  margin: 0, fontSize: 14, fontWeight: 700, fontStyle: 'italic',
  letterSpacing: '-0.03em', color: M.ink,
}

const displayRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: M.white, borderRadius: 8, padding: '8px 12px',
  border: `1px solid ${M.line}`,
}

const editRow: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '2fr 1.5fr 2fr auto auto',
  gap: 6, alignItems: 'end',
  background: M.paperDeep, borderRadius: 8, padding: '8px 12px',
  border: `1px solid ${M.line2}`,
}

const addRow: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '2fr 1.5fr 2fr auto auto',
  gap: 6, alignItems: 'end',
  background: M.tealSoft, borderRadius: 8, padding: '8px 12px',
  border: `1px dashed ${M.teal}50`,
}

const primarySmBtn: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
  fontSize: 11, fontWeight: 650, fontFamily: 'inherit', flexShrink: 0,
  background: M.ink, color: M.white,
}

const mutedSmBtn: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
  fontSize: 11, fontWeight: 600, fontFamily: 'inherit', flexShrink: 0,
  background: M.paperDeep, color: M.inkLo,
}

const ghostBtn: React.CSSProperties = {
  background: 'none', border: `1px solid ${M.line2}`, borderRadius: 999,
  padding: '3px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
  color: M.inkMid, fontFamily: 'inherit',
}

const outlinedBtn: React.CSSProperties = {
  padding: '7px 16px', borderRadius: 999, cursor: 'pointer',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit', letterSpacing: '-0.01em',
  background: 'transparent', color: M.inkMid,
  border: `1.3px solid ${M.line2}`,
}

function pill(bg: string, fg: string): React.CSSProperties {
  return { padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 650, background: bg, color: fg, letterSpacing: '-0.01em' }
}

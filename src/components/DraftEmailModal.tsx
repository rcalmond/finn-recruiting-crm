'use client'

import { useState } from 'react'
import type { School } from '@/lib/types'
import type { EmailType } from '@/lib/prompts'
import { useContactLog } from '@/hooks/useRealtimeData'
import { createClient } from '@/lib/supabase/client'
import { todayStr } from '@/lib/utils'

const EMAIL_TYPES: { value: EmailType; label: string }[] = [
  { value: 'first_contact', label: 'First Contact / Introduction' },
  { value: 'wingback_update', label: 'Wingback Reel Update' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'post_camp', label: 'Post Camp Thank You' },
  { value: 'visit_request', label: 'Visit Request' },
  { value: 'academic_update', label: 'Academic / Season Update' },
  { value: 'reply', label: 'Reply to Coach' },
]

interface Props {
  school: School
  userId: string
  onClose: () => void
  initialEmailType?: EmailType
  initialCoachMessage?: string
  onOutreachLogged?: () => void
}

export default function DraftEmailModal({ school, userId, onClose, initialEmailType, initialCoachMessage, onOutreachLogged }: Props) {
  const { entries } = useContactLog(school.id)
  const recentLogs = entries.slice(0, 5)

  const [emailType, setEmailType] = useState<EmailType>(initialEmailType ?? 'first_contact')
  const [coachMessage, setCoachMessage] = useState(initialCoachMessage ?? '')
  const [additionalContext, setAdditionalContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedSubject, setCopiedSubject] = useState(false)
  const [copiedBody, setCopiedBody] = useState(false)
  const [logState, setLogState] = useState<'idle' | 'logging' | 'logged'>('idle')

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    setDraft(null)
    try {
      const res = await fetch('/api/draft-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailType,
          school,
          recentLogs,
          coachMessage: emailType === 'reply' ? coachMessage : undefined,
          additionalContext: additionalContext || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Draft failed')
      setDraft(json)
      setLogState('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function copySubject() {
    if (!draft) return
    navigator.clipboard.writeText(draft.subject).then(() => {
      setCopiedSubject(true)
      setTimeout(() => setCopiedSubject(false), 2000)
    })
  }

  function copyBody() {
    if (!draft) return
    navigator.clipboard.writeText(draft.body).then(() => {
      setCopiedBody(true)
      setTimeout(() => setCopiedBody(false), 2000)
    })
  }

  async function handleLogOutreach() {
    if (!draft) return
    setLogState('logging')
    const supabase = createClient()
    await supabase.from('contact_log').insert({
      school_id: school.id,
      date: todayStr(),
      channel: 'Email',
      direction: 'Outbound',
      summary: draft.subject,
      coach_name: school.head_coach || null,
      created_by: userId,
    })
    setLogState('logged')
    onOutreachLogged?.()
  }

  const canGenerate = emailType !== 'reply' || coachMessage.trim().length > 0

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Draft Email</h3>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{school.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', padding: 4, lineHeight: 1 }}>&times;</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Email type */}
          <div>
            <Label>Email Type</Label>
            <select
              value={emailType}
              onChange={e => { setEmailType(e.target.value as EmailType); setDraft(null); setError(null) }}
              style={fieldStyle}
            >
              {EMAIL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Coach message (reply only) */}
          {emailType === 'reply' && (
            <div>
              <Label required>Paste coach&apos;s message here</Label>
              <textarea
                value={coachMessage}
                onChange={e => setCoachMessage(e.target.value)}
                rows={5}
                placeholder="Paste the coach's email or message..."
                style={{ ...fieldStyle, resize: 'vertical' }}
              />
            </div>
          )}

          {/* Additional context */}
          <div>
            <Label>Additional context <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span></Label>
            <textarea
              value={additionalContext}
              onChange={e => setAdditionalContext(e.target.value)}
              rows={2}
              placeholder="e.g. mention the Olimpico goal, reference their 3-4-3 press system..."
              style={{ ...fieldStyle, resize: 'vertical' }}
            />
          </div>

          {/* Context hint */}
          {recentLogs.length > 0 && (
            <div style={{ fontSize: 11.5, color: '#64748b', background: '#f8fafc', borderRadius: 6, padding: '8px 12px', border: '1px solid #f1f5f9' }}>
              Using {recentLogs.length} recent contact log {recentLogs.length === 1 ? 'entry' : 'entries'} for context.
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ fontSize: 12.5, color: '#dc2626', background: '#fef2f2', borderRadius: 6, padding: '10px 14px', border: '1px solid #fecaca' }}>
              {error}
            </div>
          )}

          {/* Draft output */}
          {draft && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>

              {/* Subject */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Label>Subject</Label>
                  <button onClick={copySubject} style={copyBtnStyle(copiedSubject)}>
                    {copiedSubject ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <input
                  readOnly
                  value={draft.subject}
                  style={{ ...fieldStyle, background: '#f8fafc', color: '#334155', cursor: 'text' }}
                />
              </div>

              {/* Body */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Label>Body</Label>
                  <button onClick={copyBody} style={copyBtnStyle(copiedBody)}>
                    {copiedBody ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={draft.body}
                  rows={12}
                  style={{ ...fieldStyle, background: '#f8fafc', color: '#334155', cursor: 'text', resize: 'vertical', lineHeight: 1.6 }}
                />
              </div>

              {/* Log outreach */}
              <div>
                {logState === 'logged' ? (
                  <div style={{ fontSize: 12.5, color: '#059669', fontWeight: 600 }}>Logged to contact log.</div>
                ) : (
                  <button
                    onClick={handleLogOutreach}
                    disabled={logState === 'logging'}
                    style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#475569', opacity: logState === 'logging' ? 0.5 : 1 }}
                  >
                    {logState === 'logging' ? 'Logging…' : 'Log this outreach'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={cancelBtnStyle}>Close</button>
          {draft && (
            <button
              onClick={handleGenerate}
              disabled={loading || !canGenerate}
              style={{ ...generateBtnStyle, background: '#475569', opacity: loading || !canGenerate ? 0.5 : 1 }}
            >
              {loading ? 'Generating…' : 'Regenerate'}
            </button>
          )}
          {!draft && (
            <button
              onClick={handleGenerate}
              disabled={loading || !canGenerate}
              style={{ ...generateBtnStyle, opacity: loading || !canGenerate ? 0.5 : 1 }}
            >
              {loading ? 'Generating…' : 'Generate Draft'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
      {children}{required && <span style={{ color: '#dc2626' }}> *</span>}
    </span>
  )
}

function copyBtnStyle(copied: boolean): React.CSSProperties {
  return {
    padding: '3px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
    fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
    background: copied ? '#059669' : '#eff6ff',
    color: copied ? '#fff' : '#2563eb',
    transition: 'background 0.2s',
  }
}

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
  fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#0f172a',
  outline: 'none', boxSizing: 'border-box',
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#f1f5f9', color: '#475569',
}

const generateBtnStyle: React.CSSProperties = {
  padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#7c3aed', color: '#fff',
}

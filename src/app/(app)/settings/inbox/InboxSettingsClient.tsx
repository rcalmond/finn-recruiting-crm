'use client'

import { useState } from 'react'
import { SettingsMasthead, SP } from '@/components/settings/SettingsChrome'

export interface InboundAddressRow {
  id: string
  address: string
  label: string | null
  status: string
  verification_code: string | null
  verification_received_at: string | null
  verified_at: string | null
  created_at: string
}
export interface SendingAddressRow {
  id: string
  address: string
  label: string | null
  source: string | null
}

export default function InboxSettingsClient({
  inbound, sending,
}: { inbound: InboundAddressRow[]; sending: SendingAddressRow[] }) {
  const [copied, setCopied] = useState(false)
  const primary = inbound.find(a => a.status === 'active') ?? null

  return (
    <div style={{ minHeight: '100vh', background: SP.paper, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 20px 80px' }}>
        <SettingsMasthead
          title="Your inbox"
          subtitle="Coach mail reaches your timeline by forwarding to this address. Three steps, once."
        />

        {/* The address */}
        <div style={{ background: SP.white, border: `1px solid ${SP.line}`, borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 650, color: SP.ink, marginBottom: 8 }}>Your inbox address</div>
          {primary ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <code
                onClick={async () => {
                  try { await navigator.clipboard.writeText(primary.address); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* noop */ }
                }}
                title="Click to copy"
                style={{
                  background: copied ? '#DCFCE7' : SP.paperDeep, padding: '6px 10px', borderRadius: 6,
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 13, cursor: 'pointer', color: SP.ink,
                }}
              >
                {copied ? 'copied!' : primary.address}
              </code>
              {primary.verified_at && (
                <span style={{ fontSize: 11.5, fontWeight: 650, color: SP.tealDeep }}>verified</span>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: SP.inkLo }}>
              No inbox address yet — it&apos;s created when your family is set up.
            </div>
          )}
        </div>

        {/* Verification code */}
        {primary?.verification_code && (
          <div style={{
            background: SP.tealSoft, border: '1px solid #CFE0D5', borderRadius: 14,
            padding: '16px 20px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 12, fontWeight: 650, color: SP.ink }}>Gmail confirmation code</div>
            <div style={{
              fontSize: 22, fontWeight: 800, letterSpacing: '0.04em', color: SP.ink,
              fontFamily: 'ui-monospace, SFMono-Regular, monospace', marginTop: 6,
            }}>
              {primary.verification_code}
            </div>
            <div style={{ fontSize: 12, color: SP.inkMid, marginTop: 6, lineHeight: 1.5 }}>
              Paste this into Gmail&apos;s forwarding confirmation box
              {primary.verification_received_at ? ` (arrived ${new Date(primary.verification_received_at).toLocaleString()})` : ''}.
            </div>
          </div>
        )}

        {/* The three steps — all required */}
        <div style={{ background: SP.white, border: `1px solid ${SP.line}`, borderRadius: 14, padding: '20px', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, fontStyle: 'italic', color: SP.ink, marginBottom: 4 }}>
            Setup<span style={{ color: SP.teal }}>.</span>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: SP.inkLo }}>
            All three are required. Skip the third and only half your conversations arrive.
          </p>
          <Step n={1} title="Forward your mail to the address above">
            In Gmail, Settings → Forwarding and POP/IMAP → Add a forwarding address. Paste your inbox address.
          </Step>
          <Step n={2} title="Return the confirmation code">
            Google emails a code to that address. It appears in this page the moment it lands — paste it back into Gmail, then choose to forward a copy of incoming mail.
          </Step>
          <Step n={3} title="CC your inbox address on SportsRecruits sends" required>
            SportsRecruits only tells us about messages you CC. Without this your coaches&apos; replies arrive but your own outreach never does, and every read of the conversation sees one side.
          </Step>
        </div>

        {/* Sending addresses */}
        <div style={{ background: SP.white, border: `1px solid ${SP.line}`, borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 650, color: SP.ink, marginBottom: 6 }}>Addresses you send from</div>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: SP.inkLo, lineHeight: 1.5 }}>
            These decide whether a message is read as yours or as a coach&apos;s. A missing address means your own email is filed as though a coach sent it.
          </p>
          {sending.length === 0 ? (
            <div style={{ fontSize: 12.5, color: SP.red }}>
              None registered — direction detection is paused until at least one exists.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {sending.map(s => (
                <span key={s.id} style={{
                  fontSize: 11.5, fontWeight: 600, background: SP.paperDeep, color: SP.ink,
                  border: `1px solid ${SP.line}`, borderRadius: 999, padding: '3px 10px',
                }}>
                  {s.address}{s.label ? ` · ${s.label}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>

        {inbound.filter(a => a.status !== 'active').length > 0 && (
          <details style={{ marginTop: 18 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 650, color: SP.inkLo }}>Retired addresses</summary>
            <div style={{ marginTop: 8 }}>
              {inbound.filter(a => a.status !== 'active').map(a => (
                <div key={a.id} style={{ fontSize: 12, color: SP.inkMute, padding: '4px 0' }}>{a.address}</div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

function Step({ n, title, required, children }: { n: number; title: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%', background: SP.ink, color: SP.white,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, flexShrink: 0,
      }}>{n}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 650, color: SP.ink }}>
          {title}{required && <span style={{ color: SP.red, fontWeight: 700 }}> — required</span>}
        </div>
        <div style={{ fontSize: 12.5, color: SP.inkMid, marginTop: 3, lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  )
}

'use client'

/**
 * CampDocView — Phase 6. Read-only HTML render of a validated CampDoc, plus the print
 * stylesheet (US Letter). This is presentation only: it renders exactly the frozen
 * schema and tolerates null content and any optional section being absent. It does NOT
 * defensively paper over a malformed document — the generation endpoint validates
 * shape before persisting, so a document that reaches here is well-formed.
 *
 * Brand: masthead bold italic + green trailing period; The Plan carries the numbered-
 * act ghost-numeral ramp (Pitch Green is chrome here); Where You Stand + The Mission
 * carry a Regista attribution and stay in the ink/charcoal register (never green).
 * DATA-COLOR FIREWALL: nothing encodes data as color — classifications are text
 * labels, not chips.
 */

import type { CampDoc } from '@/lib/camp-doc'

const G = {
  warmWhite: '#FFFDF9', cream: '#FBF6EC', paper: '#F6F1E8', ink: '#1A1A1A', inkMid: '#3A3A3A',
  muted: '#6B655A', faint: '#8A8478', line: '#E2DBC9', line2: '#D3CAB3', pitch: '#1F6B48', pitchGhost: '#BFD9CB',
}

function Paras({ text, style }: { text: string; style?: React.CSSProperties }) {
  return <>{(text || '').split('\n\n').filter(p => p.trim()).map((p, i) => (
    <p key={i} style={{ margin: '0 0 10px', lineHeight: 1.55, color: G.ink, ...style }}>{p.trim()}</p>
  ))}</>
}

function Eyebrow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: G.faint, ...style }}>{children}</div>
}

function SectionTitle({ title, attribution }: { title: string; attribution?: string }) {
  return (
    <div className="tb-section-title" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, margin: '30px 0 12px', borderBottom: `1.5px solid ${G.ink}`, paddingBottom: 6 }}>
      <h2 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: G.ink, letterSpacing: '-0.01em' }}>{title}</h2>
      {attribution && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: G.muted }}>{attribution}</span>}
    </div>
  )
}

export default function CampDocView({ content }: { content: unknown | null }) {
  if (!content) return null
  const d = content as CampDoc
  const M = d.masthead
  const w = d.where_you_stand
  const mi = d.the_mission
  const staff = Array.isArray(d.the_staff) ? d.the_staff : []

  return (
    <div className="tb-campdoc" style={{ background: G.warmWhite, color: G.ink, border: `1px solid ${G.line}`, borderRadius: 10, padding: '38px 44px', marginTop: 14, maxWidth: 760, fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>
      <style>{PRINT_CSS}</style>

      {/* ── Masthead ── */}
      <Eyebrow>Camp Prep · {M?.school}</Eyebrow>
      <h1 style={{ margin: '8px 0 0', fontSize: 40, fontWeight: 800, fontStyle: 'italic', letterSpacing: '-0.03em', lineHeight: 1.02, color: G.ink }}>
        {M?.camp}<span style={{ color: G.pitch }}>.</span>
      </h1>
      <div style={{ marginTop: 8, fontSize: 14, color: G.muted }}>{M?.player} — {M?.dates}</div>
      {(M?.venue || M?.surface) && <div style={{ marginTop: 3, fontSize: 12.5, color: G.faint }}>{[M?.venue, M?.surface].filter(Boolean).join(' · ')}</div>}
      {M?.framing && <p style={{ margin: '16px 0 0', fontSize: 15.5, fontStyle: 'italic', lineHeight: 1.45, color: G.ink }}>{M.framing}</p>}

      {/* ── Where You Stand (Regista, ink register) ── */}
      {w && <>
        <SectionTitle title="Where You Stand" attribution="REGISTA" />
        <Paras text={w.read} />
        {w.coach_touchpoints?.length > 0 && (
          <div style={{ margin: '14px 0 6px' }}>
            <Eyebrow style={{ marginBottom: 8 }}>The touchpoints</Eyebrow>
            {w.coach_touchpoints.map((t, i) => (
              <div key={i} style={{ padding: '7px 0', borderTop: i === 0 ? 'none' : `1px solid ${G.line}` }}>
                <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 700 }}>{t.date}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: G.muted, margin: '0 8px' }}>{(t.classification || '').toUpperCase()}</span>
                  <span>{t.what}</span>
                </div>
                {t.quote && <div style={{ margin: '3px 0 0 4px', paddingLeft: 12, borderLeft: `2px solid ${G.line2}`, fontStyle: 'italic', color: G.muted, fontSize: 13 }}>&ldquo;{t.quote}&rdquo;</div>}
              </div>
            ))}
          </div>
        )}
        <MiniRow label="Opened by" value={w.relationship_opened_by} />
        <Eyebrow style={{ margin: '14px 0 5px' }}>Advancement</Eyebrow>
        <Paras text={w.advancement} />
        <Eyebrow style={{ margin: '14px 0 5px' }}>Not yet</Eyebrow>
        <Paras text={w.not_yet} />
        <p style={{ margin: '14px 0 0', fontSize: 15, fontWeight: 700, lineHeight: 1.45, color: G.ink }}>{w.verdict}</p>
      </>}

      {/* ── The Mission (Regista, ink register) ── */}
      {mi && <>
        <SectionTitle title="The Mission" attribution="REGISTA" />
        {mi.rubric_quote?.quote && (
          <blockquote style={{ margin: '0 0 14px', paddingLeft: 16, borderLeft: `3px solid ${G.pitch}` }}>
            <div style={{ fontSize: 16, fontStyle: 'italic', lineHeight: 1.45, color: G.ink }}>&ldquo;{mi.rubric_quote.quote}&rdquo;</div>
            <div style={{ marginTop: 6, fontSize: 12, color: G.muted }}>— {mi.rubric_quote.who}{mi.rubric_quote.when ? `, ${mi.rubric_quote.when}` : ''}</div>
          </blockquote>
        )}
        <Paras text={mi.mission} />
        <Eyebrow style={{ margin: '14px 0 5px' }}>Calibration</Eyebrow>
        <Paras text={mi.calibration} />
      </>}

      {/* ── The Staff (omitted when absent; angle omitted per-coach when absent) ── */}
      {staff.length > 0 && <>
        <SectionTitle title="The Staff" />
        {staff.map((c, i) => (
          <div key={i} style={{ margin: '0 0 12px' }}>
            <div style={{ fontSize: 15 }}>
              <span style={{ fontWeight: 700 }}>{c.name}</span>
              <span style={{ color: G.muted, fontSize: 13 }}> · {c.role}</span>
              {c.primary_relationship && <span style={{ color: G.faint, fontSize: 12, fontStyle: 'italic' }}> · your primary contact</span>}
            </div>
            {c.your_angle && <div style={{ marginTop: 3, fontSize: 13.5, lineHeight: 1.5, color: G.ink }}>{c.your_angle}</div>}
          </div>
        ))}
      </>}

      {/* ── The Plan — ghost-numeral ramp (Pitch Green chrome) ── */}
      {d.the_plan?.length > 0 && <>
        <SectionTitle title="The Plan" />
        {d.the_plan.map((day, i) => (
          <div key={i} className="tb-day" style={{ marginBottom: 20 }}>
            <div className="tb-day-header" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span aria-hidden style={{ fontSize: 40, fontWeight: 800, fontStyle: 'italic', lineHeight: 0.8, color: G.pitchGhost, minWidth: 34 }}>{i + 1}</span>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 750, color: G.ink }}>{day.label || `${day.date} — ${day.descriptor}`}</h3>
            </div>
            <div style={{ paddingLeft: 46 }}>
              {(day.blocks || []).map((b, j) => (
                <div key={j} className="tb-block" style={{ marginBottom: 9 }}>
                  <div style={{ fontSize: 13.5 }}>
                    {b.time && <span style={{ fontWeight: 700, color: G.pitch }}>{b.time}  </span>}
                    <span style={{ fontWeight: 650 }}>{b.activity}</span>
                  </div>
                  <div style={{ fontSize: 13, color: G.muted, lineHeight: 1.5 }}>{b.guidance}</div>
                </div>
              ))}
              {day.sleep && <MiniRow label="Sleep" value={day.sleep} tight />}
              {day.recovery && <MiniRow label="Recovery" value={day.recovery} tight />}
            </div>
          </div>
        ))}
      </>}

      {/* ── Before You Leave ── */}
      {d.before_leaving && <>
        <SectionTitle title="Before You Leave" />
        <MiniRow label="Find first" value={d.before_leaving.coach_to_find} />
        <p style={{ margin: '6px 0 12px', fontSize: 14, lineHeight: 1.5 }}>{d.before_leaving.opening_line}</p>
        <blockquote style={{ margin: '0 0 12px', paddingLeft: 16, borderLeft: `3px solid ${G.pitch}`, fontSize: 16, fontStyle: 'italic', lineHeight: 1.45, color: G.ink }}>
          &ldquo;{d.before_leaving.next_step_question}&rdquo;
        </blockquote>
        {d.before_leaving.follow_up && (
          <div style={{ fontSize: 13, color: G.ink }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: G.faint }}>FOLLOW UP  </span>
            Email {d.before_leaving.follow_up.who} by {d.before_leaving.follow_up.send_date} — reference {d.before_leaving.follow_up.reference}.
          </div>
        )}
      </>}

      {/* ── Footer ── */}
      {d.footer && (
        <div style={{ marginTop: 28, paddingTop: 16, borderTop: `2px solid ${G.pitch}`, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 15.5, fontWeight: 700, fontStyle: 'italic', lineHeight: 1.45, color: G.ink }}>{d.footer}</p>
        </div>
      )}
    </div>
  )
}

function MiniRow({ label, value, tight }: { label: string; value: string; tight?: boolean }) {
  return (
    <div style={{ margin: tight ? '3px 0' : '8px 0', fontSize: 13.5, lineHeight: 1.5 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: G.faint }}>{label.toUpperCase()}  </span>
      <span>{value}</span>
    </div>
  )
}

// Print: US Letter, doc only (no nav/buttons), no orphaned day headers, no split blocks.
const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 0.75in; }
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  .tb-campdoc, .tb-campdoc * { visibility: visible !important; }
  .tb-campdoc { position: absolute !important; left: 0; top: 0; width: 100%; max-width: none !important;
    margin: 0 !important; padding: 0 !important; border: none !important; border-radius: 0 !important; background: #fff !important; }
  .tb-noprint { display: none !important; }
  .tb-section-title { break-after: avoid-page; page-break-after: avoid; }
  .tb-day-header { break-after: avoid-page; page-break-after: avoid; }
  .tb-block { break-inside: avoid-page; page-break-inside: avoid; }
  h1, h2, h3 { break-after: avoid-page; }
}
`

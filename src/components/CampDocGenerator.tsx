'use client'

import { useState } from 'react'
import CampDocView from '@/components/CampDocView'

// Throughball chrome. Controls only; the document itself renders via CampDocView.
//
// Phase 5.5: the document no longer reads school_research, so the staleness gate and
// the refresh-before-generate confirmation are gone. Generate is now one click.
// Phase 6: the raw JSON viewer was replaced by the rendered document + PDF/print.
// UI tighten: this row now owns EVERY draft/document control, structured by state —
// one primary per state, max two visible secondaries, destructive actions in the
// "···" overflow only (never adjacent to the primary), confirm names what it deletes.
// Buttons are chrome; nothing here encodes data as color.
const G = {
  warmWhite:'#FFFDF9', cream:'#FBF6EC', ink:'#1A1A1A', inkMid:'#4A4A4A', muted:'#6B655A',
  faint:'#8A8478', line:'#E2DBC9', line2:'#D3CAB3', pitch:'#1F6B48', danger:'#9A0B23',
}

type State = 'idle' | 'generating' | 'error'
type Menu = 'closed' | 'open' | 'confirm'

async function consumeSSE(url: string, body: unknown, onEvent: (event: string, data: Record<string, unknown>) => void) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok || !res.body) throw new Error(await res.text().catch(() => 'Request failed'))
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let eventName = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('event: ')) eventName = line.slice(7).trim()
      else if (line.startsWith('data: ') && eventName) {
        try { onEvent(eventName, JSON.parse(line.slice(6))) } catch { /* skip */ }
        eventName = ''
      }
    }
  }
}

export default function CampDocGenerator({
  docId, content, canGenerate, onGenerated, onEditInputs, onDeleteDraft,
}: {
  docId: string
  content: unknown | null
  /** True when the draft has a confirmed extraction (generation is possible). */
  canGenerate: boolean
  onGenerated: () => void
  /** Reopens the input/confirm modal ("Edit inputs" — formerly "Resume"). */
  onEditInputs: () => void
  /** Deletes the prep_docs row (draft + any generated document). */
  onDeleteDraft: () => void | Promise<void>
}) {
  const [state, setState] = useState<State>('idle')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [menu, setMenu] = useState<Menu>('closed')

  const hasDocument = content != null

  async function runGenerate() {
    setState('generating'); setProgress('Starting…'); setError('')
    try {
      let done = false
      await consumeSSE('/api/camp-prep/generate', { docId }, (ev, data) => {
        if (ev === 'progress') setProgress(String(data.message ?? ''))
        else if (ev === 'error') { setError(String(data.message ?? 'Generation failed')); throw new Error('gen') }
        else if (ev === 'complete') done = true
      })
      if (done) { setState('idle'); onGenerated() }
      else if (!error) { setState('idle'); onGenerated() }
    } catch { setState('error') }
  }

  async function handleDelete() {
    setMenu('closed')
    await onDeleteDraft()
  }

  const busy = state === 'generating'

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${G.line}`, paddingTop: 12 }}>
      {/* Controls (hidden in print) — one primary per state, destructive in overflow only */}
      {state === 'idle' && (
        <div className="tb-noprint" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {hasDocument ? (
            <>
              {/* DOCUMENT EXISTS — primary: Download PDF; secondaries: Print, Regenerate (quieter) */}
              <a href={`/api/camp-prep/pdf/${docId}`} style={{ ...pitchBtn, textDecoration: 'none', display: 'inline-block' }}>Download PDF</a>
              <button onClick={() => window.print()} style={ghost}>Print</button>
              <button onClick={runGenerate} style={quiet}>Regenerate</button>
            </>
          ) : canGenerate ? (
            <>
              {/* DRAFT WITH CONFIRMED EXTRACTION, NO DOCUMENT — primary: Generate */}
              <button onClick={runGenerate} style={pitchBtn}>Generate document</button>
              <button onClick={onEditInputs} style={ghost}>Edit inputs</button>
            </>
          ) : (
            <>
              {/* DRAFT MID-FLOW (no confirmed extraction yet) — finish the inputs first */}
              <button onClick={onEditInputs} style={pitchBtn}>Edit inputs</button>
            </>
          )}

          {/* Overflow — the only home for destructive actions */}
          <div style={{ position: 'relative', marginLeft: 'auto' }}>
            <button aria-label="More actions" onClick={() => setMenu(m => m === 'closed' ? 'open' : 'closed')} style={{ ...ghost, padding: '7px 11px', letterSpacing: '0.1em' }}>···</button>
            {menu !== 'closed' && (
              <>
                <div onClick={() => setMenu('closed')} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 41, background: G.warmWhite, border: `1px solid ${G.line2}`, borderRadius: 10, boxShadow: '0 6px 20px rgba(26,26,26,0.12)', padding: 6, minWidth: 240 }}>
                  {menu === 'open' ? (
                    <>
                      {hasDocument && (
                        <button onClick={() => { setMenu('closed'); onEditInputs() }} style={menuItem}>Edit inputs</button>
                      )}
                      <button onClick={() => setMenu('confirm')} style={{ ...menuItem, color: G.danger }}>
                        {hasDocument ? 'Delete draft & document…' : 'Discard draft…'}
                      </button>
                    </>
                  ) : (
                    <div style={{ padding: 8 }}>
                      <div style={{ fontSize: 12, color: G.ink, lineHeight: 1.45, marginBottom: 10 }}>
                        {hasDocument
                          ? 'This permanently deletes the confirmed draft AND the generated document.'
                          : 'This permanently deletes the saved draft.'}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={handleDelete} style={dangerBtn}>{hasDocument ? 'Delete both' : 'Discard draft'}</button>
                        <button onClick={() => setMenu('closed')} style={ghost}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {busy && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: G.inkMid }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${G.line2}`, borderTopColor: G.pitch, animation: 'tb-spin 0.8s linear infinite' }} />
          <span>{progress || 'Generating…'}</span>
          <style>{`@keyframes tb-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {state === 'error' && (
        <div className="tb-noprint" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, color: G.danger, background: '#FCE4E8', border: `1px solid ${G.line}`, borderRadius: 8, padding: '9px 12px', lineHeight: 1.45 }}>{error}</div>
          <button onClick={() => setState('idle')} style={ghost}>Back</button>
        </div>
      )}

      {/* Rendered document (read-only). Tolerates null content. */}
      {hasDocument && state === 'idle' && <CampDocView content={content} />}
    </div>
  )
}

const pitchBtn: React.CSSProperties = { padding: '7px 15px', borderRadius: 999, border: 'none', background: G.pitch, color: G.cream, fontSize: 12.5, fontWeight: 650, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }
const ghost: React.CSSProperties = { padding: '7px 13px', borderRadius: 999, border: `1.3px solid ${G.line2}`, background: 'transparent', color: G.inkMid, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }
// The quieter secondary: borderless text button in the muted register.
const quiet: React.CSSProperties = { padding: '7px 9px', borderRadius: 999, border: 'none', background: 'transparent', color: G.muted, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }
const menuItem: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: G.inkMid, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }
const dangerBtn: React.CSSProperties = { padding: '7px 13px', borderRadius: 999, border: 'none', background: G.danger, color: G.cream, fontSize: 12.5, fontWeight: 650, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }

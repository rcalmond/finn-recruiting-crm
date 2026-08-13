'use client'

import { useState } from 'react'
import CampDocView from '@/components/CampDocView'

// Throughball chrome. Controls only; the document itself renders via CampDocView.
//
// Phase 5.5: the document no longer reads school_research, so the staleness gate and
// the refresh-before-generate confirmation are gone. Generate is now one click.
// Phase 6: the raw JSON viewer was replaced by the rendered document + PDF/print.
const G = {
  warmWhite:'#FFFDF9', cream:'#FBF6EC', ink:'#1A1A1A', inkMid:'#4A4A4A', muted:'#6B655A',
  faint:'#8A8478', line:'#E2DBC9', line2:'#D3CAB3', pitch:'#1F6B48', danger:'#9A0B23',
}

type State = 'idle' | 'generating' | 'error'

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
  docId, content, onGenerated,
}: {
  docId: string
  content: unknown | null
  onGenerated: () => void
}) {
  const [state, setState] = useState<State>('idle')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

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

  const busy = state === 'generating'

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${G.line}`, paddingTop: 12 }}>
      {/* Controls (hidden in print) */}
      {state === 'idle' && (
        <div className="tb-noprint" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={runGenerate} style={pitchBtn}>{content ? 'Regenerate document' : 'Generate document'}</button>
          {content != null && (
            <>
              <a href={`/api/camp-prep/pdf/${docId}`} style={{ ...ghost, textDecoration: 'none', display: 'inline-block' }}>Download PDF</a>
              <button onClick={() => window.print()} style={ghost}>Print</button>
            </>
          )}
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
      {content != null && state === 'idle' && <CampDocView content={content} />}
    </div>
  )
}

const pitchBtn: React.CSSProperties = { padding: '7px 15px', borderRadius: 999, border: 'none', background: G.pitch, color: G.cream, fontSize: 12.5, fontWeight: 650, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }
const ghost: React.CSSProperties = { padding: '7px 13px', borderRadius: 999, border: `1.3px solid ${G.line2}`, background: 'transparent', color: G.inkMid, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }

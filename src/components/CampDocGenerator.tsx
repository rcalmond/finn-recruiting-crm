'use client'

import { useState } from 'react'
import { useSchoolResearch } from '@/hooks/useRealtimeData'
import { daysSince, STALE_DAYS } from '@/lib/school-research'

// Throughball chrome. Content viewer is deliberately raw JSON — Phase 5 judges
// content, not looks.
const G = {
  warmWhite:'#FFFDF9', cream:'#FBF6EC', ink:'#1A1A1A', inkMid:'#4A4A4A', muted:'#6B655A',
  faint:'#8A8478', line:'#E2DBC9', line2:'#D3CAB3', pitch:'#1F6B48', danger:'#9A0B23',
}

type State = 'idle' | 'gate' | 'researching' | 'generating' | 'error'

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
  docId, schoolId, schoolName, content, onGenerated,
}: {
  docId: string
  schoolId: string
  schoolName: string
  content: unknown | null
  onGenerated: () => void
}) {
  const { research, refetch: refetchResearch } = useSchoolResearch(schoolId)
  const [state, setState] = useState<State>('idle')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [showJson, setShowJson] = useState(false)

  const researchAge = research ? daysSince(research.generated_at) : null
  const researchStale = research == null || (researchAge !== null && researchAge > STALE_DAYS)

  function start() {
    if (researchStale) { setState('gate'); return }
    runGenerate()
  }

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

  async function refreshThenGenerate() {
    setState('researching'); setProgress('Researching the program…'); setError('')
    try {
      await consumeSSE('/api/school-research/generate', { schoolId }, (ev, data) => {
        if (ev === 'progress') setProgress(String(data.message ?? ''))
        else if (ev === 'busy' || ev === 'error') { setError(String(data.message ?? 'Research failed')); throw new Error('res') }
      })
      await refetchResearch()
      await runGenerate()
    } catch { setState('error') }
  }

  const busy = state === 'researching' || state === 'generating'

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${G.line}`, paddingTop: 12 }}>
      {/* Controls */}
      {state === 'idle' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={start} style={pitchBtn}>{content ? 'Regenerate document' : 'Generate document'}</button>
          {content != null && (
            <button onClick={() => setShowJson(s => !s)} style={ghost}>{showJson ? 'Hide' : 'View'} document JSON</button>
          )}
          <span style={{ fontSize: 11.5, color: G.faint }}>
            {research ? `research ${researchAge === 0 ? 'today' : `${researchAge}d old`}${researchStale ? ' · stale' : ''}` : 'no research yet'}
          </span>
        </div>
      )}

      {state === 'gate' && (
        <div style={{ background: G.cream, border: `1px solid ${G.line2}`, borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 12.5, color: G.ink, marginBottom: 8, lineHeight: 1.5 }}>
            {research
              ? `Research for ${schoolName} is ${researchAge} days old (past the ${STALE_DAYS}-day window). Refresh it first, or generate with what's on file?`
              : `No research on file for ${schoolName}. Refresh first, or generate without the staff/roster sections?`}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={refreshThenGenerate} style={pitchBtn}>Refresh &amp; generate</button>
            <button onClick={runGenerate} style={ghost}>{research ? `Use existing (${researchAge}d)` : 'Generate without it'}</button>
            <button onClick={() => setState('idle')} style={ghost}>Cancel</button>
          </div>
        </div>
      )}

      {busy && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: G.inkMid }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${G.line2}`, borderTopColor: G.pitch, animation: 'tb-spin 0.8s linear infinite' }} />
          <span>{progress || (state === 'researching' ? 'Researching…' : 'Generating…')}</span>
          <style>{`@keyframes tb-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {state === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, color: G.danger, background: '#FCE4E8', border: `1px solid ${G.line}`, borderRadius: 8, padding: '9px 12px', lineHeight: 1.45 }}>{error}</div>
          <button onClick={() => setState('idle')} style={ghost}>Back</button>
        </div>
      )}

      {/* Raw JSON viewer */}
      {content != null && showJson && state === 'idle' && (
        <pre style={{ marginTop: 12, maxHeight: 460, overflow: 'auto', background: '#1A1A1A', color: '#E7E2D6', fontSize: 11.5, lineHeight: 1.5, padding: 14, borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {JSON.stringify(content, null, 2)}
        </pre>
      )}
    </div>
  )
}

const pitchBtn: React.CSSProperties = { padding: '7px 15px', borderRadius: 999, border: 'none', background: G.pitch, color: G.cream, fontSize: 12.5, fontWeight: 650, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }
const ghost: React.CSSProperties = { padding: '7px 13px', borderRadius: 999, border: `1.3px solid ${G.line2}`, background: 'transparent', color: G.inkMid, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }

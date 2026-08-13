'use client'

import { useState, useRef } from 'react'
import { useSchoolResearch } from '@/hooks/useRealtimeData'
import { daysSince, STALE_DAYS, type ResearchSnapshot, type ResearchSource } from '@/lib/school-research'

// Throughball chrome — this is the RECORD, not a judgment (no Regista attribution,
// no green on the content). Status uses ink/pitch/danger (chrome semantics), never
// the data-encoding color systems.
const R = {
  paper:     '#F6F1E8',
  warmWhite: '#FFFDF9',
  cream:     '#FBF6EC',
  ink:       '#1A1A1A',
  inkMid:    '#4A4A4A',
  muted:     '#6B655A',
  faint:     '#8A8478',
  line:      '#E2DBC9',
  line2:     '#D3CAB3',
  pitch:     '#1F6B48',
  danger:    '#9A0B23',
}

export default function ResearchSection({ schoolId, schoolName }: { schoolId: string; schoolName: string }) {
  const { research, loading, refetch } = useSchoolResearch(schoolId)
  const [gen, setGen] = useState<'idle' | 'generating' | 'error'>('idle')
  const [progress, setProgress] = useState('')
  const [genError, setGenError] = useState('')
  const [showSources, setShowSources] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function handleRefresh() {
    setGen('generating')
    setProgress('Starting…')
    setGenError('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch('/api/school-research/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId }),
        signal: controller.signal,
      })
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
            try {
              const data = JSON.parse(line.slice(6))
              if (eventName === 'progress') setProgress(String(data.message ?? ''))
              else if (eventName === 'busy') { setGenError(String(data.message ?? 'A run is already in progress.')); setGen('error') }
              else if (eventName === 'error') { setGenError(String(data.message ?? 'Research failed.')); setGen('error') }
              else if (eventName === 'complete') { setGen('idle'); await refetch() }
            } catch { /* skip */ }
            eventName = ''
          }
        }
      }
      if (gen === 'generating') { setGen('idle'); await refetch() }
    } catch (err) {
      if (controller.signal.aborted) return
      setGenError(err instanceof Error ? err.message : 'Research failed.')
      setGen('error')
    }
  }

  const snapshot = research?.snapshot ?? null
  const age = research ? daysSince(research.generated_at) : null
  const stale = age !== null && age > STALE_DAYS

  return (
    <div style={{ background: R.warmWhite, border: `1px solid ${R.line}`, borderRadius: 14, padding: 'clamp(16px, 3vw, 24px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, fontStyle: 'italic', letterSpacing: '-0.03em', color: R.ink }}>
            Research<span style={{ color: R.pitch }}>.</span>
          </h2>
          <div style={{ marginTop: 4, fontSize: 12.5, color: R.muted, lineHeight: 1.5 }}>
            {loading ? 'Loading…'
              : !research ? 'Not yet researched. Runs a live web pass over staff, roster, results, and commits — every claim traced to a source.'
              : <StatusLine research={research} age={age!} stale={stale} />}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={gen === 'generating'}
          style={{
            padding: '8px 16px', borderRadius: 999, border: 'none', cursor: gen === 'generating' ? 'default' : 'pointer',
            fontSize: 13, fontWeight: 650, fontFamily: 'inherit', letterSpacing: '-0.01em',
            background: R.pitch, color: R.cream, opacity: gen === 'generating' ? 0.55 : 1, flexShrink: 0, whiteSpace: 'nowrap',
          }}
        >
          {gen === 'generating' ? 'Researching…' : research ? 'Refresh research' : 'Research this program'}
        </button>
      </div>

      {/* Generating progress */}
      {gen === 'generating' && (
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: R.inkMid }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${R.line2}`, borderTopColor: R.pitch, display: 'inline-block', animation: 'tb-spin 0.8s linear infinite' }} />
          <span>{progress || 'Working…'}</span>
          <style>{`@keyframes tb-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error / busy */}
      {gen === 'error' && (
        <div style={{ marginTop: 14, fontSize: 13, color: R.danger, background: '#FCE4E8', border: `1px solid ${R.line}`, borderRadius: 8, padding: '9px 12px', lineHeight: 1.45 }}>
          {genError}
        </div>
      )}

      {/* Snapshot */}
      {snapshot && gen !== 'generating' && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SnapshotBody snapshot={snapshot} />

          {/* Sources — the trust surface */}
          {research?.sources && research.sources.length > 0 && (
            <div style={{ borderTop: `1px solid ${R.line}`, paddingTop: 12 }}>
              <button
                onClick={() => setShowSources(s => !s)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 650, color: R.inkMid, letterSpacing: '-0.01em' }}
              >
                <span style={{ display: 'inline-block', transform: showSources ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
                Sources ({research.sources.length}) — click any to verify a claim
              </button>
              {showSources && <SourcesList sources={research.sources} />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatusLine({ research, age, stale }: { research: NonNullable<ReturnType<typeof useSchoolResearch>['research']>; age: number; stale: boolean }) {
  const ageStr = age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age} days ago`
  return (
    <span>
      Researched {ageStr}
      {stale && <span style={{ color: R.inkMid, fontWeight: 600 }}> · past the {STALE_DAYS}-day freshness window</span>}
      {research.status === 'partial' && <span style={{ color: R.muted }}> · partial (some claims couldn&apos;t be sourced and were dropped)</span>}
      {research.status === 'failed' && <span style={{ color: R.danger }}> · last run failed</span>}
      {research.model && <span style={{ color: R.faint }}> · {research.model}</span>}
    </span>
  )
}

function SnapshotBody({ snapshot }: { snapshot: ResearchSnapshot }) {
  const s = snapshot
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: R.ink, lineHeight: 1.5 }}>
      {s.staff.length > 0 && (
        <Block title="Staff">
          {s.staff.map((c, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <span style={{ fontWeight: 650 }}>{c.name}</span>
              <span style={{ color: R.muted }}> — {c.role}</span>
              {c.record && <span style={{ color: R.muted }}> · {c.record}</span>}
              {c.alma_mater && <span style={{ color: R.faint }}> · {c.alma_mater}</span>}
              {c.background && <div style={{ color: R.inkMid, fontSize: 12.5 }}>{c.background}</div>}
            </div>
          ))}
        </Block>
      )}

      {s.attrition_next_two_cycles.length > 0 && (
        <Block title="Attrition — the cycles before arrival">
          {s.attrition_next_two_cycles.map((a, i) => (
            <div key={i} style={{ marginBottom: 2 }}>
              <span style={{ fontWeight: 650 }}>{a.position}</span>
              <span style={{ color: R.muted }}> ({a.cycle})</span>
              {a.players.length > 0 && <span>: {a.players.join(', ')}</span>}
            </div>
          ))}
        </Block>
      )}

      {(s.roster_summary.size || s.roster_summary.class_breakdown || s.roster_summary.position_breakdown) && (
        <Block title={`Roster${s.roster_summary.roster_season ? ` (${s.roster_summary.roster_season} season)` : ''}`}>
          {s.roster_summary.size && <div>Size: {s.roster_summary.size.value}</div>}
          {s.roster_summary.class_breakdown && <div>Classes: {s.roster_summary.class_breakdown.value}</div>}
          {s.roster_summary.position_breakdown && <div>Positions: {s.roster_summary.position_breakdown.value}</div>}
        </Block>
      )}

      {(s.program_results.recent_records.length > 0 || s.program_results.conference_finishes.length > 0 || s.program_results.tournament_runs.length > 0) && (
        <Block title="Program results">
          {s.program_results.recent_records.map((r, i) => <div key={`rr${i}`}>{r.text}</div>)}
          {s.program_results.conference_finishes.map((r, i) => <div key={`cf${i}`} style={{ color: R.muted }}>{r.text}</div>)}
          {s.program_results.tournament_runs.map((r, i) => <div key={`tr${i}`} style={{ color: R.muted }}>{r.text}</div>)}
        </Block>
      )}

      {(s.geographic_profile.states_represented.length > 0 || s.geographic_profile.gaps.length > 0) && (
        <Block title="Geography">
          {s.geographic_profile.states_represented.length > 0 && (
            <div>{s.geographic_profile.states_represented.map(g => g.text).join(' · ')}</div>
          )}
          {s.geographic_profile.regions.length > 0 && <div style={{ color: R.muted }}>Regions: {s.geographic_profile.regions.join(', ')}</div>}
          {s.geographic_profile.gaps.length > 0 && <div style={{ color: R.muted }}>Gaps: {s.geographic_profile.gaps.join(', ')}</div>}
        </Block>
      )}

      <Block title={`Published ${s.published_commits_for_class.class_year ?? ''} commits`}>
        {s.published_commits_for_class.commits.length > 0
          ? <div>{s.published_commits_for_class.commits.map(c => c.name).join(', ')}</div>
          : <div style={{ color: R.faint, fontStyle: 'italic' }}>{s.published_commits_for_class.not_found_reason || 'None found.'}</div>}
      </Block>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: R.faint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  )
}

function SourcesList({ sources }: { sources: ResearchSource[] }) {
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sources.map((src, i) => (
        <div key={i} style={{ background: R.cream, border: `1px solid ${R.line}`, borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 11, color: R.faint, fontWeight: 600 }}>{src.claim_key}</div>
          <a href={src.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: R.pitch, wordBreak: 'break-all', textDecoration: 'none' }}>
            {src.url}
          </a>
          {src.supporting_excerpt && (
            <div style={{ fontSize: 12, color: R.inkMid, marginTop: 4, lineHeight: 1.45, fontStyle: 'italic' }}>
              &ldquo;{src.supporting_excerpt}&rdquo;
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

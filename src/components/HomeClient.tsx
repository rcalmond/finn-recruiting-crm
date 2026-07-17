'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import type { School, ContactLogEntry, SchoolConversationSummary } from '@/lib/types'
import { useSchools, useContactLog, useActionItems, useCamps } from '@/hooks/useRealtimeData'
import { createClient } from '@/lib/supabase/client'
import { getStrategicPrompts, getCurrentWeekStart } from '@/lib/strategic-prompts'
import { isTargetTier } from '@/lib/awaiting-reply'
import StatsStrip from './home/StatsStrip'
import FunnelGrid from './home/FunnelGrid'
import HomeSchoolCard from './home/HomeSchoolCard'
import StrategicSection from './today/StrategicSection'
import BatchReelModal from './today/BatchReelModal'
import PendingCampDecisionsModal from './strategic/PendingCampDecisionsModal'
import SyncHealthBanner from './today/SyncHealthBanner'
import type { SourceHealth } from '@/lib/ingestion-health'

const SD = {
  paper:    '#F6F1E8',
  ink:      '#0E0E0E',
  inkLo:    '#7A7570',
  inkMute:  '#A8A39B',
}

export default function HomeClient({
  user,
  ingestionHealth,
}: {
  user: User
  ingestionHealth?: SourceHealth[]
}) {
  const { schools, loading: schoolsLoading } = useSchools()
  const { entries: contactLog, loading: logLoading } = useContactLog()
  const { items: actionItems, loading: actionsLoading } = useActionItems()
  const { camps, loading: campsLoading } = useCamps(schools)
  const supabase = useMemo(() => createClient(), [])

  const loading = schoolsLoading || logLoading || actionsLoading || campsLoading

  // ── Conversation summaries ────────────────────────────────────────────────
  const [summaries, setSummaries] = useState<SchoolConversationSummary[]>([])
  const [summariesLoaded, setSummariesLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('school_conversation_summary')
        .select('*')
      if (!cancelled && data) {
        setSummaries(data as SchoolConversationSummary[])
        setSummariesLoaded(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [supabase])

  const summaryMap = useMemo(
    () => new Map(summaries.map(s => [s.school_id, s])),
    [summaries]
  )

  // ── Strategic prompts ─────────────────────────────────────────────────────
  const [skippedKeys, setSkippedKeys] = useState<Set<string>>(new Set())
  const [skipsLoaded, setSkipsLoaded] = useState(false)
  const [currentReelUrl, setCurrentReelUrl] = useState<string | null>(null)
  const [currentReelTitle, setCurrentReelTitle] = useState<string | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [batchSentSchoolIds, setBatchSentIds] = useState<Set<string>>(new Set())

  const [batchReelSchoolIds, setBatchReelSchoolIds] = useState<string[] | null>(null)
  const [campDecisionsCampIds, setCampDecisionsCampIds] = useState<string[] | null>(null)

  useEffect(() => {
    const weekStart = getCurrentWeekStart()
    supabase.from('strategic_skips')
      .select('prompt_key')
      .eq('week_start', weekStart)
      .then(({ data }) => {
        setSkippedKeys(new Set((data ?? []).map((r: { prompt_key: string }) => r.prompt_key)))
        setSkipsLoaded(true)
      })
    supabase.from('assets')
      .select('url, name')
      .eq('type', 'highlight_reel')
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const d = data as { url: string | null; name: string | null } | null
        const url = d?.url ?? null
        setCurrentReelUrl(url)
        setCurrentReelTitle(d?.name ?? null)
        setProfileLoaded(true)
        if (url) {
          supabase.from('batch_reel_sends')
            .select('school_id')
            .eq('reel_url', url)
            .in('sent_via', ['Email', 'Sports Recruits'])
            .then(({ data: sends }) => {
              setBatchSentIds(new Set((sends ?? []).map((r: { school_id: string }) => r.school_id)))
            })
        }
      })
  }, [supabase])

  const handleSkipPrompt = useCallback(async (key: string) => {
    const weekStart = getCurrentWeekStart()
    await supabase.from('strategic_skips').insert({ prompt_key: key, week_start: weekStart })
    setSkippedKeys(prev => new Set(prev).add(key))
  }, [supabase])

  const strategicPrompts = useMemo(() => {
    if (!skipsLoaded || !profileLoaded) return []
    return getStrategicPrompts(schools, contactLog, currentReelUrl, skippedKeys, new Set(), batchSentSchoolIds, camps)
  }, [schools, contactLog, currentReelUrl, skippedKeys, skipsLoaded, profileLoaded, batchSentSchoolIds, camps])

  // ── School cards: active A/B/C sorted by recency ──────────────────────────
  const [showAll, setShowAll] = useState(false)

  // Build per-school contact log map
  const schoolContactMap = useMemo(() => {
    const map = new Map<string, ContactLogEntry[]>()
    for (const e of contactLog) {
      if (!e.school_id) continue
      if (!map.has(e.school_id)) map.set(e.school_id, [])
      map.get(e.school_id)!.push(e)
    }
    return map
  }, [contactLog])

  const { nonWaitSchools, waitSchools } = useMemo(() => {
    const eligible = schools.filter(s => isTargetTier(s) && s.status !== 'Inactive')

    // Sort by most recent contact_log sent_at. Schools with no contact go to bottom.
    const sortByRecency = (list: School[]) => [...list].sort((a, b) => {
      const aEntries = schoolContactMap.get(a.id) ?? []
      const bEntries = schoolContactMap.get(b.id) ?? []
      const aLatest = aEntries.length > 0
        ? aEntries.reduce((max, e) => e.sent_at > max ? e.sent_at : max, '')
        : ''
      const bLatest = bEntries.length > 0
        ? bEntries.reduce((max, e) => e.sent_at > max ? e.sent_at : max, '')
        : ''
      return bLatest.localeCompare(aLatest)
    })

    const nonWait = sortByRecency(
      eligible.filter(s => {
        const summary = summaryMap.get(s.id)
        return !summary || summary.recommended_action.category !== 'wait'
      })
    )
    const wait = sortByRecency(
      eligible.filter(s => {
        const summary = summaryMap.get(s.id)
        return summary?.recommended_action.category === 'wait'
      })
    )

    return { nonWaitSchools: nonWait, waitSchools: wait }
  }, [schools, schoolContactMap, summaryMap])

  const allActiveCount = nonWaitSchools.length + waitSchools.length

  // Edge case: if ALL schools are wait, show them in default view
  const defaultSchools = nonWaitSchools.length > 0 ? nonWaitSchools.slice(0, 5) : waitSchools.slice(0, 5)

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: SD.inkLo, fontSize: 14,
      }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: SD.paper,
      fontFamily: "'Inter', -apple-system, sans-serif",
      paddingBottom: 80,
    }}>
      {/* Ingestion health banner */}
      {ingestionHealth && <SyncHealthBanner sources={ingestionHealth} />}

      {/* Masthead */}
      <div style={{
        padding: '24px clamp(28px, 4vw, 56px) 8px',
      }}>
        <h1 style={{
          margin: 0,
          fontSize: 'clamp(56px, 7vw, 88px)',
          fontWeight: 700, letterSpacing: '-0.04em',
          color: SD.ink, lineHeight: 0.95,
          fontStyle: 'italic',
        }}>Home.</h1>
      </div>

      {/* Main content — single column */}
      <div style={{
        padding: '0 clamp(28px, 4vw, 56px)',
        maxWidth: 900,
      }}>
        {/* Stats strip */}
        <section style={{ marginBottom: 32 }}>
          <StatsStrip
            schools={schools}
            contactLog={contactLog}
            camps={camps}
          />
        </section>

        {/* Funnel grid */}
        <FunnelGrid schools={schools} contactLog={contactLog} />

        {/* School cards */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{
            margin: '0 0 18px', fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 700,
            letterSpacing: '-0.04em', color: SD.ink, fontStyle: 'italic',
          }}>Schools.</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(showAll ? nonWaitSchools : defaultSchools).map(school => (
              <HomeSchoolCard
                key={school.id}
                school={school}
                summary={summaryMap.get(school.id) ?? null}
                contactLog={schoolContactMap.get(school.id) ?? []}
              />
            ))}
          </div>

          {/* Wait-state schools (only in expanded view) */}
          {showAll && waitSchools.length > 0 && (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                margin: '20px 0 12px',
              }}>
                <div style={{ flex: 1, height: 1, background: SD.inkMute, opacity: 0.3 }} />
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.08em', color: SD.inkMute, whiteSpace: 'nowrap',
                }}>Waiting on coaches</span>
                <div style={{ flex: 1, height: 1, background: SD.inkMute, opacity: 0.3 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {waitSchools.map(school => (
                  <HomeSchoolCard
                    key={school.id}
                    school={school}
                    summary={summaryMap.get(school.id) ?? null}
                    contactLog={schoolContactMap.get(school.id) ?? []}
                  />
                ))}
              </div>
            </>
          )}

          {allActiveCount > defaultSchools.length && (
            <button
              onClick={() => setShowAll(v => !v)}
              style={{
                marginTop: 12, padding: '8px 16px',
                background: 'transparent', border: `1.3px solid ${SD.inkMute}`,
                borderRadius: 6, fontSize: 12, fontWeight: 600,
                color: SD.inkLo, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {showAll ? 'Show less' : `Show all (${allActiveCount})`}
            </button>
          )}
        </section>

        {/* Think section — strategic prompts */}
        {strategicPrompts.length > 0 && (
          <section>
            <h2 style={{
              margin: '0 0 18px', fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 700,
              letterSpacing: '-0.04em', color: SD.ink, fontStyle: 'italic',
            }}>Think.</h2>
            <StrategicSection
              prompts={strategicPrompts}
              schools={schools}
              onSkip={handleSkipPrompt}
              onBatchReel={(ids) => setBatchReelSchoolIds(ids)}
              onCampDecisions={(ids) => setCampDecisionsCampIds(ids)}
            />
          </section>
        )}
      </div>

      {/* Modals */}
      {batchReelSchoolIds && (
        <BatchReelModal
          schoolIds={batchReelSchoolIds}
          schools={schools}
          userId={user.id}
          reelUrl={currentReelUrl}
          reelTitle={currentReelTitle}
          onClose={() => setBatchReelSchoolIds(null)}
        />
      )}
      {campDecisionsCampIds && (
        <PendingCampDecisionsModal
          campIds={campDecisionsCampIds}
          camps={camps}
          onClose={() => setCampDecisionsCampIds(null)}
        />
      )}
    </div>
  )
}

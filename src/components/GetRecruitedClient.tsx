'use client'

import { useState, useEffect, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import type { School, ContactLogEntry, SchoolConversationSummary } from '@/lib/types'
import { useSchools, useContactLog, useActionItems, useCamps } from '@/hooks/useRealtimeData'
import { createClient } from '@/lib/supabase/client'
import { isTargetTier } from '@/lib/awaiting-reply'
import StatsStrip from './home/StatsStrip'
import FunnelGrid from './home/FunnelGrid'
import HomeSchoolCard from './home/HomeSchoolCard'
import SyncHealthBanner from './today/SyncHealthBanner'
import type { SourceHealth } from '@/lib/ingestion-health'

const SD = {
  paper:    '#F6F1E8',
  ink:      '#0E0E0E',
  inkLo:    '#7A7570',
  inkMute:  '#A8A39B',
}

export default function GetRecruitedClient({
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
        padding: '24px clamp(28px, 4vw, 56px) 4px',
      }}>
        <h1 style={{
          margin: 0,
          fontSize: 'clamp(56px, 7vw, 88px)',
          fontWeight: 700, letterSpacing: '-0.04em',
          color: SD.ink, lineHeight: 0.95,
          fontStyle: 'italic',
        }}>Get Recruited.</h1>
        <p style={{
          margin: '12px 0 0', fontSize: 15, color: SD.inkLo,
          fontWeight: 450, letterSpacing: '-0.01em',
        }}>
          Work every conversation. Miss nothing.
        </p>
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
      </div>
    </div>
  )
}

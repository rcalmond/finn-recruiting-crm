'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PreviewRow, MatchStatus as ParsedMatchStatus } from '@/app/api/bulk-import/parse/route'

type MatchStatus = ParsedMatchStatus | 'corrected'
import type { SkippedRow } from '@/app/api/bulk-import/route'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParseStats {
  total: number
  outbound: number
  inbound: number
  matched: number
  partial: number
  unmatched_school: number
  duplicate: number
  threadCount: number
  schoolCount: number
}

interface SchoolOption {
  id: string
  name: string
  short_name: string | null
}

// Preview row with UI state layered on top
interface RowState extends PreviewRow {
  selected: boolean
  overrideSchoolId: string | null
  overrideSchoolName: string | null
}

type Phase = 'input' | 'parsing' | 'preview' | 'importing' | 'result'

interface ImportResult {
  inserted: number
  skipped: number
  skippedRows: SkippedRow[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function effectiveSchoolId(row: RowState): string | null {
  return row.overrideSchoolId ?? row.schoolId
}

function effectiveSchoolName(row: RowState): string | null {
  return row.overrideSchoolName ?? row.schoolName
}

// ─── Match status badge ───────────────────────────────────────────────────────

const STATUS_STYLES: Record<MatchStatus, { bg: string; color: string; label: string }> = {
  matched:          { bg: '#D1FAE5', color: '#065F46', label: 'Matched'   },
  partial:          { bg: '#FEF3C7', color: '#92400E', label: 'Partial'   },
  unmatched_school: { bg: '#FEE2E2', color: '#991B1B', label: 'No school' },
  duplicate:        { bg: '#F3F4F6', color: '#6B7280', label: 'Duplicate' },
  corrected:        { bg: '#EDE9FE', color: '#5B21B6', label: 'Corrected' },
}

function StatusBadge({ status }: { status: MatchStatus }) {
  const s = STATUS_STYLES[status]
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 600,
      background: s.bg,
      color: s.color,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BulkImportClient() {
  const [phase, setPhase] = useState<Phase>('input')
  const [pasteText, setPasteText] = useState('')
  const [rows, setRows] = useState<RowState[]>([])
  const [stats, setStats] = useState<ParseStats | null>(null)
  const [schools, setSchools] = useState<SchoolOption[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch school list once (needed for override select)
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('schools')
      .select('id, name, short_name')
      .order('name')
      .then(({ data }) => setSchools((data ?? []) as SchoolOption[]))
  }, [])

  // ── Get auth token ──
  const getToken = useCallback(async (): Promise<string | null> => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }, [])

  // ── Parse ──
  async function handleParse() {
    if (!pasteText.trim()) return
    setError(null)
    setPhase('parsing')

    try {
      const token = await getToken()
      const res = await fetch('/api/bulk-import/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: pasteText }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error ?? 'Parse failed')
      }

      const data = await res.json()
      const parsed: PreviewRow[] = data.rows ?? []

      setRows(parsed.map(row => ({
        ...row,
        // Auto-deselect duplicates; select everything else by default
        selected: row.matchStatus !== 'duplicate',
        overrideSchoolId: null,
        overrideSchoolName: null,
      })))
      setStats(data.stats)
      setPhase('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setPhase('input')
    }
  }

  // ── Toggle row selection ──
  function toggleRow(tempId: string) {
    setRows(prev => prev.map(r =>
      r.tempId === tempId ? { ...r, selected: !r.selected } : r
    ))
  }

  function selectAll(selected: boolean) {
    setRows(prev => prev.map(r =>
      r.matchStatus === 'duplicate' ? r : { ...r, selected }
    ))
  }

  // ── School override ──
  function applySchoolOverride(tempId: string, schoolId: string) {
    const school = schools.find(s => s.id === schoolId) ?? null
    setRows(prev => prev.map(r =>
      r.tempId === tempId
        ? {
            ...r,
            overrideSchoolId:   school?.id ?? null,
            overrideSchoolName: school?.name ?? null,
            // Clear coach matching — override means we don't have coach data for new school
            coaches: r.coaches.map(c => ({ ...c, coachId: null, matchType: 'override_reset' })),
            primaryCoachId: null,
          }
        : r
    ))
  }

  // ── Import ──
  async function handleImport() {
    const selected = rows.filter(r => r.selected && r.matchStatus !== 'duplicate')
    if (selected.length === 0) return
    setError(null)
    setPhase('importing')

    try {
      const token = await getToken()

      const importRows = selected.map(r => ({
        isoDate:        r.isoDate ?? '',
        schoolId:       effectiveSchoolId(r) ?? '',
        coachName:      r.coachName,
        coachIds:       r.coaches.map(c => c.coachId).filter((id): id is string => id !== null),
        primaryCoachId: r.primaryCoachId,
        body:           r.body,
        subject:        r.subject,
        threadKey:      r.threadKey,
      }))

      // Filter out any rows missing required fields (shouldn't happen after validation)
      const valid = importRows.filter(r => r.isoDate && r.schoolId)

      const res = await fetch('/api/bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ rows: valid }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error ?? 'Import failed')
      }

      const data = await res.json()
      setResult({
        inserted:    data.inserted ?? 0,
        skipped:     data.skipped ?? 0,
        skippedRows: data.skippedRows ?? [],
      })
      setPhase('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setPhase('preview')
    }
  }

  // ── Reset ──
  function reset() {
    setPasteText('')
    setRows([])
    setStats(null)
    setResult(null)
    setError(null)
    setPhase('input')
  }

  // ─── Derived counts ─────────────────────────────────────────────────────────
  const selectedCount = rows.filter(r => r.selected && r.matchStatus !== 'duplicate').length
  const selectableCount = rows.filter(r => r.matchStatus !== 'duplicate').length
  const allSelected = selectableCount > 0 && selectedCount === selectableCount

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 80px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 750, color: '#0E0E0E', letterSpacing: -0.5, margin: 0 }}>
          SR Sent Import
        </h1>
        <p style={{ fontSize: 13, color: '#7A7570', marginTop: 4 }}>
          Paste your Sports Recruits Sent folder below to import outbound messages into the contact log.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          background: '#FEE2E2', border: '1px solid #FECACA',
          borderRadius: 8, padding: '10px 14px',
          fontSize: 13, color: '#991B1B', marginBottom: 20,
        }}>
          {error}
        </div>
      )}

      {/* ── INPUT PHASE ─────────────────────────────────────────────── */}
      {(phase === 'input' || phase === 'parsing') && (
        <div>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder="Paste SR Sent folder content here..."
            disabled={phase === 'parsing'}
            style={{
              width: '100%',
              height: 340,
              padding: '14px 16px',
              borderRadius: 10,
              border: '1.5px solid #E2DBC9',
              background: '#FAFAF8',
              fontSize: 12,
              fontFamily: 'monospace',
              color: '#0E0E0E',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
              lineHeight: 1.6,
            }}
          />
          <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
            <button
              onClick={handleParse}
              disabled={phase === 'parsing' || !pasteText.trim()}
              style={{
                padding: '10px 24px',
                background: '#0E0E0E',
                color: '#fff',
                border: 'none',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 650,
                cursor: phase === 'parsing' || !pasteText.trim() ? 'not-allowed' : 'pointer',
                opacity: phase === 'parsing' || !pasteText.trim() ? 0.5 : 1,
              }}
            >
              {phase === 'parsing' ? 'Parsing…' : 'Parse'}
            </button>
          </div>
        </div>
      )}

      {/* ── PREVIEW PHASE ───────────────────────────────────────────── */}
      {phase === 'preview' && (
        <div>
          {/* Stats bar */}
          {stats && (
            <div style={{
              display: 'flex', gap: 20, flexWrap: 'wrap',
              padding: '12px 16px',
              background: '#F6F1E8',
              borderRadius: 8,
              marginBottom: 20,
              fontSize: 12,
              color: '#4A4A4A',
            }}>
              <StatChip label="Total messages" value={stats.total} />
              <StatChip label="Outbound" value={stats.outbound} />
              <StatChip label="Inbound (skipped)" value={stats.inbound} dim />
              <div style={{ width: 1, background: '#E2DBC9', margin: '0 4px' }} />
              <StatChip label="Matched" value={stats.matched} color="#065F46" />
              {stats.partial > 0 && <StatChip label="Partial" value={stats.partial} color="#92400E" />}
              {stats.unmatched_school > 0 && <StatChip label="No school" value={stats.unmatched_school} color="#991B1B" />}
              {stats.duplicate > 0 && <StatChip label="Duplicates" value={stats.duplicate} color="#6B7280" />}
              <div style={{ width: 1, background: '#E2DBC9', margin: '0 4px' }} />
              <StatChip label="Threads" value={stats.threadCount} />
              <StatChip label="Schools" value={stats.schoolCount} />
            </div>
          )}

          {/* Action bar */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={e => selectAll(e.target.checked)}
                  style={{ width: 15, height: 15, cursor: 'pointer' }}
                />
                <span style={{ color: '#4A4A4A' }}>
                  {selectedCount} of {selectableCount} selected
                </span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={reset}
                style={{
                  padding: '8px 18px',
                  background: 'transparent',
                  color: '#4A4A4A',
                  border: '1px solid #E2DBC9',
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={selectedCount === 0}
                style={{
                  padding: '8px 22px',
                  background: '#0E0E0E',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 650,
                  cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
                  opacity: selectedCount === 0 ? 0.4 : 1,
                }}
              >
                Import {selectedCount > 0 ? `${selectedCount} rows` : ''}
              </button>
            </div>
          </div>

          {/* Preview table */}
          <div style={{ border: '1px solid #E2DBC9', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F6F1E8', borderBottom: '1px solid #E2DBC9' }}>
                  <Th width={36} />
                  <Th>Date</Th>
                  <Th>School</Th>
                  <Th>Coach</Th>
                  <Th>Subject</Th>
                  <Th>Excerpt</Th>
                  <Th width={96}>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const isDuplicate = row.matchStatus === 'duplicate'
                  const schoolId = effectiveSchoolId(row)
                  const schoolName = effectiveSchoolName(row)
                  const needsSchool = !schoolId

                  return (
                    <tr
                      key={row.tempId}
                      style={{
                        borderBottom: idx < rows.length - 1 ? '1px solid #F0EBE0' : 'none',
                        background: isDuplicate ? '#FAFAFA' : row.selected ? '#fff' : '#FDFCFB',
                        opacity: isDuplicate ? 0.55 : 1,
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={row.selected}
                          disabled={isDuplicate}
                          onChange={() => toggleRow(row.tempId)}
                          style={{ width: 14, height: 14, cursor: isDuplicate ? 'default' : 'pointer' }}
                        />
                      </td>

                      {/* Date */}
                      <td style={{ padding: '10px 12px', color: '#4A4A4A', whiteSpace: 'nowrap' }}>
                        {row.isoDate ?? <span style={{ color: '#C0BAB0' }}>—</span>}
                      </td>

                      {/* School */}
                      <td style={{ padding: '10px 12px', minWidth: 160 }}>
                        {needsSchool ? (
                          <div>
                            <div style={{ fontSize: 11, color: '#991B1B', marginBottom: 4 }}>
                              {row.parsedSchoolName ?? 'Unknown school'}
                            </div>
                            <select
                              value={row.overrideSchoolId ?? ''}
                              onChange={e => applySchoolOverride(row.tempId, e.target.value)}
                              style={{
                                fontSize: 11,
                                padding: '3px 6px',
                                border: '1px solid #E2DBC9',
                                borderRadius: 5,
                                background: '#fff',
                                color: '#0E0E0E',
                                width: '100%',
                                maxWidth: 200,
                              }}
                            >
                              <option value="">— assign school —</option>
                              {schools.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <span style={{ color: '#0E0E0E' }}>{schoolName}</span>
                        )}
                      </td>

                      {/* Coach */}
                      <td style={{ padding: '10px 12px', color: '#4A4A4A', maxWidth: 150 }}>
                        <span style={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {row.coachName || <span style={{ color: '#C0BAB0' }}>—</span>}
                        </span>
                      </td>

                      {/* Subject */}
                      <td style={{ padding: '10px 12px', color: '#4A4A4A', maxWidth: 180 }}>
                        <span style={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {row.subject
                            ? row.subject.length > 40
                              ? row.subject.slice(0, 40) + '…'
                              : row.subject
                            : <span style={{ color: '#C0BAB0' }}>—</span>
                          }
                        </span>
                      </td>

                      {/* Excerpt */}
                      <td style={{ padding: '10px 12px', color: '#7A7570', maxWidth: 220 }}>
                        <span style={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {row.bodyExcerpt || <span style={{ color: '#C0BAB0' }}>—</span>}
                        </span>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '10px 12px' }}>
                        <StatusBadge
                          status={row.overrideSchoolId ? 'corrected' : row.matchStatus}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom import button (convenience repeat for long lists) */}
          {rows.length > 8 && (
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={reset}
                style={{
                  padding: '8px 18px',
                  background: 'transparent',
                  color: '#4A4A4A',
                  border: '1px solid #E2DBC9',
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={selectedCount === 0}
                style={{
                  padding: '8px 22px',
                  background: '#0E0E0E',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 650,
                  cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
                  opacity: selectedCount === 0 ? 0.4 : 1,
                }}
              >
                Import {selectedCount > 0 ? `${selectedCount} rows` : ''}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── IMPORTING PHASE ─────────────────────────────────────────── */}
      {phase === 'importing' && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#7A7570', fontSize: 14 }}>
          Importing…
        </div>
      )}

      {/* ── RESULT PHASE ────────────────────────────────────────────── */}
      {phase === 'result' && result && (
        <div>
          {/* Primary result */}
          <div style={{
            background: result.inserted > 0 ? '#D1FAE5' : '#F3F4F6',
            border: `1px solid ${result.inserted > 0 ? '#6EE7B7' : '#E5E7EB'}`,
            borderRadius: 12,
            padding: '24px 28px',
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 28, fontWeight: 750, color: '#065F46', letterSpacing: -0.5 }}>
              {result.inserted} {result.inserted === 1 ? 'row' : 'rows'} imported
            </div>
            {result.skipped > 0 && (
              <div style={{ fontSize: 14, color: '#4A4A4A', marginTop: 6 }}>
                {result.skipped} {result.skipped === 1 ? 'row' : 'rows'} skipped — already in contact log
              </div>
            )}
          </div>

          {/* Skipped row detail */}
          {result.skippedRows.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{
                fontSize: 12, fontWeight: 650, color: '#7A7570',
                textTransform: 'uppercase', letterSpacing: 0.5,
                marginBottom: 8,
              }}>
                Skipped duplicates
              </div>
              <div style={{ border: '1px solid #E2DBC9', borderRadius: 8, overflow: 'hidden' }}>
                {result.skippedRows.map((row, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex', gap: 16, alignItems: 'center',
                      padding: '9px 14px',
                      borderBottom: idx < result.skippedRows.length - 1 ? '1px solid #F0EBE0' : 'none',
                      fontSize: 12,
                      background: '#FAFAFA',
                    }}
                  >
                    <span style={{ color: '#7A7570', whiteSpace: 'nowrap', minWidth: 80 }}>
                      {row.isoDate}
                    </span>
                    <span style={{ color: '#0E0E0E', fontWeight: 550 }}>
                      {row.schoolName ?? 'Unknown'}
                    </span>
                    <span style={{ color: '#4A4A4A' }}>
                      {row.coachName || '—'}
                    </span>
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: 11, color: '#6B7280',
                      background: '#F3F4F6',
                      padding: '2px 8px', borderRadius: 10,
                    }}>
                      already imported
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={reset}
              style={{
                padding: '10px 24px',
                background: '#0E0E0E',
                color: '#fff',
                border: 'none',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 650,
                cursor: 'pointer',
              }}
            >
              Import another paste
            </button>
            <a
              href="/pipeline"
              style={{
                padding: '10px 24px',
                background: 'transparent',
                color: '#4A4A4A',
                border: '1px solid #E2DBC9',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              Go to pipeline
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Small sub-components ─────────────────────────────────────────────────────

function Th({ children, width }: { children?: React.ReactNode; width?: number }) {
  return (
    <th style={{
      padding: '8px 12px',
      textAlign: 'left',
      fontSize: 11,
      fontWeight: 650,
      color: '#7A7570',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      width,
    }}>
      {children}
    </th>
  )
}

function StatChip({
  label,
  value,
  color,
  dim,
}: {
  label: string
  value: number
  color?: string
  dim?: boolean
}) {
  return (
    <div style={{ opacity: dim ? 0.6 : 1 }}>
      <span style={{ fontWeight: 700, color: color ?? '#0E0E0E', marginRight: 4 }}>{value}</span>
      <span style={{ color: '#7A7570' }}>{label}</span>
    </div>
  )
}

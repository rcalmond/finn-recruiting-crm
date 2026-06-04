'use client'

import { useState } from 'react'
import type { CallPrepDoc, Coach } from '@/lib/types'
import UploadPrepDocModal from './UploadPrepDocModal'

const SD = {
  paper: '#F6F1E8', ink: '#0E0E0E', inkMid: '#4A4A4A',
  inkLo: '#7A7570', inkMute: '#A8A39B', line: '#E2DBC9',
  white: '#fff',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    timeZone: 'America/Denver',
  })
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    timeZone: 'America/Denver',
  })
}

function SourceBadge({ source }: { source: string }) {
  const isUploaded = source === 'uploaded'
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, letterSpacing: '0.03em',
      padding: '1px 5px', borderRadius: 3,
      background: isUploaded ? '#EDE9FE' : '#F1F5F9',
      color: isUploaded ? '#6D28D9' : '#64748B',
    }}>
      {isUploaded ? 'Uploaded' : 'Generated'}
    </span>
  )
}

interface Props {
  docs: CallPrepDoc[]
  schoolId: string
  schoolName: string
  coaches: Coach[]
  onRefetch: () => void | Promise<void>
}

export default function CallPrepSection({ docs, schoolId, schoolName, coaches, onRefetch }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  const latest = docs[0] ?? null
  const history = docs.slice(1)

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Section header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: SD.ink, letterSpacing: '0.02em' }}>
          CALL PREP
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          style={{
            padding: '4px 10px', borderRadius: 5,
            border: `1px solid ${SD.line}`, background: SD.white,
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', color: SD.inkMid,
          }}
        >
          Upload
        </button>
      </div>

      {/* Latest doc */}
      {latest ? (
        <div style={{
          background: SD.white, borderRadius: 8, border: `1px solid ${SD.line}`,
          padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: SD.ink }}>
                  {latest.coach_name_snapshot}
                </span>
                <SourceBadge source={latest.source} />
              </div>
              <div style={{ fontSize: 11, color: SD.inkMute, marginTop: 2 }}>
                {formatDate(latest.generated_at)}
                {latest.source === 'generated' && latest.tool_call_count
                  ? ` · ${latest.tool_call_count} research queries`
                  : ''}
              </div>
            </div>
            <button
              onClick={() => window.open(`/api/call-prep-docs/${latest.id}`, '_blank')}
              style={{
                padding: '5px 12px', borderRadius: 5,
                border: `1px solid ${SD.line}`, background: SD.white,
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', color: SD.inkMid,
              }}
            >
              Download
            </button>
          </div>
          {latest.framing_notes && (
            <div style={{
              fontSize: 11, color: SD.inkLo, marginTop: 8, fontStyle: 'italic',
              borderTop: `1px solid ${SD.line}`, paddingTop: 8,
            }}>
              {latest.framing_notes}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          background: SD.white, borderRadius: 8, border: `1px solid ${SD.line}`,
          padding: '20px 16px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 13, color: SD.inkLo }}>
            No call prep docs yet.
          </div>
          <div style={{ fontSize: 12, color: SD.inkMute, marginTop: 4 }}>
            Use the <strong>Prep for call</strong> button on the coach card to generate one, or upload an existing doc.
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => setHistoryOpen(o => !o)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, color: SD.inkMute, fontFamily: 'inherit',
              padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <span style={{
              display: 'inline-block',
              transform: historyOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s',
            }}>
              ▾
            </span>
            Prior docs ({history.length})
          </button>

          {historyOpen && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4,
            }}>
              {history.map(doc => (
                <div
                  key={doc.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 10px', borderRadius: 5,
                    background: SD.paper, fontSize: 12,
                  }}
                >
                  <span style={{ color: SD.inkMid, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {formatShortDate(doc.generated_at)} · {doc.coach_name_snapshot}
                    <SourceBadge source={doc.source} />
                  </span>
                  <button
                    onClick={() => window.open(`/api/call-prep-docs/${doc.id}`, '_blank')}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 11, color: SD.inkLo, fontFamily: 'inherit',
                      textDecoration: 'underline',
                    }}
                  >
                    Download
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload modal */}
      {uploadOpen && (
        <UploadPrepDocModal
          schoolId={schoolId}
          coaches={coaches}
          onClose={(uploaded) => {
            setUploadOpen(false)
            if (uploaded) onRefetch()
          }}
        />
      )}
    </div>
  )
}

'use client'

import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { School } from '@/lib/types'
import type { SchoolRecencyState } from '@/lib/school-recency-state'
import { SCHOOL_RECENCY_STYLE } from '@/lib/school-recency-state'
import 'leaflet/dist/leaflet.css'

// ── Icon creation ───────────────────────────────────────────────────────────

/**
 * Pin = signal fill + tier letter. No tier-colored ring.
 * PROSPECTING (white fill) gets a thin neutral border for visibility.
 * null state gets a neutral gray fill.
 */
function createSignalIcon(tier: string, state: SchoolRecencyState | null): L.DivIcon {
  const style = state ? SCHOOL_RECENCY_STYLE[state] : null
  const fillColor = style?.fillColor ?? '#9CA3A8'
  const isProspecting = state === 'prospecting'
  const isLightFill = isProspecting || !state
  const letterColor = isLightFill ? '#4A4A4A' : '#fff'
  const border = isProspecting ? '1.5px solid #C0C4C8' : '2px solid #fff'

  return L.divIcon({
    className: '',
    html: `<div style="
      width: 30px; height: 30px; border-radius: 50%;
      background: ${fillColor};
      color: ${letterColor};
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700;
      border: ${border};
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    ">${tier}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -17],
  })
}

// ── Fit bounds helper ───────────────────────────────────────────────────────

function FitBounds({ schools }: { schools: School[] }) {
  const map = useMap()
  useEffect(() => {
    const points = schools
      .filter(s => s.latitude != null && s.longitude != null)
      .map(s => [s.latitude!, s.longitude!] as [number, number])
    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] })
    } else if (points.length === 1) {
      map.setView(points[0], 10)
    }
  }, [map, schools])
  return null
}

// ── Main component ──────────────────────────────────────────────────────────

export interface SchoolWithSignal {
  school: School
  state: SchoolRecencyState | null
}

interface Props {
  schools: SchoolWithSignal[]
  onSchoolClick: (schoolId: string) => void
}

export default function SchoolsMap({ schools, onSchoolClick }: Props) {
  const mappable = schools.filter(s => s.school.latitude != null && s.school.longitude != null)
  const mappableSchools = useMemo(() => mappable.map(s => s.school), [mappable])

  // Icon cache keyed by tier+state (tier still affects the letter rendered)
  const iconCache = useMemo(() => {
    const cache = new Map<string, L.DivIcon>()
    for (const { school, state } of mappable) {
      const key = `${school.category}:${state ?? 'null'}`
      if (!cache.has(key)) {
        cache.set(key, createSignalIcon(school.category, state))
      }
    }
    return cache
  }, [mappable])

  return (
    <div style={{ height: 'calc(100vh - 200px)', minHeight: 400, borderRadius: 12, overflow: 'hidden', border: '1px solid #E2DBC9', position: 'relative', zIndex: 0 }}>
      <MapContainer
        center={[39.5, -98.5]}
        zoom={4}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds schools={mappableSchools} />
        {mappable.map(({ school, state }) => {
          const key = `${school.category}:${state ?? 'null'}`
          const stateStyle = state ? SCHOOL_RECENCY_STYLE[state] : null
          return (
            <Marker
              key={school.id}
              position={[school.latitude!, school.longitude!]}
              icon={iconCache.get(key) ?? createSignalIcon(school.category, state)}
            >
              <Popup>
                <div style={{ minWidth: 160 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                    {school.short_name ?? school.name}
                  </div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>
                    Tier {school.category} · {school.division}
                  </div>
                  {stateStyle && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 11, fontWeight: 600, color: stateStyle.textColor,
                      marginBottom: 4,
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: stateStyle.dotOutline ? 'transparent' : stateStyle.dotColor,
                        border: stateStyle.dotOutline ? `1.5px solid ${stateStyle.dotColor}` : 'none',
                        flexShrink: 0,
                      }} />
                      {stateStyle.label}
                    </div>
                  )}
                  {school.location && (
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                      {school.location}
                    </div>
                  )}
                  <button
                    onClick={() => onSchoolClick(school.id)}
                    style={{
                      background: '#0E0E0E', color: '#fff', border: 'none',
                      padding: '5px 12px', borderRadius: 6, fontSize: 12,
                      fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    View details
                  </button>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}

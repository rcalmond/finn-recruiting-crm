'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { School, Category } from '@/lib/types'
import 'leaflet/dist/leaflet.css'

// ── Tier colors for markers ──────────────────────────────────────────────────

const TIER_COLORS: Record<Category, string> = {
  A: '#16a34a',
  B: '#2563eb',
  C: '#d97706',
  Nope: '#9ca3af',
}

function createTierIcon(tier: Category): L.DivIcon {
  const color = TIER_COLORS[tier]
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 28px; height: 28px; border-radius: 50%;
      background: ${color}; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700;
      border: 2px solid #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    ">${tier}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  })
}

// Pre-create icons
const ICONS: Record<Category, L.DivIcon> = {
  A: createTierIcon('A'),
  B: createTierIcon('B'),
  C: createTierIcon('C'),
  Nope: createTierIcon('Nope'),
}

// ── Fit bounds helper ────────────────────────────────────────────────────────

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

// ── Main component ───────────────────────────────────────────────────────────

interface Props {
  schools: School[]
  onSchoolClick: (schoolId: string) => void
}

export default function SchoolsMap({ schools, onSchoolClick }: Props) {
  const mappable = schools.filter(s => s.latitude != null && s.longitude != null)

  return (
    <div style={{ height: 'calc(100vh - 200px)', minHeight: 400, borderRadius: 12, overflow: 'hidden', border: '1px solid #E2DBC9' }}>
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
        <FitBounds schools={mappable} />
        {mappable.map(school => (
          <Marker
            key={school.id}
            position={[school.latitude!, school.longitude!]}
            icon={ICONS[school.category] ?? ICONS.C}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                  {school.short_name ?? school.name}
                </div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>
                  Tier {school.category} · {school.division}
                </div>
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
        ))}
      </MapContainer>
    </div>
  )
}

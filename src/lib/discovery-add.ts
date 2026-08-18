/**
 * discovery-add.ts — the ONE add-from-catalog payload builder.
 *
 * Shared by Find Schools (DiscoverSection) and the create-flow starting list
 * (IntakeSuggest adoption) so every catalog add creates the same C-tier
 * relationship row with the discovery linkage recorded. The insert itself runs
 * on the USER client — the family_id helper default stamps the family.
 */
import type { AcademicBand, Division, School } from './types'

// Build the schools-table insert payload from a discovery row. DB `division`
// column is text, so NAIA/JUCO store honestly despite the D1|D2|D3 TS type.
// Note: schools.notes was retired (migration 064) — facets stay browsable in
// the discovery universe, not folded into a notes string.
export function toSchoolInsert(d: {
  id?: string | null; name: string; short_name: string | null; division: string; conference: string | null
  region: string | null; academic_band: AcademicBand | null; has_engineering: boolean
  city: string | null; state?: string | null
}): Omit<School, 'id' | 'created_at' | 'updated_at' | 'sort_order'> {
  const location = [d.city, d.state].filter(Boolean).join(', ') || null
  return {
    name: d.name, short_name: d.short_name, category: 'C', status: 'Not Contacted',
    division: d.division as unknown as Division, conference: d.conference, location,
    last_contact: null, head_coach: null, coach_email: null, admit_likelihood: null,
    rq_status: null, rq_updated_at: null, videos_sent: false,
    last_video_url: null, last_video_title: null, last_video_sent_at: null,
    rq_link: null, generic_team_email: null, aliases: [],
    latitude: null, longitude: null, recruiting_stage: 1,
    // T2: keep the catalog linkage — a discovery add records which
    // discovery_schools row it came from (null for off-universe adds).
    discovery_school_id: d.id ?? null,
  }
}

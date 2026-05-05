// ─── Recruiting pipeline types ───────────────────────────────────────────────

export type Division = 'D1' | 'D2' | 'D3'
export type Category = 'A' | 'B' | 'C' | 'Nope'
export type Status =
  | 'Not Contacted'
  | 'Intro Sent'
  | 'Ongoing Conversation'
  | 'Visit Scheduled'
  | 'Offer'
  | 'Inactive'
export type AdmitLikelihood = 'Likely' | 'Target' | 'Reach' | 'Far Reach'
export type ContactChannel = 'Email' | 'Phone' | 'In Person' | 'Text' | 'Sports Recruits' | 'Other'
export type ContactDirection = 'Outbound' | 'Inbound'
export type ActionOwner = 'Finn' | 'Randy' | ''

export interface School {
  id: string
  name: string
  short_name: string | null
  category: Category
  division: Division
  conference: string | null
  location: string | null
  status: Status
  last_contact: string | null        // ISO date string YYYY-MM-DD
  head_coach: string | null
  coach_email: string | null
  admit_likelihood: AdmitLikelihood | null
  rq_status: string | null           // "Completed", "To Do", "Updated", etc.
  rq_updated_at: string | null       // timestamptz — when rq_status was last set to "Completed"
  videos_sent: boolean
  last_video_url: string | null
  last_video_title: string | null
  last_video_sent_at: string | null
  rq_link: string | null
  notes: string | null
  generic_team_email: string | null
  aliases: string[]
  sort_order?: number | null
  created_at: string
  updated_at: string
}

export interface ContactLogEntry {
  id: string
  school_id: string
  date: string                       // ISO date string YYYY-MM-DD (deprecated — use sent_at for ordering)
  sent_at: string                    // ISO timestamptz — actual or approximate send time (migration 026)
  channel: ContactChannel
  direction: ContactDirection
  coach_name: string | null
  summary: string
  created_by: string | null          // auth user id; null for webhook-authored entries
  created_at: string
  snoozed_until?: string | null      // ISO timestamp; hides from Awaiting reply until this time
  dismissed_at?: string | null       // ISO timestamp; hides permanently from Awaiting reply
  handled_at?: string | null         // ISO timestamp; "Done" from Today — hides from Today, visible on school detail
  selected_for_today_at?: string | null  // ISO timestamp; locks item into Today's top 3 for this day
  // source tracking (migration 014) — optional: DB defaults apply; UI inserts omit these
  raw_source?: string | null
  source_thread_id?: string | null
  source_message_id?: string | null
  parse_status?: 'full' | 'partial' | 'non_coach' | 'orphan'
  parse_notes?: string | null
  coach_id?: string | null           // FK to coaches.id; null if no match found
  content_hash?: string | null       // sha256 dedup key for bulk-imported rows (migration 017)
  // inbound classification (migration 023)
  authored_by?: 'coach_personal' | 'coach_via_platform' | 'team_automated' | 'staff_non_coach' | 'unknown' | null
  intent?: 'requires_reply' | 'requires_action' | 'informational' | 'acknowledgement' | 'decline' | 'unknown' | null
  classification_confidence?: 'high' | 'medium' | 'low' | null
  classification_notes?: string | null
  classified_at?: string | null      // ISO timestamp; null = never classified
  // joined
  school?: Pick<School, 'id' | 'name' | 'short_name'>
}

export interface ActionItem {
  id: string
  school_id: string
  action: string
  owner: 'Finn' | 'Randy' | null
  due_date: string | null  // YYYY-MM-DD
  sort_order: number | null
  completed_at: string | null  // timestamptz; null = active, non-null = completed
  selected_for_today_at: string | null  // ISO timestamp; locks item into Today's top 3
  created_at: string
  // joined
  school?: Pick<School, 'id' | 'name' | 'short_name' | 'category' | 'status'>
}

// ─── ID Camps ────────────────────────────────────────────────────────────────

export type CampFinnStatusValue = 'interested' | 'registered' | 'attended' | 'declined'

export interface Camp {
  id: string
  host_school_id: string
  name: string
  start_date: string            // YYYY-MM-DD
  end_date: string              // YYYY-MM-DD
  location: string | null
  registration_url: string | null
  registration_deadline: string | null  // YYYY-MM-DD
  cost: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CampSchoolAttendee {
  id: string
  camp_id: string
  school_id: string
  source: string                // 'advertised' | 'confirmed' | 'rumored'
  notes: string | null
  created_at: string
}

export interface CampCoachAttendee {
  id: string
  camp_id: string
  coach_id: string
  source: string
  confirmed_at: string | null
  created_at: string
}

export interface CampFinnStatus {
  id: string
  camp_id: string
  status: CampFinnStatusValue
  registered_at: string | null
  attended_at: string | null
  declined_at: string | null
  declined_reason: string | null
  notes: string | null
  action_item_id: string | null
  created_at: string
}

/** Composed type for UI rendering — camp with all related data joined. */
export interface CampWithRelations {
  camp: Camp
  hostSchool: Pick<School, 'id' | 'name' | 'short_name' | 'category'>
  finnStatus: CampFinnStatus | null
  schoolAttendees: Array<CampSchoolAttendee & {
    school: Pick<School, 'id' | 'name' | 'short_name' | 'category'>
  }>
  coachAttendees: CampCoachAttendee[]
}

// ─── Camp proposals (discovery) ──────────────────────────────────────────────

export type CampProposalSource = 'email_extract' | 'email_extract_backfill' | 'web_search'
export type CampProposalStatus = 'pending' | 'applied' | 'rejected' | 'superseded'
export type CampProposalConfidence = 'high' | 'medium' | 'low'

export interface CampProposalProposedData {
  name: string
  start_date: string                    // YYYY-MM-DD
  end_date: string | null
  location: string | null
  registration_url: string | null
  registration_deadline: string | null
  cost: string | null
  notes: string | null
  attendee_school_ids: string[]
}

export interface CampProposal {
  id: string
  source: CampProposalSource
  source_ref: string
  host_school_id: string | null
  proposed_data: CampProposalProposedData
  matched_camp_id: string | null
  status: CampProposalStatus
  confidence: CampProposalConfidence
  notes: string | null
  created_at: string
  reviewed_at: string | null
}

// ─── Asset library ────────────────────────────────────────────────────────────

export type AssetType =
  | 'resume'
  | 'transcript'
  | 'highlight_reel'
  | 'game_film'
  | 'sports_recruits'
  | 'link'
  | 'other'

export type AssetCategory = 'file' | 'link'

export interface Asset {
  id: string
  name: string
  type: AssetType
  category: AssetCategory
  // file fields
  storage_path: string | null
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  // link fields
  url: string | null
  // shared
  description: string | null
  is_current: boolean
  version: number
  replaced_by: string | null
  uploaded_by: string | null
  created_at: string
}

// ─── Question bank ────────────────────────────────────────────────────────────

export type QuestionCategory =
  | 'Formation & Fit'
  | 'Roster & Playing Time'
  | 'Development'
  | 'Culture'
  | 'Academics & Aid'

export interface Question {
  id: string
  category: QuestionCategory
  question: string
  rationale: string | null
  is_custom: boolean
  sort_order: number | null
  created_at: string
}

// ─── School prep ─────────────────────────────────────────────────────────────

export type OverrideStatus = 'priority' | 'answered' | 'skip'

export interface SchoolQuestionOverride {
  id: string
  school_id: string
  question_id: string
  status: OverrideStatus
  context_note: string | null
  created_at: string
  updated_at: string
}

export interface SchoolSpecificQuestion {
  id: string
  school_id: string
  question_text: string
  rationale: string | null
  category: QuestionCategory
  created_at: string
  updated_at: string
}

export interface PrepResult {
  overrides: SchoolQuestionOverride[]
  school_specific_questions: SchoolSpecificQuestion[]
  call_summary: string
}

// ─── Coaches ──────────────────────────────────────────────────────────────────

export type CoachRole =
  | 'Head Coach'
  | 'Interim Head Coach'
  | 'Associate Head Coach'
  | 'Assistant Coach'
  | 'Interim Assistant Coach'
  | 'Other'

export interface Coach {
  id: string
  school_id: string
  name: string
  role: CoachRole
  email: string | null
  is_primary: boolean
  is_active: boolean
  needs_review: boolean
  sort_order: number
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── Campaigns (Phase 2a) ─────────────────────────────────────────────────────

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed'
export type CampaignSchoolStatus = 'pending' | 'sent' | 'dismissed' | 'bounced'

export interface CampaignTemplate {
  id: string
  name: string
  body: string
  created_at: string
  updated_at: string
}

export interface Campaign {
  id: string
  name: string
  template_id: string
  status: CampaignStatus
  tier_scope: string[]
  throttle_days: number
  created_at: string
  activated_at: string | null
  completed_at: string | null
  // joined
  template?: CampaignTemplate
}

/** Row in campaign_schools, with school + coach joined */
export interface CampaignSchool {
  id: string
  campaign_id: string
  school_id: string
  coach_id: string | null
  status: CampaignSchoolStatus
  sent_at: string | null
  contact_log_id: string | null
  dismissed_at: string | null
  created_at: string
  // joined
  school?: Pick<School, 'id' | 'name' | 'short_name' | 'category'>
  coach?: Pick<Coach, 'id' | 'name' | 'role' | 'email'> | null
}

// ─── Player profile (singleton) ──────────────────────────────────────────────

export interface PlayerProfile {
  id: string
  current_stats: string | null
  upcoming_schedule: string | null
  highlights: string | null
  academic_summary: string | null
  last_parsed_at: string | null
  source_asset_id: string | null
  current_reel_url: string | null
  current_reel_title: string | null
  current_reel_updated_at: string | null
  created_at: string
  updated_at: string
}

// ─── Filter state ─────────────────────────────────────────────────────────────

export interface PipelineFilters {
  status: Status | ''
  category: Category | ''
  division: Division | ''
  admit: AdmitLikelihood | ''
  owner: ActionOwner | ''
  search: string
  stale?: boolean
  overdue?: boolean
}

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
  /** @deprecated Use last_video_url != null instead. Auto-synced by video-send-detector since May 2026. This boolean is no longer maintained. */
  videos_sent: boolean
  last_video_url: string | null
  last_video_title: string | null
  last_video_sent_at: string | null
  rq_link: string | null
  generic_team_email: string | null
  aliases: string[]
  latitude: number | null
  longitude: number | null
  recruiting_stage: RecruitingStage
  sort_order?: number | null
  created_at: string
  updated_at: string
}

// ─── Recruiting Funnel ──────────────────────────────────────────────────────

export type RecruitingStage = 1 | 2 | 3 | 4 | 5 | 6

export const STAGE_META: Record<RecruitingStage, { label: string; short: string }> = {
  1: { label: 'Research',   short: 'On the list, no contact' },
  2: { label: 'Reach out',  short: 'Intro sent, chasing response' },
  3: { label: 'Engage',     short: 'Substantive two-way conversation' },
  4: { label: 'Evaluate',   short: 'Coach actively assessing Finn' },
  5: { label: 'Advance',    short: 'Post-evaluation forward motion' },
  6: { label: 'Decide',     short: 'Support/offer on the table' },
}

export type MilestoneType =
  | 'seen_live'
  | 'written_evaluation'
  | 'pre_read_requested'
  | 'pre_read_passed'
  | 'visit'
  | 'support_offered'

export const MILESTONE_META: Record<MilestoneType, { label: string; icon: string; bg: string; color: string }> = {
  seen_live:           { label: 'Seen live',           icon: '👁', bg: '#DBEAFE', color: '#1E40AF' },
  written_evaluation:  { label: 'Written evaluation',  icon: '📝', bg: '#D7EFE0', color: '#2D6A4F' },
  pre_read_requested:  { label: 'Pre-read requested',  icon: '📋', bg: '#FEF3C7', color: '#92400E' },
  pre_read_passed:     { label: 'Pre-read passed',     icon: '✓',  bg: '#DCFCE7', color: '#166534' },
  visit:               { label: 'Visit',               icon: '🏫', bg: '#E0E7FF', color: '#3730A3' },
  support_offered:     { label: 'Support offered',     icon: '🤝', bg: '#FCE4E8', color: '#9A0B23' },
}

export interface SchoolMilestone {
  id: string
  school_id: string
  milestone: MilestoneType
  occurred_on: string | null
  note: string | null
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

// ─── Messages ───────────────────────────────────────────────────────────────

export type MessageType = 'update' | 'question'
export type MessageStatus = 'active' | 'archived'

export interface Message {
  id: string
  title: string
  type: MessageType
  notes: string | null
  expires_at: string | null
  status: MessageStatus
  created_at: string
  updated_at: string
}

// ─── School Message Plan ────────────────────────────────────────────────────

export interface SchoolMessagePlanSuggestion {
  message_id: string
  reasoning: string
  timing: 'send_now' | 'after_event' | 'wait'
  priority?: number             // 1 = highest (Phase 1 rework, May 2026)
  tier?: 'primary' | 'extra'   // primary = main list, extra = "show me more"
}

export interface SchoolMessagePlan {
  id: string
  school_id: string
  finn_notes: string | null
  suggestions: { items: SchoolMessagePlanSuggestion[] } | null
  suggestions_generated_at: string | null
  suggestions_model_used: string | null
  manual_order: string[] | null  // message_ids in Finn's preferred display order
  created_at: string
  updated_at: string
}

// ─── School Conversation Summary ─────────────────────────────────────────────

export type RecommendedActionCategory = 'reply' | 'follow_up' | 'check_in' | 'wait' | 'introduce' | 'new_topic'

export interface RecommendedAction {
  description: string
  rationale: string
  category: RecommendedActionCategory
  source_message_ids?: string[]
  recommended_coach_id?: string | null
  possible_offer?: boolean            // true when inbound contains offer/admission terms not yet recorded
  possible_offer_note?: string | null // one-line description of what was detected
}

export interface SchoolConversationSummary {
  id: string
  school_id: string
  summary: string
  recommended_action: RecommendedAction
  last_contact_log_id: string | null
  generated_at: string
  model_used: string
  input_tokens: number | null
  output_tokens: number | null
  created_at: string
  updated_at: string
}

// ─── ID Camps ────────────────────────────────────────────────────────────────

export type CampFinnStatusValue = 'interested' | 'targeted' | 'registered' | 'attended' | 'declined'

// ─── Calendar Events (migration 061) ──────────────────────────────────────────
// Lightweight parallel event species merged with camps on the Get Seen timeline:
// showcases/tournaments Finn attends, and outreach send-moments he sends.

export type CalendarEventKind = 'showcase' | 'tournament' | 'outreach_moment' | 'other'
export type CalendarEventStatus = 'planned' | 'confirmed' | 'done' | 'skipped'

export interface CalendarEvent {
  id: string
  kind: CalendarEventKind
  name: string
  start_date: string            // YYYY-MM-DD
  end_date: string | null       // null = single day
  location: string | null       // null for outreach moments
  note: string | null
  status: CalendarEventStatus
  created_at: string
  updated_at: string
  school_ids?: string[]         // composed from calendar_event_schools
}

export const CALENDAR_EVENT_KIND_META: Record<CalendarEventKind, {
  label: string; description: string; noLocation?: boolean
}> = {
  showcase:        { label: 'Showcase',        description: 'A multi-team event coaches scout (ECNL, Surf Cup)' },
  tournament:      { label: 'Tournament',      description: 'A competitive event Finn plays in' },
  outreach_moment: { label: 'Outreach moment', description: 'A send you make — reel drop, season update', noLocation: true },
  other:           { label: 'Other',           description: 'Anything else on the recruiting calendar' },
}

export const CALENDAR_EVENT_STATUS_META: Record<CalendarEventStatus, { label: string; bg: string; color: string }> = {
  planned:   { label: 'Planned',   bg: '#FEF3C7', color: '#92400E' },
  confirmed: { label: 'Confirmed', bg: '#D7EFE0', color: '#1B4332' },
  done:      { label: 'Done',      bg: '#F3F4F6', color: '#374151' },
  skipped:   { label: 'Skipped',   bg: '#FEE2E2', color: '#991B1B' },
}

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
  targeted_at: string | null
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
  update_summary: string | null
  created_at: string
  reviewed_at: string | null
}

// ─── Asset library ────────────────────────────────────────────────────────────

// ─── School Discovery (migration 059) ────────────────────────────────────────

export type DiscoveryDivision = 'D1' | 'D2' | 'D3' | 'NAIA' | 'JUCO'
export type DiscoveryRegion =
  | 'Northeast' | 'Mid-Atlantic' | 'Southeast' | 'Midwest' | 'Southwest' | 'West'
export type EnrollmentBand = 'under_2k' | '2k_5k' | '5k_15k' | 'over_15k'
export type AcademicBand = 'most_selective' | 'highly_selective' | 'selective' | 'accessible'

// Program facets (migration 062). Absence in a school's `programs` array means
// unknown-or-not-offered — never guessed. Six high-frequency asks for now.
export type DiscoveryProgram =
  | 'engineering' | 'business' | 'nursing' | 'premed_health' | 'computer_science' | 'education'

export interface DiscoverySchool {
  id: string
  name: string
  short_name: string | null
  division: DiscoveryDivision
  conference: string | null
  state: string
  region: DiscoveryRegion
  enrollment_band: EnrollmentBand | null
  academic_band: AcademicBand | null
  has_engineering: boolean   // DEPRECATED (migration 062) — use `programs` instead
  programs: DiscoveryProgram[]
  city: string | null
  note: string | null
  created_at: string
}

export const ENROLLMENT_LABELS: Record<EnrollmentBand, string> = {
  under_2k: 'Under 2k', '2k_5k': '2k–5k', '5k_15k': '5k–15k', over_15k: 'Over 15k',
}
export const ACADEMIC_LABELS: Record<AcademicBand, string> = {
  most_selective: 'Most selective', highly_selective: 'Highly selective',
  selective: 'Selective', accessible: 'Accessible',
}

// Program facet ordering + display labels (used by the Discover Programs filter).
export const DISCOVERY_PROGRAMS: DiscoveryProgram[] = [
  'engineering', 'business', 'computer_science', 'premed_health', 'nursing', 'education',
]
export const PROGRAM_LABELS: Record<DiscoveryProgram, string> = {
  engineering: 'Engineering', business: 'Business', nursing: 'Nursing',
  premed_health: 'Pre-med / health', computer_science: 'Computer science', education: 'Education',
}

export type AssetType =
  | 'resume'
  | 'transcript'
  | 'highlight_reel'
  | 'game_film'
  | 'sports_recruits'
  | 'link'
  | 'other'
  | 'test_scores'

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

// ─── Call Prep Docs ──────────────────────────────────────────────────────────

export type CallPrepSource = 'generated' | 'uploaded'

export type PrepDocType = 'call' | 'camp'

export interface CallPrepDoc {
  id: string
  school_id: string
  coach_id: string | null
  coach_name_snapshot: string
  framing_notes: string | null
  storage_path: string | null      // null for a camp draft (no file yet)
  tool_call_count: number | null
  source: CallPrepSource
  generated_at: string
  created_at: string
  // Camp-prep extensions (migrations 2-4). Null on legacy call docs.
  doc_type: PrepDocType
  camp_id: string | null
  research_id: string | null
  camp_name_snapshot: string | null
  camp_dates_snapshot: string | null
  inputs: import('./camp-prep').CampPrepInputs | null
  extracted_schedule: import('./camp-prep').CampExtraction | null
  content: unknown | null
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
  archived_at: string | null
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
  message_set: string | null
  source_message_ids: string[] | null
  archived_at: string | null
  created_at: string
  activated_at: string | null
  completed_at: string | null
  // joined
  template?: CampaignTemplate
}

export interface CampaignEmailDraft {
  id: string
  campaign_id: string
  school_id: string
  coach_id: string | null
  subject: string
  body: string
  generated_at: string
  regenerated_at: string | null
  regeneration_count: number
  model_used: string
  input_tokens: number | null
  output_tokens: number | null
  created_at: string
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

// Structured test-score block (migration 060). Scores are DATA, not documents —
// the Test Scores card and any future consumer read numbers from here, not the
// free-text academic_summary. `note` is optional (e.g. a planned retake).
export interface PlayerScores {
  sat?: { total: number; math: number; ebrw: number } | null
  ap?: { subject: string; score: number }[]
  note?: string | null
}

export interface PlayerProfile {
  id: string
  current_stats: string | null
  upcoming_schedule: string | null
  highlights: string | null
  academic_summary: string | null
  player_scores: PlayerScores | null
  last_parsed_at: string | null
  source_asset_id: string | null
  /** @deprecated Use assets table (type='highlight_reel', is_current=true) instead. This field is stale — managed via manual SQL only. */
  current_reel_url: string | null
  /** @deprecated Use assets table instead. */
  current_reel_title: string | null
  /** @deprecated Use assets table instead. */
  current_reel_updated_at: string | null
  created_at: string
  updated_at: string
}

// ─── School Status Updates ────────────────────────────────────────────────────

export type ShareWithCoach = 'yes' | 'no' | 'undecided'

export interface SchoolStatusUpdate {
  id: string
  school_id: string
  body: string
  share_with_coach: ShareWithCoach
  created_at: string
  updated_at: string
}

// ─── School Offers (endgame) ─────────────────────────────────────────────────

export type OfferType = 'conditional_admission' | 'admission' | 'roster_spot' | 'preread_positive' | 'other'
export type OfferStatus = 'open' | 'accepted' | 'declined' | 'expired'

export const OFFER_TYPE_LABELS: Record<OfferType, string> = {
  conditional_admission: 'Conditional Admission',
  admission: 'Admission',
  roster_spot: 'Roster Spot',
  preread_positive: 'Pre-read Positive',
  other: 'Other',
}

export const OFFER_STATUS_STYLE: Record<OfferStatus, { bg: string; color: string; label: string }> = {
  open:     { bg: '#DCFCE7', color: '#166534', label: 'Open' },
  accepted: { bg: '#DBEAFE', color: '#1E40AF', label: 'Accepted' },
  declined: { bg: '#FEE2E2', color: '#991B1B', label: 'Declined' },
  expired:  { bg: '#F3F4F6', color: '#6B7280', label: 'Expired' },
}

export interface SchoolOffer {
  id: string
  school_id: string
  offer_type: OfferType
  headline: string
  money_note: string | null
  conditions: string | null
  key_dates: string | null
  status: OfferStatus
  received_on: string | null
  note: string | null
  created_at: string
  updated_at: string
  // joined
  school?: Pick<School, 'id' | 'name' | 'short_name' | 'category'>
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

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
export type ContactChannel = 'Email' | 'Phone' | 'In Person' | 'Text' | 'Sports Recruits'
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
  videos_sent: boolean
  notes: string | null
  generic_team_email: string | null
  sort_order?: number | null
  id_camp_1: string | null           // ISO date string YYYY-MM-DD
  id_camp_2: string | null
  id_camp_3: string | null
  created_at: string
  updated_at: string
}

export interface ContactLogEntry {
  id: string
  school_id: string
  date: string                       // ISO date string YYYY-MM-DD
  channel: ContactChannel
  direction: ContactDirection
  coach_name: string | null
  summary: string
  created_by: string | null          // auth user id; null for webhook-authored entries
  created_at: string
  snoozed_until?: string | null      // ISO timestamp; hides from Awaiting reply until this time
  dismissed_at?: string | null       // ISO timestamp; hides permanently from Awaiting reply
  // source tracking (migration 014) — optional: DB defaults apply; UI inserts omit these
  raw_source?: string | null
  source_thread_id?: string | null
  source_message_id?: string | null
  parse_status?: 'parsed' | 'partial' | 'failed'
  parse_notes?: string | null
  coach_id?: string | null           // FK to coaches.id; null if no match found
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
  created_at: string
  // joined
  school?: Pick<School, 'id' | 'name' | 'short_name' | 'category' | 'status'>
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
  needs_review: boolean
  sort_order: number
  notes: string | null
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

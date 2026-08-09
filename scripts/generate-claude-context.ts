/**
 * generate-claude-context.ts
 *
 * Regenerates ONLY Section 11 (Live Pipeline) of CLAUDE_CONTEXT.md from live Supabase data.
 * All other sections — including the manually-maintained Recent Changes table — are
 * preserved in place from the existing file. Falls back to hardcoded static content
 * if the existing file is missing or malformed (no Section 11/12 markers).
 *
 * Usage:
 *   npx tsx scripts/generate-claude-context.ts
 *
 * Add to package.json scripts:
 *   "export-context": "tsx scripts/generate-claude-context.ts"
 * Then run:
 *   npm run export-context
 *
 * Requirements:
 *   - tsx: npm install --save-dev tsx  (if not already installed)
 *   - @supabase/supabase-js: already in your deps
 *
 * Env vars needed in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   ← from Supabase dashboard → Settings → API → service_role key
 *                                  NEVER commit this key. .env.local is already in .gitignore.
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ─── Load .env.local manually (we're outside Next.js runtime) ────────────────
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error('❌  .env.local not found. Copy .env.local.example and fill in your values.')
    process.exit(1)
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '❌  Missing env vars. Add to .env.local:\n' +
    '   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co\n' +
    '   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key'
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ─── Local types (mirrors src/lib/types.ts — keep in sync if schema changes) ─
interface School {
  id: string
  name: string
  short_name: string | null
  category: 'A' | 'B' | 'C' | 'Nope'
  division: 'D1' | 'D2' | 'D3'
  conference: string | null
  location: string | null
  status: string
  last_contact: string | null
  head_coach: string | null
  coach_email: string | null
  admit_likelihood: string | null
  rq_status: string | null
  videos_sent: boolean
  notes: string | null
  updated_at: string
}

interface ContactLogEntry {
  id: string
  school_id: string
  date: string
  channel: string
  direction: string
  coach_name: string | null
  summary: string
}

interface ActionItem {
  id: string
  school_id: string
  action: string
  owner: string | null
  due_date: string | null
  sort_order: number | null
}

interface Coach {
  id: string
  school_id: string
  name: string
  role: string
  email: string | null
  is_primary: boolean
  needs_review: boolean
  sort_order: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayFormatted(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })
}

function formatSchoolBlock(school: School, logs: ContactLogEntry[], actions: ActionItem[], coaches: Coach[]): string {
  const lines: string[] = []

  lines.push(`SCHOOL: ${school.name}`)
  lines.push(`  Status: ${school.status}`)
  lines.push(`  Division: ${school.division}${school.conference ? ` — ${school.conference}` : ''}`)
  if (school.location)         lines.push(`  Location: ${school.location}`)
  if (school.admit_likelihood) lines.push(`  Admit Likelihood: ${school.admit_likelihood}`)

  // Coach data: prefer coaches table, fall back to legacy head_coach/coach_email
  const schoolCoaches = coaches.filter(c => c.school_id === school.id)
  if (schoolCoaches.length > 0) {
    for (const c of schoolCoaches) {
      const primaryMark = c.is_primary ? ' [primary]' : ''
      const emailPart   = c.email ? ` <${c.email}>` : ''
      const reviewMark  = c.needs_review ? ' ⚠ needs_review' : ''
      lines.push(`  Coach: ${c.name} — ${c.role}${emailPart}${primaryMark}${reviewMark}`)
    }
  } else {
    // Legacy fallback
    if (school.head_coach)  lines.push(`  Head Coach: ${school.head_coach}`)
    if (school.coach_email) lines.push(`  Coach Email: ${school.coach_email}`)
  }

  if (school.last_contact)     lines.push(`  Last Contact: ${school.last_contact}`)
  if (school.rq_status)        lines.push(`  RQ Status: ${school.rq_status}`)
  lines.push(`  Videos Sent: ${school.videos_sent ? 'Yes' : 'No'}`)
  if (school.notes)            lines.push(`  Notes: ${school.notes}`)

  // Action items for this school (sorted by sort_order, then created_at)
  const schoolActions = actions
    .filter(a => a.school_id === school.id)
    .sort((a, b) => {
      const aOrder = a.sort_order ?? 9999
      const bOrder = b.sort_order ?? 9999
      if (aOrder !== bOrder) return aOrder - bOrder
      return 0
    })
  if (schoolActions.length > 0) {
    const first = schoolActions[0]
    const owner = first.owner ? ` (${first.owner})` : ''
    const due   = first.due_date ? ` — due ${first.due_date}` : ''
    lines.push(`  Next Action: ${first.action}${owner}${due}`)
    if (schoolActions.length > 1) {
      schoolActions.slice(1).forEach(a => {
        const o = a.owner ? ` (${a.owner})` : ''
        const d = a.due_date ? ` — due ${a.due_date}` : ''
        lines.push(`  Also: ${a.action}${o}${d}`)
      })
    }
  }

  // Most recent 3 contact log entries for this school
  const schoolLogs = logs
    .filter(l => l.school_id === school.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)

  if (schoolLogs.length > 0) {
    lines.push(`  Contact Log (${schoolLogs.length} shown):`)
    for (const log of schoolLogs) {
      const coach = log.coach_name ? ` — ${log.coach_name}` : ''
      lines.push(`    [${log.date}] ${log.direction} via ${log.channel}${coach}:`)
      const summary = log.summary.length > 300
        ? log.summary.slice(0, 297) + '...'
        : log.summary
      // Indent each line of the summary
      summary.split('\n').forEach(l => lines.push(`      ${l}`))
    }
  }

  return lines.join('\n')
}

// ─── Existing file parsing ───────────────────────────────────────────────────
const SECTION_11_MARKER = '## 11. Live Pipeline'
const SECTION_12_MARKER = '## 12. Recent Changes'

/**
 * Parse the existing CLAUDE_CONTEXT.md to extract the header (everything before
 * Section 11) and footer (everything from Section 12 onward). This preserves
 * manually-edited content like the Recent Changes table.
 *
 * Returns null if the file is missing or malformed (no markers found).
 */
function parseExistingFile(filePath: string): { header: string; footer: string } | null {
  if (!fs.existsSync(filePath)) return null

  const content = fs.readFileSync(filePath, 'utf8')
  const s11Idx = content.indexOf(SECTION_11_MARKER)
  const s12Idx = content.indexOf(SECTION_12_MARKER)

  if (s11Idx === -1 || s12Idx === -1 || s12Idx <= s11Idx) return null

  // Header = everything up to (but not including) the Section 11 heading.
  // We trim trailing newlines from the header, then add a consistent separator.
  const header = content.slice(0, s11Idx).replace(/\n+$/, '\n\n')

  // Footer = everything from Section 12 onward. We prepend a section divider
  // so the generated Section 11 is cleanly separated.
  const footer = '\n---\n\n' + content.slice(s12Idx)

  return { header, footer }
}

// ─── Fallback static content (used only when existing file is missing/malformed)
const FALLBACK_HEADER = `# Finn Almond — College Soccer Recruiting App: Claude Context File

> **How to use:** Drop this file in the root of the repo. At the start of a Claude Code session,
> say: "Read CLAUDE_CONTEXT.md before we start."
>
> **To update the pipeline section:** \`npm run export-context\`
> (regenerates Section 10 from live Supabase data; all other sections are static)

---

## 1. What This App Is

A personal recruiting CRM for **Randy Almond** (parent/manager) and **Finn Almond** (player).
Data lives in Supabase. Frontend is Next.js + React + TypeScript deployed on Vercel.
The app tracks 10 active target schools (A: 4, B: 2, C: 4), consolidated from a summer peak of ~27
after post-camp triage — across division, coaching contacts, outreach status,
contact logs, and next actions. Two schools (IIT and Clark) have offers on the table as of August 2026.

Randy drives strategy and outreach. Finn handles player-facing tasks (RQs, emails from his
account, Sports Recruits profile management).

---

## 2. The Athlete

| Field | Value |
|---|---|
| Name | Finn Almond |
| Grad Year | 2027 |
| DOB | November 15, 2008 |
| Position | **Left Wingback** (primary) — transitioned from Striker/Winger in Nov 2025 |
| Club | Albion SC Boulder County – MLS NEXT Academy U19; Flatirons FC USL-A (summer) |
| High School | Alexander Dawson School, Lafayette, CO |
| GPA | 3.81 weighted / 3.56 unweighted |
| SAT | 1380 (Math 690 / English 690) |
| Honors | National Honor Society |
| AP Courses | AP Calculus AB (5), AP U.S. History (4), AP Human Geography (4, sophomore year), AP Chemistry (3) |
| Academic Interest | Mechanical or Aerospace Engineering (schools with engineering); Chemistry or Math (SLACs, with 3/2 engineering path) |
| Email | finnalmond08@gmail.com |

**Written evaluations on record (July 2026):** Streb/Rochester (June 20: strong 1v1 defender, passing range; develop quickness, aerials; "second tier"). Bordwick/Lafayette (July 15: not top pool at LB, roster depth). Toshack/St. Lawrence (July 12: 4/4/5/5, D2/high-D3 → low-D3 projection, strengths: consistent, 1v1 defending, getting forward). Projections triangulate to mid-D3 sweet spot; top-D3/NESCAC correctly classified as reaches.

**Offers on the table (August 2026):** IIT — conditional admission, Aerospace Engineering, $25K/yr Heald Scholarship (renewable), transcript pending; stage 5 + pre_read_passed. Clark — positive pre-read, $40K/yr minimum merit floor × 4 years, CommonApp required (open since Aug 1, application not yet started); stage 5.

---

## 3. Key Recruiting Assets

| Asset | URL / Notes |
|---|---|
| Highlight Reel | https://www.youtube.com/watch?v=Va_Z09OYcs0 — **public, lead with this** |
| Full Game Film | https://youtu.be/Zzp-YMma_8g — unlisted, **offer on request only** |
| Sports Recruits | https://my.sportsrecruits.com/athlete/finn_almond |

---

## 4. Database Schema

### Table: \`schools\`
\`\`\`
id                  uuid PK
name                text
short_name          text
category            'A' | 'B' | 'C' | 'Nope'       -- recruiting tier
division            'D1' | 'D2' | 'D3'
conference          text
location            text
status              'Not Contacted' | 'Intro Sent' | 'Ongoing Conversation' |
                    'Visit Scheduled' | 'Offer' | 'Inactive'
last_contact        date
head_coach          text
coach_email         text
admit_likelihood    'Likely' | 'Target' | 'Reach' | 'Far Reach'
rq_status           text   -- e.g. "Completed", "To Do", "Updated"
videos_sent         boolean
recruiting_stage    smallint not null default 1
                    -- 1=Research, 2=Reach out, 3=Engage, 4=Evaluate, 5=Advance, 6=Decide
                    -- Auto-derived floor for 1-3 from contact_log; manual promotion for 4-6
                    -- High-water mark: never auto-demotes
notes               text
created_at          timestamptz
updated_at          timestamptz
\`\`\`

### Table: \`school_milestones\` (migration 057)
\`\`\`
id            uuid PK
school_id     uuid FK → schools.id (cascade delete)
milestone     text not null
              -- 'seen_live' | 'written_evaluation' | 'pre_read_requested' |
              -- 'pre_read_passed' | 'visit' | 'support_offered'
occurred_on   date
note          text
created_at    timestamptz
updated_at    timestamptz
unique (school_id, milestone)
\`\`\`

### Table: \`school_offers\` (migration 058)
\`\`\`
id              uuid PK
school_id       uuid FK → schools.id (cascade delete)
offer_type      text not null
                -- 'conditional_admission' | 'admission' | 'roster_spot' | 'preread_positive' | 'other'
                -- TypeScript union OfferType, no DB constraint
headline        text not null
money_note      text
conditions      text
key_dates       text
status          text not null default 'open'
                -- 'open' | 'accepted' | 'declined' | 'expired'
received_on     date
note            text
created_at      timestamptz
updated_at      timestamptz  -- trigger: set_updated_at() from 001_initial_schema
                             -- (migration 058 originally shipped with moddatetime; trigger applied manually, file patched)
\`\`\`

Text-first fields deliberately — structure can tighten once offer #3+ exists and comparison needs emerge.
Wired into fetchSchoolContext (always fetched, no gate). Summary generator renders an OFFERS / ADMISSIONS section.
recommended_action jsonb on school_conversation_summary extended with optional \`possible_offer: boolean\` and \`possible_offer_note: string\` (no migration — jsonb).

### Table: \`action_items\`
\`\`\`
id          uuid PK
school_id   uuid FK → schools.id (cascade delete)
action      text
owner       'Finn' | 'Randy' | null
due_date    date
sort_order  integer   -- persistent manual priority order
created_at  timestamptz
\`\`\`

### Table: \`contact_log\`
\`\`\`
id                uuid PK
school_id         uuid FK → schools.id (cascade delete)
coach_id          uuid FK → coaches.id (on delete set null)
date              date
channel           'Email' | 'Phone' | 'In Person' | 'Text' | 'Sports Recruits'
direction         'Outbound' | 'Inbound'
coach_name        text          -- raw sender display name (from Gmail parse)
summary           text
gmail_message_id  text          -- non-null = ingested from Gmail
parse_status      'full' | 'partial' | 'non_coach' | 'orphan'
                  -- full: school+coach resolved; partial: school known, coach unknown (review queue)
                  -- non_coach: user-marked (sender is admin/bot/recruiter)
                  -- orphan: school unknown
parse_notes       text
created_by        uuid FK → auth.users.id
created_at        timestamptz
\`\`\`

### Table: \`assets\`
\`\`\`
id            uuid PK
name          text                          -- display name
type          'resume' | 'transcript' | 'highlight_reel' | 'game_film' |
              'sports_recruits' | 'link' | 'other' | 'test_scores'
category      'file' | 'link'
storage_path  text                          -- Supabase Storage path (files only)
file_name     text                          -- original filename (files only)
file_size     integer                       -- bytes (files only)
mime_type     text                          -- (files only)
url           text                          -- (links only)
description   text
is_current    boolean                       -- false = archived version
version       integer
replaced_by   uuid FK → assets.id
uploaded_by   uuid FK → auth.users.id
created_at    timestamptz
\`\`\`

### Table: \`questions\`
\`\`\`
id          uuid PK
question    text
rationale   text
category    'formation' | 'roster' | 'development' | 'culture' | 'aid'
is_custom   boolean                         -- true = user-added, false = seeded default
sort_order  integer
created_at  timestamptz
updated_at  timestamptz
\`\`\`

### Table: \`school_question_overrides\`
\`\`\`
id           uuid PK
school_id    uuid FK → schools.id (cascade delete)
question_id  uuid FK → questions.id (cascade delete)
status       'priority' | 'answered' | 'skip'
context_note text                           -- what we know, or why it's priority
created_at   timestamptz
updated_at   timestamptz
-- unique constraint on (school_id, question_id)
\`\`\`

### Table: \`school_specific_questions\`
\`\`\`
id            uuid PK
school_id     uuid FK → schools.id (cascade delete)
question_text text
rationale     text
category      'formation' | 'roster' | 'development' | 'culture' | 'aid'
created_at    timestamptz
updated_at    timestamptz
\`\`\`

### Table: \`coaches\`
\`\`\`
id           uuid PK
school_id    uuid FK → schools.id (cascade delete)
name         text
role         text                   -- 'Head Coach' | 'Assistant Coach' | 'Associate Head Coach' | 'Other' | etc.
email        text
is_primary   boolean                -- true = designated contact for this school
needs_review boolean                -- true = flagged for human review (coach_departed applies this)
sort_order   integer
notes        text                   -- used for endowed chair titles, misc
source       text not null          -- 'manual' (default) | 'scraped' (roster scraper) | 'from_gmail' (Gmail partials UI)
created_at   timestamptz
updated_at   timestamptz
\`\`\`

### Table: \`coach_changes\`
\`\`\`
id            uuid PK
school_id     uuid FK → schools.id (cascade delete)
change_type   'coach_added' | 'coach_departed' | 'email_added' | 'email_changed' | 'role_changed' | 'name_changed'
coach_id      uuid FK → coaches.id (on delete set null)
details       jsonb    -- shape varies by change_type; see migration 020 for per-type docs
status        'auto' | 'manual' | 'seed' | 'applied' | 'rejected'
created_at    timestamptz
reviewed_at   timestamptz
reviewer_note text
\`\`\`

### Scraper columns on \`schools\`
\`\`\`
coach_page_url              text      -- URL of school's official men's soccer coaches page
coach_page_last_scraped_at  timestamptz
coach_page_last_error       text
coach_page_scrape_enabled   boolean not null default true
                            -- false = SPA/JS-rendered page; scraper skips but URL preserved
                            -- currently false: Notre Dame (und.com is a React SPA)
\`\`\`

**SPA schools — how to handle a new one:**
1. Write the URL to \`schools.coach_page_url\` for human reference.
2. Set \`coach_page_scrape_enabled = false\`.
3. Manually insert the coaching staff into \`coaches\` (all emails null if unknown).
4. Log in CLAUDE_CONTEXT "Known SPA schools" list.

### Table: \`discovery_schools\` (migration 059)
\`\`\`
id               uuid PK
name             text
short_name       text
division         text     -- D1 | D2 | D3 | NAIA | JUCO
conference       text
state            text     -- two-letter USPS
region           text     -- Northeast (= New England + NY) | Mid-Atlantic | Southeast | Midwest | Southwest | West
enrollment_band  text     -- under_2k | 2k_5k | 5k_15k | over_15k
academic_band    text     -- most_selective | highly_selective | selective | accessible
has_engineering  boolean  -- DEPRECATED (migration 062) — use programs instead
programs         text[]    -- migration 062: engineering | business | nursing | premed_health | computer_science | education
                           -- absence = unknown-or-not-offered, NEVER guessed; seeded best-effort via supabase/scripts/program-tags.ts
city             text
note             text
created_at       timestamptz
\`\`\`
Static reference universe (1,066 rows) powering School Discovery on Get Ready — facet browse + add-to-list (C-tier) + LLM find-more-like-these. Region is derived from state (NY in Northeast). Colliding names are disambiguated in the seed AND guarded in the matcher (exactly-one-universe-match-or-refuse; ambiguous names return a verify-program flag rather than the wrong school). Program facets (migration 062) power the Programs multi-select filter and enrich the find-more prompt; has_engineering is retained for provenance but deprecated in favor of programs.

**player_profile.player_scores (migration 060):** a structured jsonb block — \`{ sat: {total, math, ebrw}, ap: [{subject, score}], note? }\` — added to the player_profile singleton. Canonical source for the Get Ready Test Scores card; the free-text academic_summary stays for prose. Seeded from the real numbers (SAT 1380; four AP scores incl. Human Geography 4).

### Table: \`calendar_events\` (migration 061)
\`\`\`
id           uuid PK
kind         text not null   -- 'showcase' | 'tournament' | 'outreach_moment' | 'other' (TS union CalendarEventKind, no DB constraint)
name         text not null
start_date   date not null
end_date     date            -- null = single day
location     text            -- null for outreach moments
note         text
status       text not null default 'planned'  -- 'planned' | 'confirmed' | 'done' | 'skipped'
created_at   timestamptz
updated_at   timestamptz     -- set_updated_at trigger (present — per the 058 lesson)
\`\`\`
Lightweight parallel event species (showcases, tournaments, outreach send-moments). Merged with camps at DISPLAY time on the Get Seen timeline; camps machinery (proposals, finn_status, coach attendance) is untouched. Realtime publication enabled.

### Table: \`calendar_event_schools\` (migration 061)
\`\`\`
event_id   uuid FK → calendar_events.id (cascade delete)
school_id  uuid FK → schools.id (cascade delete)
primary key (event_id, school_id)
\`\`\`
Optional nullable linkage — most events link no schools.

### RLS
All tables have RLS enabled. Any authenticated user gets full access.
Use the **service role key** in scripts/server-side code to bypass RLS.
Use the **anon key** in the frontend (Next.js client components).
---

## 5. Email Subject Line Format

\`\`\`
Finn Almond | Left Wingback | Class of 2027 | [School Name]
\`\`\`

All outreach since Nov 2025 uses this format. Pre-Nov 2025 emails used a striker framing
and are legacy — note this in contact log if surfaced.

---

## 6. Outreach Channel Strategy

- **Sports Recruits**: Primary channel for initial outreach
- **Direct Email**: Escalate to direct email for Tier A schools with no SR response after 2+ attempts
- **Rule**: Never use both channels simultaneously for the same school
- **Colorado School of Mines**: All outreach on hold — HC vacancy. Resume when new HC announced.

---

## 7. Recruiting Philosophy (informs feature decisions)

- The striker → LWB transition (Nov 2025) is the central narrative in all current outreach
- Engineering program quality = weighted equally with soccer fit; schools without real engineering deprioritized
- Highlight reel is always the lead asset; full game film only on request
- Coach emails: under 200 words, school-specific, never templated generically
- Category A schools get maximum personalization: specific engineering program refs, prior interaction context

---

## 8. Tech Stack

- **Frontend**: Next.js + React + TypeScript
- **Database**: Supabase (PostgreSQL) with RLS enabled
- **Auth**: Supabase Auth
- **Styling**: Tailwind CSS + inline styles (March parchment vocabulary)
- **Deployment**: Vercel (auto-deploy from main; no Vercel CLI — see CLAUDE.md)
- **Design vocabulary**: Parchment base (#F6F1E8), rust (#B5502F) = act-now accent, warm charcoal (#2E2B28) = weight/endgame, calm green (#2D6A4F) = early phases, ink (#0E0E0E) = primary text
- **Public / auth split**: The root route \`/\` is now a PUBLIC, auth-free marketing page (see the Marketing Front Door section in 9). \`/demo\` is a public stub. Everything else is auth-gated. Auth is enforced by allowlist in \`src/proxy.ts\` (Next middleware): only \`/\`, \`/demo\`, \`/auth/*\`, \`/api/*\`, and \`/design-preview/*\` skip the login redirect — when adding a new public route, add it to that allowlist.
- **Navigation**: Four journey phases + Schools + Settings
  - \`/get-ready\` — profile, assets (visual cards + Test Scores), messages, school list, School Discovery (live — facet browse + find-more, migration 059)
  - \`/get-seen\` — the merged 10-week calendar timeline (camps + showcases/tournaments + outreach moments), camps, campaigns
  - \`/get-recruited\` — the daily surface (queue, pipeline grid); signed-in users also land here from the marketing page's Open-the-app button
  - \`/get-in\` — offers, admissions, the endgame
  - \`/schools\` — top-level, phase-independent
  - Settings — collapsed: Coach Changes, Parse Review, Classification Review, Camp Proposals, Gmail Settings
  - Routes for Campaigns, Messages, Library, Camps remain reachable via deep links from phase pages
- **Key paths**:
  - \`src/lib/types.ts\` — TypeScript types (School, ContactLogEntry, ActionItem, SchoolOffer, etc.)
  - \`src/lib/supabase.ts\` — Supabase client initialization
  - \`src/lib/school-context.ts\` — shared fetchSchoolContext for all LLM-calling routes
  - \`supabase/migrations/\` — schema migrations (numbered, applied via Supabase dashboard)
  - \`supabase/scripts/\` — data migrations and one-shot scripts (committed)
  - \`scripts/generate-claude-context.ts\` — this script

---

## 9. Known Gaps and Limitations

### Coach Roster Scraper
- **SPA schools** (JS-rendered, static fetch fails): currently only **Notre Dame** (\`und.com\`).
  These have \`coach_page_scrape_enabled = false\` — scraper skips them, URL is preserved.
  Staff must be seeded manually; updates require manual checking.
- **Email ambiguity**: If a school uses a shared team inbox (e.g., \`mensoccer@calpoly.edu\`),
  the scraper suppresses it (shared email detection). Coaches at that school will have null email.
- **Shared domains**: Some schools share CDN-hosted sites — rate limiting (2s delay) mitigates this.
- **Gmail partial re-linking**: Handled by \`reparsePartialsForSchool()\` in \`src/lib/gmail-resolve.ts\`.
  Fires automatically after every coach_added event (coach-changes review) and after create-and-link
  in the Gmail partials UI. Backfill script: \`scripts/backfill-reparse-partials.ts\`.
  Initial backfill (2026-04-23): 17 partials checked, 4 rescued (Caltech x3, Colgate x1). 13 remain.

### Gmail Partials — Part 5b (migration 022, shipped 2026-04-23)

**Scope filter (architectural note):**
\`/settings/gmail-partials\` and \`scripts/backfill-reparse-partials.ts\` filter on
\`gmail_message_id IS NOT NULL\`. This intentionally scopes the review UI to Gmail-sourced partials,
where rescue means matching a sender name to a coach record. Non-Gmail partials (Sports Recruits
webhook, bulk importer) are excluded — they require a different resolution strategy
(name-matching against a different signal set, not email-matching). Do not remove this filter
without also building SR/bulk resolution logic, or the UI will surface rows it cannot resolve.

**SR/bulk partials gap (technical debt, ~123 rows as of backfill):**
Sports Recruits and bulk-importer partials have \`school_id\` set but no \`coach_id\` and no
\`gmail_message_id\`, so they have no resolution path through the current UI. They are mostly
historical rows from pre-scraper imports — not a growing problem. Future options:
- Separate SR-partials review UI (mirrors gmail-partials but matches on \`coach_name\` string)
- Bulk name-matching pass against \`coaches.name\`, similar to \`reparse-orphan-domains.ts\`
- Enrich SR webhook payloads with stronger coach identifiers before the row hits \`contact_log\`
Not urgent. Revisit if the queue grows or if a name-matching pass is built for another reason.

**coaches.source column — current state and expected evolution:**
Immediately after migration 022, all 236 existing coaches have \`source='manual'\` (the column
default). No retroactive backfill of \`'scraped'\` was performed — distinguishing scraper-inserted
coaches from manually-seeded ones via \`coach_changes\` history was ambiguous. Going forward:
- Scraper apply path writes \`source='scraped'\`
- Create-and-link in \`/settings/gmail-partials\` writes \`source='from_gmail'\`
- Manual inserts (seed scripts, direct SQL) default to \`'manual'\`
The column becomes a useful diagnostic over time. After several months of operation,
\`select source, count(*) from coaches group by source\` will show where coaches enter the system.
Not actionable in the short term.

**Backfill math (for audit / future verification):**
- Pre-deploy: 140 partial + 96 full
- Backfill scope: 17 Gmail partials (\`gmail_message_id IS NOT NULL\`)
- Rescued: 4 (Caltech x3 — Rockne DeCoster; Colgate x1 — "Rick Brown" matched "Ricky Brown")
- Post-backfill: 136 partial + 100 full
- Gmail partials resolved via review UI: 1 (see forwarded-message bug below)
- Gmail partials remaining: 0
- Non-Gmail partials (out of scope): 123

**Forwarded-message parser bug (known, not fixed in parser — 2026-04-23):**
When Randy forwards an inbound coach email to himself/Finn, the Gmail sync ingests it as a
separate message. The outer \`From\` is Randy → \`direction=Outbound\`. If the original subject
contains a school name that collides with another school (e.g. "MIT Camp Attendee" in a Colgate
email), the subject-based school match fires first and wins over the domain match, because the
domain match is skipped when outer From = Randy's address.

Concrete case: \`contact_log fd453e74\` — Randy forwarded Rick Brown's Colgate reply. Subject
"Re: MIT Camp Attendee | 2027 Striker | Finn Almond" → parser matched MIT (low confidence).
Outer From=Randy → Outbound. Manual fix applied 2026-04-23: school_id=Colgate, direction=Inbound,
parse_status=non_coach (the actual Colgate/Rick Brown contact already exists in row 628d6317 as
status=full; marking the forwarded copy non_coach avoids duplication).

Parser fix needed: detect "Forwarded message" in raw_source, extract inner \`From:\` header domain
for school matching, and classify direction as Inbound (since the forwarded content is an inbound
reply). Do not remove the forwarded-message detection logic currently in place — it just needs
to act on the inner headers, not the outer.

**SendGrid webhook parse_status vocabulary fix (2026-04-24):**
The SendGrid inbound webhook previously wrote \`parse_status='partial'\` for non-recruiting inbound
(non-SR emails) and for SR notifications where no school could be matched — both cases where
\`school_id IS NULL\`. This violated Phase 5b vocabulary (\`partial\` = school known, coach unknown;
\`orphan\` = school unknown). 21 historical rows were relabeled to \`'orphan'\` on 2026-04-24; the
source-level fix was applied in the same session. Going forward:
- Non-SR notifications → \`'orphan'\` (school_id=null, no classification hook)
- SR notifications with no school match → \`'orphan'\` (school_id=null, no classification hook)
- Outbound CC fallback (parseSRPaste fails) → \`'orphan'\` (school_id=null)
- Classification (Haiku) only fires when \`school_id IS NOT NULL\` in both the live hooks and backfill

### Inbound Classification — Phase 1 (migration 023, shipped 2026-04-23)

**Two-axis model:** Every inbound \`contact_log\` row gets classified on two independent axes:
- \`authored_by\`: \`coach_personal\` | \`coach_via_platform\` | \`team_automated\` | \`staff_non_coach\` | \`unknown\`
- \`intent\`: \`requires_reply\` | \`requires_action\` | \`informational\` | \`acknowledgement\` | \`decline\` | \`unknown\`

**Classifier:** \`src/lib/classify-inbound.ts\` — Claude Haiku (\`claude-haiku-4-5-20251001\`), fire-and-forget.
- Exports \`classifyInbound(input)\` and \`classifyAndUpdate(admin, rowId, input)\`
- Truncates body to 2000 chars for cost control (2000 captures signature blocks with coach title/role)
- Fallback: \`{unknown, unknown, low, "classifier parse error..."}\` on any failure
- Never throws — all errors are logged and swallowed
- Prompt updated 2026-04-24: stricter confidence rubric + Example 7 (recruiting-template pattern).
  Rule: when email has both a pleasantry ("keep us updated") AND concrete action links (forms, camps),
  classify as \`requires_action\` — concrete asks take priority over conversational framing.

**Live hooks:** Both \`/api/cron/gmail-sync\` and \`/api/webhooks/sendgrid-inbound\` fire \`classifyAndUpdate\`
as a dynamic import after every successful Inbound insert. Uses \`dynamic import().then().catch()\` so
classification never blocks or breaks the insert path.

**Backfill:** \`scripts/backfill-inbound-classification.ts\` — supports \`--dry-run\` and \`--reclassify-all\`.
Rate-limited to 5 calls/sec (200ms delay). Cost ~$0.00085/row (Haiku pricing).

**Review UI:** \`/settings/classification-review\` — shows all low-confidence classified inbound rows.
Groups by school. Per-card: authored_by + intent chips, Haiku notes, snippet with expand, override dropdowns,
"Save override" (sets confidence=high, removes from queue) and "Mark unknown" buttons.
Low-confidence count badge appears in sidebar nav ("Email Review" link).

**Today visibility gates (as of Phase 2b — 2026-04-29):**

An inbound contact_log row appears in Today's tactical zone when ALL of:
1. Tier: school.category IN (A, B, C) — Nope excluded via \`isTargetTier()\`
2. Channel: Email or Sports Recruits — phone/text/in-person don't trigger reply expectations
3. Classification: \`authored_by IN (coach_personal, coach_via_platform)\` AND
   \`intent IN (requires_reply, requires_action)\`. Unclassified rows (classified_at IS NULL)
   included conservatively.
4. Thread state: no outbound with later sent_at for the same school (via \`isAwaitingReply()\`)
5. Not handled (\`handled_at IS NULL\`), not dismissed (\`dismissed_at IS NULL\`), not snoozed
6. Window: <= 180 days old

**"Done" vs "Dismiss" semantics:**
- **Done** (handled_at): Finn took action (replied, called, etc.) and wants to clear from Today.
  The inbound row remains visible on school detail's timeline with no special treatment.
  Per-row, not per-school — new inbounds from the same school still surface.
- **Dismiss** (dismissed_at): genuinely doesn't need a reply (FYI, decline, etc.).
  Row shows "Dismissed · Undo" on school detail timeline. Available on school detail only,
  not on Today cards.
- **Snooze** (snoozed_until): temporarily hide for N days. Available on both Today and school detail.

Implementation note: tier filtering, if ever added back, should apply to proactive outbound surfaces
(campaigns, action items for follow-ups), NOT to reactive reply-needs surfaced from inbound coach
questions.

**Tier selector:** School detail page (\`SchoolDetailClient.tsx\`) now shows a dropdown to change
\`schools.category\` (A/B/C/Nope) inline. Uses existing \`useSchools().updateSchool()\` — no new API endpoint.
No migration needed (category column already existed).

**Empirical calibration results (2026-04-24, 70-row backfill):**
- Distribution: 40 requires_action (57%), 8 requires_reply (11%), 9 acknowledgement (13%), 8 informational (11%), 2 decline (3%), 1 staff_non_coach×informational, 2 team_automated×requires_action
- Confidence: 67 high / 3 medium / 0 low
- Today "Awaiting your reply" after filter: 3 rows in 90-day window (Dale Jordan/Stevens, Teren Schuster/SD Mines, Rob Harrington/MSOE)

### Phase 2a — Campaigns Foundation (migration 024 + 024b, deployed to production 2026-04-27)

**Status:** Phase 2a is fully deployed to production. Migrations 024 + 024b applied in
production. The body of work spans Milestones 0–3.5 (schema, wizard, detail view, add-school,
draft review modal, AI personalization) plus post-milestone fixes (CC reminder, mark-as-sent
refactor, outbound auto-linking forward and reverse, optimistic concurrency).

**Campaign outcomes:**
- **Wingback campaign (April 2026):** Completed — all 40 schools either sent or dismissed.
  Status = \`completed\`.
- **RQ campaign (spring 2026):** Retired — status = \`completed\`, zero sends made. The RQ
  "campaign" was not actually a messaging campaign; it was a personal checklist for updating
  Finn's position in each school's recruiting questionnaire. The data migration (024b) grouped
  it with wingback because both originated as recurring action_items, but RQ was a task list
  that Finn worked through directly outside the campaigns system. When the template builder hit
  "insufficient historical sends to synthesize from," that was the system signaling "this isn't
  a campaign" — the signal was missed at migration time.

**Schema (migration 024):** Three new tables — \`campaign_templates\`, \`campaigns\`,
\`campaign_schools\` — see Section 4 for column definitions. RLS pattern matches action_items
(authenticated users full access). Realtime publication enabled on all three tables for
reactive UI updates.

**Data migration (024b):** Migrated 40 wingback + 38 RQ recurring outreach tasks from
action_items into campaign_schools rows. 4 protected one-offs preserved in action_items
(IDs documented in Section 4 under action_items).

Reconciliation results:
- **Wingback campaign — April 2026:** 40 schools total, 20 status='sent' (matched to
  contact_log rows from prior outreach, 60-day window with \`summary ilike '%wingback%'\`),
  20 status='pending'. Status remains 'draft' — Finn will review template before activating.
- **RQ campaign — spring 2026:** 38 schools total, all status='pending'. No matching
  contact_log entries found (RQ outreach hasn't started yet — these were planned, not sent).
  Template body is a TODO PLACEHOLDER — Finn must author the body text before activating.

**UI (Milestones 1 through 3.5):**

Routes:
- \`/campaigns\` — list view with name, status, pending/sent/dimsd counts, created date
- \`/campaigns/new\` — 3-step wizard (name + template, school checklist, throttle)
- \`/campaigns/[id]\` — detail view with header, template section (read-only with edit),
  schools table grouped by status, status transition buttons, "+ Add school" action
- Draft review modal (opens from "Draft →" button on a pending row)

Send flow: copy-paste model only — no actual sending. Finn copies the rendered body to
clipboard, sends via his Gmail or SR account manually, then clicks "Mark as sent via
Gmail" or "Mark as sent via SR" in the modal. Modal creates a contact_log row with
\`channel='Email'\` (Gmail) or \`'Sports Recruits'\` (SR), \`direction='Outbound'\`, summary =
first 140 chars of rendered body (falls back to campaign name if body is empty).

**Channel recommendation logic:** The Channel column in the Pending section reads the
school's most recent inbound's \`authored_by\`. \`coach_personal\` → recommend Gmail.
\`coach_via_platform\` → recommend SR. \`team_automated\`, \`staff_non_coach\`, \`unknown\`,
or no inbound → no recommendation, displayed as "—".

**Add School action (Milestone 2.5):** Schools can be added to a campaign after creation
via a search modal on the detail view. Default list shows only schools matching
\`campaigns.tier_scope\` (A+B); "All tiers" toggle includes C-tier. Schools already in the
campaign (regardless of status — pending, sent, or dismissed) are excluded from the list.
Dismissed schools are restored via the Dismissed section, not re-added.

**Personalize with AI (Milestone 3.5):** Button in the draft review modal calls Anthropic
API (Haiku 4.5) to fill in the template's bracketed placeholders (\`[Finn: add school-
specific note...]\`, \`[Finn: add current stats...]\`) using:
- School context (name, tier, division, conference, location, notes)
- Coach context (name, role)
- Recent inbound history (last 2-3 inbound contact_log rows for this school, with
  authored_by + summary + date)
- Finn's player profile (Section 2 of this file)

System prompt explicitly instructs:
- Avoid quoting or paraphrasing the coach's prior message back at them (mirror-y
  responses are off-putting)
- Stats hallucination guard: the \`[Finn: add current stats, highlights, or recent
  results]\` bracket is replaced with \`[TODO: stats]\` rather than filled, since the
  system has no durable stats source. Finn fills this manually.
- Other brackets that can't be confidently filled get \`[TODO: <description>]\`.

Streaming token-by-token into the textarea. Send/dismiss buttons disabled during stream.
Generated content is editable — Finn always reviews before clicking Mark as sent.
Per-school edits do NOT modify the campaign template.

### Phase 2a Tech Debt and Open Questions

**Cross-campaign throttle enforcement (deferred to Phase 2b):**
\`campaigns.throttle_days\` column exists (default 7) but no code reads it in 2a. In 2b,
the system should prevent a school from receiving a campaign send if it received any
campaign send within the last \`throttle_days\` days, regardless of which campaign.

**Reply linking (deferred to Phase 2b):**
When a coach replies to a campaign email, the inbound contact_log row should link back
to the originating \`campaign_schools\` row (primary match by Gmail thread_id, fallback by
school_id within 14-day window). This enables "campaign reply rate" metrics and surfaces
reply expectations on the Today screen.

**Today screen campaign cards (deferred to Phase 2b):**
The Today view should surface campaign-driven action ("3 wingback drafts ready to send")
once campaigns are active.

**Save-as-template from completed campaign (deferred to Phase 2c):**
A completed campaign's per-school edits could be the seed for the next campaign's template
(common patterns Finn types repeatedly).

**RQ template body — moot (campaign retired):** The RQ campaign was retired without sends.
See "Campaign outcomes" above for context. The TODO placeholder template is vestigial.

**needs_review flag not surfaced in AI personalization context (identified 2026-04-26):**
When \`campaign_schools.coach_id\` points to a coach with \`needs_review=true\`, the AI
personalization prompt receives the coach name without any warning. Example: Cornell's
John Smith (HC, \`needs_review=true\`) — the AI confidently addresses "Coach Smith" without
hedging. Phase 2b should pass \`needs_review\` into the prompt context and instruct the AI
to use a generic salutation ("Coach," or "Coaching Staff,") when the flag is set.

**SR notification school-name aliases incomplete (identified 2026-04-27):**
SR's outbound CC notifications use full school names ("University of Michigan") while the
\`schools\` table uses shorter names ("U Michigan" / short_name "Michigan"). When the SR parser
can't match the long form, the row becomes \`parse_status='partial'\` with \`school_id=null\`,
and the campaign linker silently skips it (no school_id = no link attempt). Michigan example
(2026-04-27): contact_log row \`61f5ceb6\` created as partial+orphan, \`campaign_schools\` left
with "Pending capture", required manual rescue.

Mitigation pattern: when this happens, add the long-form name as an alias to the affected
school's \`aliases\` column, then manually rescue the contact_log row + link the campaign_schools
row.

Future improvement candidates:
1. Surface partial contact_log rows tied to recent campaign sends in the UI — currently
   invisible until manually queried
2. Backfill SR-style aliases for all schools in active campaigns proactively
3. Add a "Pending capture" → "Capture failed (orphan)" state transition in the campaign
   detail view after some timeout, with a link to the partial contact_log row for diagnosis

**DraftEmailModal subject-in-summary bug — RESOLVED:**
The old DraftEmailModal and its "Log this outreach" button were deleted in Email Gen v2.
The unified DraftModal has no manual contact_log write — CC ingestion pipeline handles it.
Historical rows logged via the old modal still have subject in summary; not worth fixing
retroactively (affects ~5 rows total).

**Phone-call / in-person contact logging:**
No UI for capturing off-channel coach interactions (phone calls, ID camp meetings, campus
visits). Currently these have to be logged via direct SQL or admin. Future: dedicated "Log
contact" action on school detail page that creates a contact_log row without requiring an
email body. Phase 2c candidate.

**contact_log.sent_at backfill is approximate for historical rows (pre-2026-04-29):**
Stable ordering within day, correct dates, but absolute times reflect ingestion time-of-day,
not actual send time. Future fix: parse raw_source for actual Date headers (gmail_message_id
rows can re-fetch from Gmail API) to recover real send times. Estimated half a day of work;
deferred until accuracy matters.

**contact_log.date column is deprecated for ordering:**
Use sent_at for all sort and comparison operations. The date column still holds the calendar
day (YYYY-MM-DD) and is used for display labels and days-waiting calculations. Do not remove
— it remains useful as a simple date reference. Just don't sort by it.

**Action item owner field is hardcoded dropdown (Finn/Randy):**
Future: text input with autocomplete from prior owners, or proper user/owner reference table.
Not blocking — realistic owner set is Finn + Randy for now.

**New campaign authoring flow uses legacy {{placeholder}} template model:**
Could be redesigned to leverage the same AI generation flow as individual emails (intent
description → AI-suggested template → refine → save). Phase 2b/2c candidate, depends on
Finn driving a real new campaign that exercises the use case.

**30 schools have null rq_updated_at despite rq_status='Completed':**
These existed before migration 028 added the column. Date populates going forward on any
status change to Completed. Historical completion dates are unrecoverable.

**30 schools show old striker reel (PFdDT5YVHQc) as last video sent:**
Future feature: identify schools where last_video_url != current_reel_url AND last_contact
>= 30 days to trigger reel-refresh outreach. The data is there; the feature just needs a
"stale reel" signal surface.

**YouTube oEmbed not triggered on real-time contact_log inserts:**
Backfill script populated last_video_* for existing rows. New contact_log inserts with
YouTube URLs don't auto-update schools.last_video_*. Future: add a post-insert hook or
database trigger. Low urgency — Finn sends videos infrequently enough that manual re-run
of the backfill script covers it.

**SR notification deduplication gap — partially addressed:**
The isSRNotification brand detection bug (missing "SportsRecruits" without .com) was fixed
2026-04-30 — SR notifications with coach names in subject are now correctly detected.
Cross-source dedup (Gmail sync vs SR notification for same message) remains unbuilt. Low
urgency; duplicates are harmless and manually cleaned when spotted.

**Asset library / player_profile UI for managing current_reel not yet built:**
Current reel fields (current_reel_url, current_reel_title, current_reel_updated_at) are
populated via manual SQL for v1. Future: editable in the asset library or player profile UI.

**Batch flows only exist for reel_coverage prompt:**
stale_tier_a, rq_refresh, and pipeline_shape use simple "View list" modals with click-through
to school detail. Future: batch flows for those prompts too (e.g., batch RQ update flow).

**LLM-augmented strategic prompts deferred to v2:**
v1 ships with 4 hardcoded prompts. Future: LLM generates dynamic prompts based on pipeline
state (ID camp planning, visit planning, pipeline gaps, recruiting timeline awareness).

**ID camp and visit planning prompts not yet built:**
Waiting on ID camp product features. Likely tied to a schools.id_camp_dates or similar schema.

**Classifier intent inconsistency (requires_reply vs requires_action):**
The classifier doesn't reliably distinguish between these two intents. Today's scoring
includes both as a workaround (both get intent_multiplier=1.0). Future: either merge the
two intents in the classifier prompt, or add classifier examples that disambiguate them
more reliably.

### Tech Debt and Open Questions (Phase 1 — 2026-04-24)

**Decline context staleness:**
Declines may become outdated when underlying circumstances change. Two current examples:
- CO School of Mines: declined Finn as striker (Feb 2026 via Ben Fredrickson); Finn now plays
  wingback; HC position also in transition. Mines stays Tier A.
- Carnegie Mellon: declined Finn as striker (Oct 2025 via Ross Macklin); Finn now plays wingback.
  CMU stays Tier A.
Future consideration: declines should carry context (evaluated position, evaluating coach) so the
system can flag "this decline may be stale given position change X or coach departure Y."

**Non-recruiting email pollution in contact_log:**
Some contact_log rows are not recruiting contacts at all:
- 21 SendGrid-webhook rows (newsletters, webinar invites, news articles) — relabeled to
  parse_status='orphan' and excluded from classification via school_id IS NOT NULL filter.
- Row 3840cbd3 was Randy's own forwarded email to Finn (about Colgate/MIT Camp context), ingested
  via thread-tracking — manually relabeled parse_status='non_coach', authored_by/intent='unknown'.
Systemic issue: ingestion pipeline doesn't distinguish thread participants. When a thread starts
as Finn→Coach, subsequent messages from non-coach participants (Randy, family, forwarded content)
get ingested as if they were coach replies. Future fix: filter inbound rows where sender email
matches known family addresses (rcalmond@*, etc.); exclude from contact_log ingestion at source.

**MIT assistant coach email coverage:**
2 of 4 MIT coaches (assistants Jutamulia and Griffin) have null email addresses in the coaches
table. Likely a scraper limitation — MIT's public staff page may not list assistant emails.
Not surfacing as a problem currently; flag if future inbound from these coaches arrives and fails
to match. (Earlier note suggesting MIT coach list is incomplete was based on a misread of row
3840cbd3 — Randy's forwarded email, not a coach message. Gerard Miniaci is in the DB with a
valid email.)

### Phase 2b — School Detail Two-Way (shipped 2026-04-29)

**Group A — Data correctness:**
- Migration 026: \`sent_at\` timestamptz NOT NULL on contact_log. Backfill of 289 rows.
  Shared \`resolveSentAt()\` helper. All four ingestion paths write sent_at from email Date
  headers. Timeline sorts by sent_at. Staleness calculation uses sent_at. Fixed Stevens
  Apr 22 inbound/outbound ordering bug.

**Group B — Capabilities:**
- Migration 027: action_items \`completed_at\`. Non-destructive completion, "+ Add action item"
  inline form, "Recently completed" section (last 5 per school).
- Manual contact log entry: inline form on school detail conversation section. Direction,
  channel (Phone/Text/In Person/Email/Other), coach dropdown, date, time, summary. Edit and
  delete for source='manual' rows. Timezone-correct sent_at via Mountain offset calculation.
- Migration 028: \`rq_updated_at\`, \`last_video_url\`, \`last_video_title\`, \`last_video_sent_at\`
  on schools. Video backfill: 44 schools populated via YouTube oEmbed.
- Migration 029: rq_status enum cleanup (collapsed legacy values).
- Right-rail polish: all About panel fields editable inline — notes (textarea), RQ status
  (dropdown with rq_updated_at), Tier (dropdown A/B/C/Nope), Admit (dropdown with null
  option), video display (hyperlinked title + sent date). School detail is now fully
  two-way: every field is viewable and editable without leaving the page.

### Phase 3a — Today Tactical Zone (shipped 2026-04-30)

**Foundation:**
- Shared \`src/lib/awaiting-reply.ts\` with \`isAwaitingReply()\` and \`isTargetTier()\` — single
  source of truth for reply detection, used by both signals.ts and todayLogic.ts
- Tier filter: Nope excluded from all awaiting/cold signals
- Channel filter: only Email and Sports Recruits trigger reply expectations
- sent_at comparisons replace date column for timezone-correct same-day detection
- Intent whitelist expanded: requires_reply AND requires_action both surface in Today
  (classifier doesn't reliably distinguish between them)

**Tactical scoring (\`src/lib/today-scoring.ts\`):**
- Score = base x tier x intent x decay + days_bonus
- Base: inbound_awaiting=10, going_cold=8, action_overdue=12, action_due_today=8, action_due_tomorrow=5
- Tier: A=2.0, B=1.5, C=1.0, Nope=excluded
- Intent: requires_reply/requires_action=1.0, acknowledgement=0.5, informational=0.3, decline=excluded
- Decay: 0-30d=1.0, 31-60d=0.7, 61-90d=0.4, 91+=0.2
- Days bonus: +1/day capped at +20
- Type categorization: going_cold (A/B + 5+ days), inbound_awaiting (everything else)
- Tiebreaker: type priority (awaiting > cold > action), then oldest first
- One item per school: most recent unreplied inbound wins

**UI:**
- TacticalSection replaces HeroSection, AwaitSection, WeekSection, ColdSection
- Top 3 cards with type-specific styling (teal=awaiting, gold=cold, neutral=action)
- One-click actions: inbound→Draft reply modal, cold→Open school, action→checkbox complete
- Done + Snooze 7d on each card (no Dismiss from Today)
- HandledSection: up to 3 recently handled items with Undo

**State architecture:**
- Daily selection locked on first Mountain-time day visit via selected_for_today_at
- selectedIds Set<string> + derive from live hooks (single source of truth)
- Symmetric optimistic updates: markHandled/markUnhandled in useContactLog

**Migrations:** 030 (handled_at), 031 (selected_for_today_at on contact_log + action_items)

### Phase 3b — Today Strategic Zone (shipped 2026-04-30)

**Four hardcoded prompts (\`src/lib/strategic-prompts.ts\`):**
- \`reel_coverage\`: A/B schools where \`last_video_url != current_reel_url\` and no
  \`batch_reel_sends\` row for the current reel. Score: count/total.
- \`rq_refresh\`: A/B schools where rq_status != Completed OR rq_updated_at IS NULL OR
  rq_updated_at < 60 days ago. Score: count/total.
- \`stale_tier_a\`: Tier A schools with no outbound in 30+ days, excluding schools in
  tactical selection. Score: min(count/8, 1.0) * 1.5.
- \`pipeline_shape\`: surfaces when Tier A < 8 OR Tier B < 6. Score: 1.0 (A<8) or 0.5 (B<6).

**Scoring and visibility:**
- Top 3 by relevanceScore. Weekly cadence (Sunday 00:00 MT week boundary).
- Visibility: !skippedThisWeek AND count > 0 AND relevanceScore > 0.
- Gap-focused summaries ("X of Y need attention"), no success-state UI.
- Server-side weekly skips via \`strategic_skips\` table.
- \`getCurrentWeekStart()\` uses Intl.DateTimeFormat for timezone-safe Sunday calculation.

**StrategicPrompt architecture:**
- \`affectedSchoolIds\`: schools still needing the action (drives prompt card count)
- \`allTargetSchoolIds\`: full target set including already-done (drives batch flow modal)

**BatchReelModal (reel_coverage action):**
- Lists all target A/B schools with state from \`batch_reel_sends\` (pending/sent/skipped)
- Click any pending/skipped school to draft (any order — not forced sequential)
- DraftModal opens with TaskContext \`{type: 'send_reel', metadata: {reelUrl, reelTitle}}\`
  → reel-focused topic suggestions and draft generation
- Sent = terminal (locked, checkmark). Skipped = re-clickable (revisit pattern).
- Close-without-send: reverts to pre-draft state, no DB write.
- State persists via \`batch_reel_sends\` table. Mount-time: most recent row per school wins.
- Email path: writes \`sent_via='Email'\`. SR path: writes \`sent_via='Sports Recruits'\`.

**School detail RQ enhancements:**
- \`rq_link\` inline editable (pencil-on-hover pattern)
- "Open RQ" link (visible when rq_link populated, opens in new tab)
- "Mark updated" one-click button (bumps rq_updated_at = now())

**Migrations:** 032 (rq_link, current_reel_*, strategic_skips), 033 (batch_reel_sends)

Phase 3a + 3b together = Today redesign feature-complete.

### Phase 1 Complete (2026-04-24)

- Migration 023 shipped (authored_by, intent, classification_confidence, classification_notes,
  classified_at columns on contact_log)
- Haiku 4.5 classifier with strict rubric + 7 few-shot examples
- 70 inbound rows classified (100% high, 0% low; 3 medium: Tim Peng/Middlebury,
  Sean Streb/Rochester, Kaneile Thomas/NC State)
- Live classification hook on gmail-sync cron and SendGrid webhook (fire-and-forget)
- 21 SendGrid orphans relabeled (partial → orphan); source-level fix applied
- 1 manual override (row 3840cbd3: Randy's forwarded email, marked non_coach)
- schools.category tier selector live on school detail page (A/B/C/Nope dropdown)
- Today "Awaiting Reply" filter: (coach_personal|coach_via_platform) × requires_reply
  + 180-day window + thread-state check (school-level outbound proxy)
  + null school_id excluded from unreplied detection
- Awaiting Reply count: 27 → 4 rows as of 2026-04-24
  (Gerard Miniaci/MIT 143d, Kaneile Thomas/NC State 142d,
  Rob Harrington/MSOE 17d, Dale Jordan/Stevens 3d)
  Note: Teren Schuster/SD Mines correctly excluded — Finn replied 2026-04-21

Tech debt carried to Phase 2:
- Decline context staleness: Mines and CMU declined Finn as striker; Finn now plays wingback.
  Declines should carry evaluated-position + evaluating-coach context so stale declines can be
  flagged when position or coach changes. Both kept Tier A per Randy's judgment.
- Non-recruiting email pollution in contact_log: thread-tracking ingests non-coach messages
  from thread participants. Future fix: filter on known family sender addresses at ingestion.
- Strict rubric rationale documented: concrete asks (forms, camps) take priority over
  "keep us updated" pleasantries when classifying intent.
- MIT assistant coach email coverage gap (2 of 4 assistants lack emails in coaches table).

Phase 2 (campaigns) builds on this foundation. A "Phase 3 (Today redesign)" was referenced
during planning but never scoped; the Today-related items (campaign cards, reply linking)
are tracked under Phase 2b. Note: "Phase 3a/3b/3c" in the Recent Changes table refers to
the 2026-04-19 UI redesign (schools list, school detail, library) — a different numbering
from the unscoped "Phase 3 (Today redesign)" mentioned here.

### Review Queue — Part 5d initial seed outcomes (closed 2026-04-23)
All 23 manual items from the initial seed run have been resolved (0 pending):
- 13 coach_departed — applied (real departures)
- 1 role_changed (Jamie Franks, DU: Head → Associate Head) — applied
- 4 email_changed — applied (clean personal-to-personal address updates)
- 1 role_changed (Tim Vom Steeg, UCSB: Head → Assistant) — REJECTED (scraper false positive, no new HC scraped at same school)
- 3 email_changed (Kennedy/Cal Poly, Koski/Lehigh, Jones/Wisconsin) — REJECTED (team inbox replacing personal email)
- 1 email_changed (Cory Greiner, Emory: cgreiner → cgreine) — ACCEPTED (correct scrape; Emory uses deliberate 7-char username truncation policy, e.g. ceschmi@, tssherm@)

**Emory email convention:** Emory Athletics truncates usernames to 7 characters. Short addresses like cgreine@emory.edu are real, not OCR errors. Do not flag Emory addresses for suspicious length.

### Scraper hardening — future improvements (not yet implemented)

**Idea A — Team-inbox heuristic for email_changed proposals:**
If a proposed email_changed replaces a person-shaped address (firstname.lastname@, initials@, firstname@) with a team-pattern address (mensoccer@, msoc@, soccer@, or containing the school name like "lehighmenssoccer", "wisconsinmsoc"), auto-reject with a likely_team_inbox flag instead of surfacing for human review. Would have auto-caught 3 of the 4 rejected email_changed items from the Part 5d seed run. Cheap post-processing on scraper output, not new extraction logic.

**Idea B — Role demotion sanity check:**
If an existing Head Coach gets re-classified to a lower role AND no new Head Coach appears in the same scrape for that school, flag as suspicious_parsing rather than queuing for review. Would have caught the Vom Steeg (UCSB) false positive. Revisit when we next touch the scraper.

**Do NOT add:** heuristics based on username character count or missing letters. Emory's policy proves that truncated usernames are real. Trust the scraped page.

### Scraper hardening — shipped (May 5, 2026)

**Bug C resolution — coach_departed apply now actually departs the coach (migration 035, May 5, 2026):**

Prior behavior: applying a coach_departed proposal set coaches.needs_review=true but left the coach in the active diff set. Scraper saw the coach was still in the DB but missing from the page, re-proposed departure on every run. 14 rows confirmed stuck in this loop before the fix.

Fix: added coaches.is_active boolean (default true) with partial index coaches_active_school_idx on (school_id) where is_active = true. Apply path for coach_departed sets is_active=false and needs_review=false. Scraper diff query filters is_active=true. UI surfaces (SchoolDetailClient, campaign coach selectors, gmail-partials picker) filter is_active=true. Ingestion paths (gmail-autolabel, gmail-resolve, bulk-import, sendgrid webhook) intentionally do NOT filter — historical emails to departed coaches must still resolve to the original coach record so contact_log linkage stays correct.

Architectural decision: soft-delete via is_active flag, not hard delete. Preserves contact_log FK references and the recruiting history they encode. To re-activate a coach (rare — handle via SQL): \`update coaches set is_active=true where id='...';\`

**Bug A resolution — rejected proposals no longer re-surface (May 5, 2026):**

Prior behavior: applyChanges() in src/lib/coach-scraper.ts inserted a new coach_changes row for every page-vs-DB diff, regardless of whether the same proposal had been rejected before. 4 rows confirmed re-surfacing on every scrape.

Fix: before inserting, applyChanges() queries coach_changes for prior terminal rows (status in applied or rejected) matching the proposal signature, ordered by created_at desc. If the most recent terminal row's status is 'rejected', the insert is skipped.

Signature per change_type (uses actual schema keys role_before/role_after, email_before/email_after, name_before/name_after):
- coach_departed: (school_id, change_type, coach_id)
- email_changed: (school_id, change_type, coach_id, details @> {email_before, email_after})
- email_added: (school_id, change_type, coach_id, details @> {email_new})
- role_changed: (school_id, change_type, coach_id, details @> {role_before, role_after})
- name_changed: (school_id, change_type, coach_id, details @> {name_before, name_after})
- coach_added: (school_id, change_type, details @> {name, role})

Including old/new values prevents over-suppression: a coach whose Head→Assistant role change was rejected can still trigger a future Assistant→Director proposal.

Auto-applied changes (wouldStatus !== 'manual') skip the dedup check and always log.

**Validation confirmed (May 6, 2026):** Wednesday's natural coach-roster-sync cron produced 1 new genuinely-new coach_changes row. None of the 18 previously processed rows reappeared. Bug A and Bug C fixes are confirmed working in production.

### Camp Discovery System — Phase B (May 5, 2026)

**Phase B1 + B2 — Foundation + historical backfill:**

Migration 036 added camp_proposals table mirroring the coach_changes review queue pattern:

  camp_proposals:
    id, source ('email_extract' | 'email_extract_backfill' | 'web_search'),
    source_ref (contact_log_id for email, web:URL for search),
    host_school_id, proposed_data (jsonb),
    matched_camp_id (FK camps, nullable),
    status ('pending' | 'applied' | 'rejected' | 'superseded'),
    confidence ('high' | 'medium' | 'low'),
    notes, created_at, reviewed_at

Extractor (src/lib/camp-extractor.ts) uses Claude Haiku 4.5. Truncates input to 4000 chars. Returns array of camps per call (one email or web page can mention multiple camps). Date validation rules in prompt: reject past dates, reject > 18 months future, infer year from today's date when ambiguous. Confidence rubric: high (explicit dates + location + host clear), medium (dates clear, details ambiguous), low (camp mentioned but specifics unclear). Empty array when no extractable camp data — does NOT invent dates.

Defense-in-depth filter strips past-dated camps from extractor output regardless of model behavior. Lehigh 2025-12-20 was the case that proved this filter earns its keep — Haiku occasionally violates Rule 3 despite the prompt.

Markdown fence stripping handles both \`\`\`json and \`\`\` prefixes plus trailing reasoning text after the array. First version of the parser failed on every Haiku response; the fix added trim + slice(0, lastIndexOf(']')+1) logic to handle text-after-JSON cases.

shouldSkipProposal() three-check dedup:
1. Existing camp (±2 day tolerance) → don't skip, set matchedCampId for update-existing flow
2. Terminal rejected proposal (exact start_date) → skip
3. Pending proposal (exact start_date + same host) → skip

Apply path supports both create-new (insert into camps + camp_school_attendees) and update-existing (merge non-null fields into existing camps row). Optional "mark_finn_interested" checkbox in review UI defaults checked, upserts camp_finn_status='interested' on apply.

Backfill script (scripts/backfill-camp-extraction.ts): one-shot pass over Inbound contact_log rows from past 12 months matching camp keyword pattern, A/B/C schools only. Initial run May 5: 32 rows triggered extractor, 19 camps extracted, 4 skipped via pending-proposal dedup, 8 matched existing, 15 new proposals inserted.

**Phase B3 — Live trigger:**

extractAndProposeCamps() helper added to camp-extractor.ts. Wired as fire-and-forget call in /api/cron/gmail-sync and /api/webhooks/sendgrid-inbound, parallel to the existing classifyAndUpdate hook. Fires only when:
- direction='Inbound'
- school_id IS NOT NULL
- parse_status IN ('full', 'partial')
- school.category IN ('A','B','C')
- body or summary matches /\b(camp|clinic|showcase|ID camp|prospect day|elite training)\b/i

Idempotency check at top of function: skip if any camp_proposals row already exists with source_ref=rowId. Prevents duplicate Haiku calls on retry/re-sync.

**Phase B4 — Tavily web discovery (validated May 9, 2026):**

Saturday cron at /api/cron/camp-discovery, runs all A/B/C tier active schools (~33). Tavily query format: \`\${school.name} men's soccer ID camp\` (no year — extractor handles staleness). search_depth: 'advanced', max_results: 5, include_raw_content: true. Per-result extraction via Haiku 4.5.

Files: src/lib/tavily.ts (Tavily client), src/app/api/cron/camp-discovery/route.ts (Saturday 14:00 UTC = 8 AM MT), vercel.json schedule entry.

Belt-and-suspenders dedup: skip if camp_proposals exists with source_ref=\`web:\${url}\` AND status='pending'.

Validation: First natural production run May 9, 2026. cron_runs row confirmed status='success'. New camp_proposals inserted from web discovery successfully processed via /settings/camp-proposals review queue.

Known limitations:
- TotalCamps pages are JS-rendered, Tavily can't extract
- School name collisions ("Clark" → Lewis & Clark, "Rochester" → Oakland U Rochester MI)
- Gender mismatches (Hopkins girls camps surfacing as proposals)
- Wrong-sport noise from generic queries
- Aggregator coverage (idcampssoccer.com, idcampfinder.com) compensates for some of these gaps

### Ingestion Health Monitoring (May 5, 2026)

Today screen banner surfaces ingestion failures. getIngestionHealth() returns SourceHealth[] for each monitored source. Banner renders only when at least one source is unhealthy.

Sources monitored:
- Gmail: gmail_tokens.last_sync_at vs now
  - Healthy: < 24h
  - Warning: 24h–72h
  - Critical: > 72h or missing row
  - Action: Reconnect at /settings/gmail
- SendGrid: max(contact_log.created_at) where gmail_message_id IS NULL AND parse_status IS NOT NULL
  - Healthy: < 7 days
  - Warning: 7–14 days
  - Critical: > 14 days
  - Action: Open SendGrid dashboard (external link)

Pattern generalizes — adding a third source means adding one async function and including in the getIngestionHealth array.

**Gmail OAuth disconnect lessons learned:**

April 28 → May 5 outage: gmail_tokens row was deleted (cause unconfirmed — most likely user action via /settings/gmail Disconnect button or direct Supabase SQL). Code-level investigation confirmed the only delete path is the manual disconnect handler; failed token refresh does NOT delete the row by design (good defensive design, line 96 in gmail-client.ts has explicit comment).

Reconnect via /settings/gmail restored functionality. First reconnect attempt produced 403 PERMISSION_DENIED on autolabel API calls — Google's cached consent had stale scopes. Fix: revoke at myaccount.google.com → Security → third-party apps, then disconnect+reconnect in app for fresh consent flow with full gmail.modify scope.

### Pending Camp Decisions Strategic Prompt (May 7, 2026)

New strategic prompt 'camp_decisions' (prompt_key: 'camp_decisions'). Surfaces camps where Finn needs to make a register-or-decline call before the camp starts.

Logic in src/lib/strategic-prompts.ts:

Match criteria:
- camp.start_date between today and today + 60 days
- host school category in ('A','B','C')
- host school status != 'Inactive'
- camp_finn_status.status = 'interested' OR no status row (excluding 'targeted' camps — those are already decided)

Score: count / 8, capped at 1.0.

Files:
- src/lib/strategic-prompts.ts (computeCampDecisions)
- src/components/strategic/PendingCampDecisionsModal.tsx (sorted by start_date, days-until red if <=7, deadline display, Target/Register/Decline/Skip action buttons)
- src/components/today/StrategicSection.tsx (CAMPS tag)
- src/components/TodayClient.tsx (useCamps hook, modal wiring)

Position in strategic prompts array:
1. reel_coverage
2. rq_refresh
3. stale_tier_a
4. camp_decisions (new)
5. pipeline_shape

Live filtering via realtime subscription. Weekly skip via strategic_skips table.

### cron_runs Audit Table (May 7, 2026)

Generic cron audit log. Schema:

  cron_runs:
    id, cron_name (check: gmail-sync, coach-roster-sync, camp-discovery),
    started_at, completed_at,
    status (running | success | partial | failed),
    error, metadata jsonb, created_at

Indexes:
- (cron_name, completed_at desc) where completed
- (cron_name, started_at) where running

Helpers in src/lib/cron-runs.ts:
- startRun(admin, cronName) → returns runId
- completeRun(admin, runId, status, metadata, error?)

Both helpers swallow their own errors and log — they never break the calling cron. The audit log is supplementary, not critical-path.

Wired into all 3 cron routes:
- /api/cron/gmail-sync
- /api/cron/coach-roster-sync
- /api/cron/camp-discovery

Existing per-source signals preserved (not replaced):
- gmail_tokens.last_sync_at (Gmail OAuth sync state)
- schools.coach_page_last_scraped_at (per-school scraper progress)

Health monitoring extension:

getIngestionHealth() in src/lib/ingestion-health.ts now reads cron_runs for sources without other last-run signals:

- coach-scraper:
  - Query: max(completed_at) where cron_name='coach-roster-sync' and status in ('success', 'partial')
  - Thresholds: warning > 5 days, critical > 10 days
  - Null treated as healthy (no rows yet = instrumentation not yet active, not a failure)

- camp-discovery:
  - Same pattern, thresholds: warning > 10 days, critical > 21 days

Validation: First gmail-sync row landed May 7, 2026 with status=success, 6-second runtime, expected metadata (messages_captured, autolabel counts, etc.). Coach scraper first instrumented row Sunday May 10. Camp discovery first instrumented row Saturday May 9.

### Targeted Camp State — Phase B Continuation (May 11, 2026)

**Schema (migration 038):**

Added 'targeted' status to camp_finn_status:

  alter table camp_finn_status add column targeted_at timestamptz;

No check constraint change applied — investigation revealed the camp_finn_status table has no database-level status validation. Status values are enforced via the TypeScript CampFinnStatusValue type only. The application code is the source of truth; the database is permissive text.

Lesson captured: future state additions to enum-style columns should verify whether a check constraint exists before assuming the standard "drop + re-add constraint" migration pattern applies.

**State semantics:**

Five states in priority order:
1. interested — applied a proposal, on the radar, no real decision (default after proposal apply)
2. targeted — Finn is genuinely planning to attend (the meaningful gate)
3. registered — paid, signed up
4. attended — completed
5. declined — actively decided no

**Action item logic (Model B from design discussion):**

Updated syncActionItemForCamp in src/lib/camps.ts:
- status='interested' with deadline → NO action item (was: action item created)
- status='targeted' with deadline → action item created
- status='registered' → action item marked completed
- status='attended' → action item marked completed
- status='declined' → action item deleted
- status changes from 'targeted' back to 'interested' → action item deleted

Result: 'interested' is now pure radar with no operational consequence. 'targeted' is the meaningful gate that triggers action items, deadline tracking, and forces decisive prioritization.

**UI updates:**

- CampDetailClient: 5th pill (amber #FEF3C7/#92400E), targeted_at timestamp display
- CampsCalendar: amber bar colors for targeted (#FEF3C7/#F59E0B/#92400E)
- CampsClient: filter pill ordering: All | Interested | Targeted | Registered | Attended | Declined
- PendingCampDecisionsModal: "Target" button added as primary action alongside Register / Decline / Skip
- SchoolDetailClient CAMP_STATUS_STYLE: targeted entry added (hotfix May 11 after initial deploy crashed on Rochester school detail page — missed callsite)

**Migration safety lesson:**

The targeted-state deploy caused a production crash on any school detail page that rendered camps with the new 'targeted' value. Root cause: CAMP_STATUS_STYLE map in SchoolDetailClient.tsx had no entry for 'targeted', so \`.bg\` lookup returned undefined.

Pattern: when adding states to a TypeScript union, the build's exhaustiveness check catches missing switch cases but does NOT catch plain-object maps keyed on the union values. Manual codebase search required for all such maps.

Locations updated for this state addition:
- CampDetailClient pill colors
- CampsCalendar bar colors
- CampsClient filter pill style
- SchoolDetailClient CAMP_STATUS_STYLE (missed initially)

Future state additions should grep for all status-keyed object maps before deploy.

### Inline Action Item Editing (May 11, 2026)

Shared EditableActionRow component at src/components/EditableActionRow.tsx supports inline edit of description and due_date.

Inline edit pattern:
- Description: click → text input with auto-focus and select-all, Enter or blur saves, Escape cancels
- Due date: click → native date picker, selecting a date saves, Escape cancels
- "Add date" link when no due_date set
- Completion checkbox unchanged

Save semantics:
- Uses existing useActionItems().updateItem with built-in optimistic updates
- Sync-managed fields (school_id, linked camp_id, contact_log_id, source) NOT user-editable
- Sync logic doesn't update existing action items — only creates new ones — so manual edits are safe from clobbering

Rendered in: SchoolDetailClient sidebar action items panel.

Audit of action item rendering locations (8 total):
1. SchoolDetailClient sidebar → inline edit (primary editing surface)
2. SchoolDetailClient timeline → read-only (chronological)
3. TacticalSection on Today screen → read-only (act now UX, edit happens on school detail)
4. ActionsPanel legacy /pipeline → read-only (drag interactions conflict with inline edit)
5. DashboardView legacy summary → read-only (truncated)
6. PipelineTable next-action column → read-only (single cell)
7. SchoolModal legacy modal → already has its own edit forms
8. DashboardClient "Copy for Claude" export → not UI rendering

Editing surface intentionally constrained to school detail sidebar. Today screen tactical zone stays action-focused (complete/navigate); editing requires navigating to school detail page (one click away).

### Calendar Status Priority Sort (May 11, 2026)

Camps within calendar cells now sort by status priority so targeted camps occupy visible slots preferentially over interested camps, with declined/attended sinking to overflow.

Priority order (lower = more visible):
1. targeted
2. registered
3. interested
4. declined
5. attended

**Architectural simplification:**

The earlier slot-stability work (Phase A6 polish round, ~107 lines of multi-day slot locking) was removed and replaced with a 20-line per-cell priority sort.

Old behavior: multi-day camps got locked slots across all their cells, single-day camps packed into remaining slots. This caused targeted single-day camps to be pushed to overflow when multi-day interested camps occupied slots 0-3.

New behavior: all camps for a cell (multi-day continuations + single-day) sort by status priority, top N get visible slots, rest go to overflow. Multi-day visual continuity sacrificed in dense weeks (which is the only time slot conflicts occur), but priority preserved universally.

Net change: ~85 lines deleted, behavior more correct.

Files: src/components/CampsCalendar.tsx

### Campaign Email Rework — LLM Generation (May 11, 2026)

**Migration 039:**

- campaigns.message_set text column — free-form text, one message per line, used as input to LLM generation
- campaign_email_drafts table:
  - id, campaign_id (CASCADE), school_id (CASCADE), coach_id (SET NULL), subject, body, generated_at, regenerated_at, regeneration_count, model_used, input_tokens, output_tokens, created_at
  - unique (campaign_id, school_id, coach_id)
  - indexes on campaign_id, school_id

**Migration 040:**

- campaign_email_drafts.last_hint text column — captures the regeneration guidance text when user-provided

**Migration 041:**

- campaigns.archived_at timestamptz — when set, campaign is hidden from default list (reversible)
- Verified CASCADE delete on campaign_schools.campaign_id and campaign_email_drafts.campaign_id

**Generator (src/lib/campaign-email-generator.ts):**

Sonnet 4.6 powered email body generation. NOT Haiku — the synthesis task (read full conversation history, generate personalized body that doesn't repeat covered topics) needs Sonnet's nuance pickup. Cost ~$0.03 per email, ~$0.90 for a 30-school campaign — trivial.

Input to generator:
- Campaign (includes message_set, name)
- School with full relations
- Coach (primary recipient if known)
- Full contact history for this school (all contact_log rows asc by created_at, including manual entries — everything we know about Finn's interactions with this coach/school)
- Finn's static context (position, class year, club, current_reel URL)
- Optional regenerationHint (free-text guidance from user)

Output: { body, inputTokens, outputTokens }

Prompt structure (system + user):
- System: identity (Finn as 2027 left wingback), guidance on synthesizing campaign messages with conversation history, tone/length rules, output format
- User: structured sections for Finn context, school info, coach info, strategic context, prior conversation (chronological, truncated to 400 chars per row), campaign messages, optional regeneration guidance

Max output: 600 tokens. Typically uses 250-400.

**API route (/api/campaigns/generate-draft):**

POST endpoint. Checks campaign_email_drafts cache first, generates if missing. Supports \`regenerate: true\` to force fresh generation (increments regeneration_count, updates regenerated_at, stores last_hint if provided).

Falls back to template body if no message_set configured on the campaign (preserves legacy campaign compatibility).

**DraftModal (src/components/DraftModal.tsx):**

- Campaign mode with hasMessageSet: auto-generates on open ("Generating personalized draft..." while loading)
- Campaign mode without hasMessageSet: existing template flow + "Personalize with AI" path
- Subject line: templated "Finn Almond | Left Wingback | Class of 2027 | {short_name}" at top, read-only, Copy button
- CC: finn@in.finnsoccer.com (static, displayed)
- Body: LLM-generated, editable in textarea
- "Regenerate" with hint input — text field for free-form guidance ("shorter", "more casual", "lead with camps", etc.) — hint clears after each regeneration
- "Revert to draft" — returns to cached LLM draft after manual edits (not template)
- "Mark as sent via Gmail" / "Mark as sent via SR" send buttons (hidden on archived campaigns)
- "Dismiss from this campaign" action
- Template fallback on generation failure (toast notice + revert to old template path)

**Campaign creation simplification:**

Removed from /campaigns/new Step 1:
- Template name field
- Email body textarea
- Variable pill buttons ({{coach_last_name}}, etc.)
- Preview section

Kept:
- Campaign name
- Messages to communicate textarea (with placeholder examples)
- Help text: "One message per line. The AI will personalize each email based on prior conversations with each school."

Legacy campaigns (created before this change) still work via the template fallback path in DraftModal.

**Archive and delete:**

Two separate actions:
- Archive (reversible): sets archived_at = now(). Hidden from default Active filter; visible in Archived and All. Activate button hidden, send buttons hidden in draft modal. ARCHIVED badge replaces status badge.
- Delete (irreversible): hard delete with type-to-confirm modal ("Type DELETE to confirm"). Cascades to campaign_email_drafts and campaign_schools. contact_log rows preserved (historical record of actual sends).

UI surfaces:
- Campaigns list: filter pills (Active / Archived / All), kebab menu per row with Archive/Unarchive + Delete
- Campaign detail header: Archive/Unarchive + Delete buttons near Activate
- Kebab dropdown uses React portal with edge-aware positioning (flips above kebab when near viewport bottom)

### Email Generation Overhaul + LLM Standardization (May 13, 2026)

**Comprehensive model audit:**

Audited all LLM-powered flows in the codebase. Result:

| Flow | Old Model | New Model | Rationale |
|------|-----------|-----------|-----------|
| School detail email body | Haiku 4.5 | Opus 4.7 | High-stakes synthesis with conversation context |
| Campaign email body | Sonnet 4.6 | Opus 4.7 | Same |
| Campaign personalize (legacy) | Sonnet 4.5 | Opus 4.7 | Consistency for any remaining legacy paths |
| Topic suggestions | Haiku 4.5 | Opus 4.7 | Quality matters; volume is low |
| Prep for call | Sonnet 4.5 | Opus 4.7 | Shapes real conversations |
| Resume parser | Haiku 4.5 | Sonnet 4.6 | Output feeds every email prompt; structured extraction doesn't need full Opus |
| Classify inbound | Haiku 4.5 | Keep | Pattern-match task with review queue backstop |
| Coach scraper | Haiku 4.5 | Keep | Diff-and-review absorbs errors |
| Camp extractor | Haiku 4.5 | Keep | Same pattern + defense-in-depth date filter |

Strategic prompts (reel_coverage, rq_refresh, stale_tier_a, camp_decisions, pipeline_shape) confirmed pure SQL/code logic — no LLM involvement.

**Migration 042:** updated campaign_email_drafts.model_used default to 'claude-opus-4-7' to match the new standard.

**Email generation context expansion:**

Both buildEmailDraftPrompt (Flow A) and buildTopicSuggestPrompt (Flow T) refactored to pass rich context to Opus:

- Full conversation history — all contact_log rows for the school, chronological (oldest first), no row limit, no truncation, all sources (including manual entries)
- All active coaches at the school (not just primary)
- Upcoming camps with status and dates (filtered to start_date >= today)
- Decline history if applicable (Mines/CMU declined Finn as striker context)
- Strategic context (tier, division, conference, status)
- Player profile (stats, schedule, highlights, current reel)

Prompt structure standardized with sections: TODAY, SCHOOL CONTEXT, COACHES, CAMPS AT THIS SCHOOL, DECLINE HISTORY, FINN'S CURRENT CONTEXT, PENDING ACTION ITEMS, FULL CONVERSATION HISTORY.

**Date awareness rule:**

Added shared DATE_AWARENESS_RULE to both flow system prompts. Today's date passed explicitly. Rule forbids treating past events as actionable:

> RULE: Today's date is {currentDate}. Do not suggest or reference topics tied to past dates, completed events, past games, or expired opportunities as if they are still actionable.

Resolved May 13 bug: Cal Poly SLO topic suggester surfaced "Confirm May 9-10 ID camp attendance" — past camp. Root cause: Opus had no date context, read contact_log content literally. Fixed via date injection + rule.

**Topic suggester action_items filter:**

Filter added to exclude completed and past-due items:

    .is('completed_at', null)
    .or('due_date.is.null,due_date.gte.{today}')

Prevents stale action items from surfacing as suggestions even though the primary fix was prompt-level date awareness.

**Signature standardization:**

All three prompts (school detail, campaign generator, legacy personalize) now enforce sign-off as just "Finn" on its own line. No full signature block (no email, phone, SR profile URL). Gmail's signature appends formal contact info on send.

**Prep-for-call upgrade:**

Beyond the model swap to Opus 4.7, prep-for-call now uses the same rich context pattern as email generation:
- Full contact_log (no truncation, no row limit)
- Upcoming camps with status
- Decline history
- All active coaches
- Today's date with date-awareness rule

Server-side context fetching replaces the previous client-side truncated payload (was 5 rows max).

### SR Email Ingestion Cleanup (May 14, 2026)

**Problem:**

SendGrid inbound webhook was preserving raw SR notification template HTML/CSS in contact_log.summary, polluting the classifier (model couldn't see actual message through CSS noise), all downstream LLM calls reading contact_log, and Today screen display.

Example: Caltech email from Rockne DeCoster on May 14 surfaced in classification review with low confidence because summary contained ~3500 chars of CSS comments, HTML rendering hints, and SR boilerplate before the actual 90-char message ("Hi Finn, Hope you're doing well! Any update about the SAT?").

**Fix:**

extractMessageBody() in src/app/api/webhooks/sendgrid-inbound/route.ts rewritten with Phase 0 cleanup that strips CSS comments and @media rules, inline CSS, SR boilerplate lines ("just sent a message", "You received a new message", "To view my full profile..."), and tab-heavy whitespace runs.

Phase 1 then finds the "Subject:" marker and extracts message body up to the reply-thread terminator (e.g., "On [date], Finn Almond wrote:"). raw_source preserved for re-parse safety; only summary is cleaned.

**Backfill:**

scripts/backfill-sr-cleanup.ts processed all polluted rows. Results:
- UCLA / Sergi Nus: 5505 chars → 785 chars
- Caltech / Rockne DeCoster: 3736 chars → 176 chars

Both rows re-classified after cleanup with high confidence:
- UCLA: informational → requires_action (coach sent camp registration links)
- Caltech: unknown (low) → requires_reply (high) — SAT question now visible

**Detection logic for future SR notifications:**

Sender pattern or body markers ("SportsRecruits", "just sent a message to your SportsRecruits inbox") trigger the SR-specific cleaning path at ingest time. No backfill needed for future rows.

### Messaging Strategy System (May 14-15, 2026)

Closed-loop system for managing what Finn says to which coaches when. Three phases, all shipped.

**Phase 1 — Inventory (migration 043, May 14):**

Global capture surface for things Finn wants to communicate or ask coaches.

Schema (messages table):
\`\`\`
id, title, type (update | question), notes, expires_at,
status (active | archived), created_at, updated_at
\`\`\`

Seed data (9 initial messages):
- Updates: End of season — starter at LWB (9-2-3, 3G/2A, advancing to MLS NEXT Cup Utah); MLS NEXT Cup schedule (share when known); SAT score improvement (1340 → 1380); Summer team: Flatirons FC USL-A
- Questions: Will you be at MLS NEXT Cup in Utah?; How do you play with wingbacks?; Are you recruiting 2027 players like Finn?; Open to a phone call?; How are you using ID camps this summer/fall?

UI surfaces:
- Top-level nav "Messages" between Campaigns and Camps
- /messages list page with Active/Archived/All and Updates/Questions filter pills
- Add/Edit modal with title, type, notes, expires_at, archive
- Type-to-confirm delete

**Phase 2 — Coverage Detection (migration 044, May 14):**

Auto-detects which inventory messages have been communicated to which schools by analyzing outbound emails at ingest time.

Schema (school_message_log):
\`\`\`
id, message_id (FK messages), school_id (FK schools),
contact_log_id (FK contact_log), detected_at,
detection_source (auto | manual), notes,
unique (message_id, school_id, contact_log_id)
\`\`\`

**Critical design decision:** detector fires on outbound contact_log row ingest (gmail-sync and sendgrid-inbound webhook), NOT on mark-as-sent button click. This ensures the analyzed body is what was actually sent, not the generated draft (which Finn may have edited).

Detector (src/lib/message-coverage-detector.ts):
- Model: Sonnet 4.6
- Input: sent email body, school, active messages
- Output: matched_message_ids[] with reasoning
- Strict matching: "substantively communicated" means the email contains the actual content or asks the actual question; passing mentions don't count
- Bias: under-detect over over-detect

Wired into both outbound paths:
- gmail-sync after linkOutboundToCampaign hook
- sendgrid-inbound CC handler (when SR sends arrive via finn@in.finnsoccer.com fallback)

Filters to Outbound direction + school_id present + summary >= 50 chars.

**Phase 3 — Per-school Plan + Integration (migration 045, May 15):**

Schema (school_message_plan):
\`\`\`
id, school_id (unique), finn_notes text, suggestions jsonb,
suggestions_generated_at, suggestions_model_used,
created_at, updated_at
\`\`\`

Plus: campaigns.source_message_ids uuid[] for tracking which inventory items a campaign references.

Suggestion generator (src/lib/school-message-plan-generator.ts):
- Model: Opus 4.7
- Input: school, coaches, contact history (full, no truncation), uncovered messages, covered messages (for context), upcoming camps, decline history, Finn's notes
- Output: 2-3 ordered suggestions with reasoning and timing (send_now | after_event | wait)
- Strict rules: only suggest from uncovered list, never invent message_ids, respect Finn's notes

Communications plan UI (school detail page, between hero banner and conversation timeline):

- **Coverage subsection** (collapsible): Shows messages already communicated to this coach. Each row: type badge, title, contact_date (the actual email date, not detected_at), 60-char excerpt, "source" link. Sorted by contact_date desc. Source link uses hash anchor (#contact-log-{id}) that scrolls smoothly to the matching contact_log entry in the timeline with a 1.5s gold flash.

- **Suggested next messages**: "Refresh suggestions" button regenerates via Opus 4.7. Each suggestion: message title, type badge, reasoning, timing chip. Shows generated_at footer. Empty state with "Generate suggestions" CTA.

- **Strategic notes**: Auto-saving textarea for Finn's per-school strategy notes (debounced). Persists in school_message_plan.finn_notes.

**Inventory integration with campaign creation:**

/campaigns/new Step 1 now includes "Select from inventory" picker above the messages textarea. Checkable cards with type filter (All / Updates / Questions). Selecting auto-populates textarea with title + notes. Editable after selection. source_message_ids array stored on campaign for tracking.

**Inventory integration with topic suggester:**

buildTopicSuggestPrompt fetches active messages + coverage for the school, computes uncovered, passes as prioritized context. System prompt instructs: "When suggesting topics, prioritize uncovered inventory messages that fit the conversation state."

### LLM Model Standards (as of May 15, 2026)

Models in use across the app:

- **claude-opus-4-7** — All email generation flows (school detail body, campaign body, campaign personalize legacy, topic suggestions), prep-for-call, school_message_plan suggestions
- **claude-sonnet-4-6** — Resume parser, message coverage detector
- **claude-haiku-4-5-20251001** — Classify inbound, coach scraper, camp extractor

Selection principle:
- High-stakes synthesis with full context → Opus
- Structured extraction or pattern matching where review backstops errors → Haiku
- Middle ground: rule-following extraction without full Opus reasoning → Sonnet

### Tech Debt Audit + Paydown (May 15, 2026)

After shipping the messaging strategy system (Phases 1-3), ran a comprehensive tech debt audit before next feature work. Audit covered 10 areas: duplicate logic, type safety, dead code, error handling, performance, component patterns, migration history, test coverage, documentation, and anything else.

**Chunk A — Shared context helper + parse_status filter + dead code cleanup:**

Created src/lib/school-context.ts with fetchSchoolContext() helper. Single source of truth for school + coaches + contact_log + camps + decline history + action items. Uses Promise.all() for parallel fetching. The parse_status filter (excluding orphan and non_coach rows) is always applied — never optional.

Migrated 5 LLM-calling routes: buildEmailDraftPrompt, buildTopicSuggestPrompt, prep-for-call, message-plan, generate-draft. The generate-draft route's missing parse_status filter was resolved automatically by migration to the helper (was a live bug — orphan/non_coach rows leaking into campaign email prompts).

Dead code removed from src/lib/prompts.ts (net -246 lines): SYSTEM_PROMPT, buildUserPrompt(), EMAIL_TYPE_INSTRUCTIONS, ASSET_TYPE_LABELS. All replaced by buildEmailDraftPrompt on May 13. EmailType union preserved as standalone export for todayLogic.ts compatibility.

**Chunk B — Exhaustive union maps + LLM error handling:**

Converted 15+ Record<string, T> maps to Record<UnionType, T> across 13 component files. Union types now exhaustively checked at compile time: Category (8 maps), CampFinnStatusValue (5 maps), CampaignStatus (3 maps), QuestionCategory (2 maps), MessageType (3 maps), AdmitLikelihood (1 map), SuggestionTiming (1 map). Missing 'Nope' entries for Category maps added. Runtime ?? fallback preserved at all lookup sites.

Result: future additions to any of these union types will fail npm run build with TypeScript errors pinpointing every map that needs the new key. Eliminates the May 11 CAMP_STATUS_STYLE crash pattern systemically.

LLM generators wrapped in try/catch: campaign-email-generator, school-message-plan-generator, message-coverage-detector. Rate limits (429), auth failures (401), and timeouts now degrade to soft empty results instead of cascading as unhandled 500s.

**Deferred tech debt (revisit later):**
- Modal overlay primitive: 15 components duplicate backdrop pattern. ~300 lines could be cut with shared <Modal>.
- Campaign personalize flow: semi-dead but harmless. Both legacy campaigns are status=completed.
- Filter pill duplication: patterns differ enough that abstraction wouldn't save much.
- Design preview routes: harmless development artifacts.
- Realtime subscription error handling: low urgency for 2-user app.
- Test infrastructure: scale doesn't justify it yet.
- API input validation: private app with trusted users.

### Inventory Enrichment Post-Utah (May 15, 2026)

**Context shift:**

Finn's MLS NEXT team couldn't field enough players for MLS NEXT Cup in Utah. The Utah trip is off. Two inventory items deleted: "MLS NEXT Cup schedule" (update) and "Will you be at MLS NEXT Cup in Utah?" (question).

**Inventory revisions:**

All 7 surviving items rewritten with richer strategic notes following the pattern: situation → why it matters → when/how to use it → exact phrasing. Key reframings:
- SAT score improvement: reframed from static "scored 1380" to trajectory "1380 with planned fall retakes targeting 1450+", Math 690 / English 690 breakdown
- Summer team Flatirons FC: enriched with real detail from coach Bailey Rouse — UPSL fall/spring, USL Academy summer (CO/Utah), Wales showcase tour, 3x/week training, 4-2-3-1 setup, College Advisory Program
- End of season starter at LWB: stripped Utah reference, added strategic framing for declined or stale schools

**5 new items added:**

Core items:
- Position transition: striker → left wingback (update) — central tactical reintroduction story
- Olimpico goal at MLS NEXT Cup qualifier (update) — vivid moment to anchor film reviews
- Academic identity: STEM focus, AP rigor, improving SAT (update) — includes senior-year courseload (AP Physics C, Calculus BC, AP Statistics, Discrete Math)
- Who's ahead of me at left wingback in 2025 and 2026? (question) — strategic depth-chart fit
- What does a successful 2027 recruit look like to you? (question) — open-ended fit question

Time-sensitive items (with expires_at):
- Spring 2026 grades — incoming (expires 2026-06-30)
- AP exam results — incoming July 2026 (expires 2026-08-31)

Inventory now 14 active items: 8 updates + 6 questions.

**Backfill rerun results:**

Re-processed 157 historical outbound rows. Match count grew from 75 → 113 — richer inventory caught previously-uncovered coverage, primarily Academic identity (21 schools) and Position transition + Olimpico (9 and 8 schools). Two parse failures (~1.3%); detector's error handling returned empty, no false positives.

Coverage distribution post-rerun:

| Message | Type | Schools |
|---------|------|---------|
| Are you recruiting 2027 players like Finn? | Question | 48 |
| Academic identity: STEM focus, AP rigor, improving SAT | Update | 21 |
| Position transition: striker → left wingback | Update | 9 |
| Olimpico goal at MLS NEXT Cup qualifier | Update | 8 |
| Open to a phone call? | Question | 3 |
| How are you using ID camps this summer/fall? | Question | 2 |
| How do you play with wingbacks? | Question | 2 |
| SAT score improvement | Update | 2 |
| What does a successful 2027 recruit look like to you? | Question | 1 |
| End of season — starter at LWB | Update | 0 |
| Summer team: Flatirons FC USL-A | Update | 0 |
| Who's ahead of me at LWB in 2025/2026? | Question | 0 |
| Spring 2026 grades — incoming | Update | 0 (timing=wait) |
| AP exam results — incoming July 2026 | Update | 0 (timing=wait) |

Strategic state: most schools have heard the cold-outreach question and academic pitch. Most have NOT heard end-of-season stats, summer team news, depth-chart or successful-recruit questions, or AP/grades trajectory. Phase 3 Communications plan now has 8-10 uncovered items per active school to surface.

### Strategic Notes Wiring (May 16, 2026)

Closed a gap discovered during real-world use of the Communications plan: Finn's per-school strategic notes (school_message_plan.finn_notes) were visible to the Phase 3 suggestion generator but invisible to all four email/topic/call-prep/campaign generation flows.

Symptom: Finn's notes for CMU ("Need to figure out how they use wingbacks") informed the suggestions surfaced in Communications plan but had no effect on the actual email body when Finn clicked Draft. Intent captured in notes was lost between strategy and execution.

Fix: extended fetchSchoolContext to fetch finn_notes from school_message_plan (no option flag — always included since it's lightweight and useful everywhere). Updated the four prompt builders (buildEmailDraftPrompt, buildTopicSuggestPrompt, prep-for-call, campaign generate-draft) to render strategic notes as a dedicated section when present, omit when null.

System prompt instructions added to each flow telling the model to weigh strategic notes when generating content. Section placement varies by flow — strategic notes appear near the top in prep-for-call (since prep doc is itself strategic thinking) and in the standard strategic context section for email body and topic suggestion flows.

Future flows using fetchSchoolContext automatically get strategic notes — no wiring needed.

### Map View + Nope Cascade (May 16, 2026)

**Nope school cascade (camps cleanup):**

When Finn moved schools to Nope tier (e.g., Tufts, Hopkins), camps at those schools continued to appear in active camp views. Fixed via app-side handler + one-time backfill.

- Backfill: camp_finn_status rows where status='interested' and host school category='Nope' bulk-updated to status='declined' with declined_reason='School moved to Nope tier'. 5 rows updated.
- App-side handler: updateSchool in useRealtimeData.ts now bulk-updates camp_finn_status when category becomes 'Nope'. Only transitions interested → declined; targeted and already-declined camps preserved.
- Defense in depth: camp views (CampsClient list + calendar) filter out Nope schools even if data state slips. Exception: camp_proposals review queue still surfaces Nope-school proposals since that's a back-of-house workflow.
- Reversal: moving school from Nope back to A/B/C does NOT auto-revert camp status. Camps stay declined; Finn flips manually if needed.

**Map view on /schools:**

Geographic visualization as a tab alongside the existing list view.

- Migration 046: latitude and longitude (double precision) columns on schools table with partial index where coords are not null
- Geocoding backfill: scripts/backfill-school-coords.ts uses Nominatim (OpenStreetMap's free geocoder) at 1.1s rate limit with proper User-Agent. 54/62 schools geocoded automatically; 8 failures fixed manually via SQL UPDATE with canonical campus coordinates. Final state: 100% of active schools have coordinates.
- Map component: Leaflet + react-leaflet@4. Dynamic import with ssr:false (Leaflet uses window). OpenStreetMap tiles (free, no API key). Tier-colored circular markers (A green, B blue, C amber, Nope gray) via L.divIcon. Click marker → popup with school name, tier, location, "View school details" link to detail page.
- Tab toggle: List | Map on /schools page, persists via ?view=map URL param. Existing tier/stage/division/quick filters apply to both views identically.
- Z-index fix: map container wrapped in div with position:relative + zIndex:0 to create a stacking context at 0, ensuring filter dropdowns render above Leaflet's high-z-index panes.

### Cached State Divergence Cleanup (May 19, 2026)

Real-world usage surfaced three bugs in a row, all variants of the same architectural pattern: cached state on schools (or player_profile) diverging from canonical sources elsewhere in the database. Each bug fixed individually, then ran a systematic audit to find and fix the remaining instances proactively.

**The pattern:**

Cache columns get populated by manual SQL or one-time scripts. No runtime hooks keep them synced with canonical sources (assets table, contact_log, etc). Reads happen in production UI and LLM prompts, but writes only happen in narrow paths. Result: cache drifts, reads return stale data, user-facing bugs.

**5 fixes shipped:**

| # | Bug | Stale source | Canonical source wired |
|---|-----|--------------|------------------------|
| 1 | Email generation reel URL | hardcoded URL + player_profile.current_reel_url fallback | assets table via fetchSchoolContext.currentAssets |
| 2 | Video send tracking | manual backfill script only | video-send-detector fires on outbound ingest |
| 3 | reel_coverage strategic prompt | player_profile.current_reel_url in TodayClient | assets table query (type=highlight_reel, is_current=true) |
| 4 | schools.last_contact | manual edit only | Fire-and-forget hook in gmail-sync + sendgrid-inbound (both directions) |
| 5 | schools.videos_sent boolean | manual checkbox | Replaced with last_video_url != null |

**Fixes 1-3 were user-reported.** Each one identified by Finn during active recruiting use. Bug 1 (stale reel URL in generated emails) → Bug 2 (Videos Sent widget showing wrong data) → Bug 3 (Today screen reel_coverage showing 17/17 instead of 12/17).

**Fixes 4-5 came from a systematic audit** after bug 3. Audited all public tables for "cache that summarizes state from elsewhere" patterns. Found 5 candidates: 2 high-risk (these fixes), 1 medium-risk acceptable as manual (rq_status — inherently user-entered), 2 low-risk acceptable (player_profile parser fields stay in sync via upload hook; coach scraper state updated atomically).

**Architectural principle going forward:**

Cached state must be either:
- Read-only computed from canonical sources at query time (Option A — drop the cache), OR
- Auto-synced via runtime hooks that fire on EVERY path that changes the canonical source (Option B — sync at write time)

Option C (intentionally manual, document as such) only acceptable when the field IS the canonical source — e.g., user-entered status fields where no DB-side truth exists.

**Deprecated fields (zero runtime readers):**

- player_profile.current_reel_url / current_reel_title / current_reel_updated_at
- schools.videos_sent

Each marked @deprecated in types.ts with reference to canonical source. Columns not dropped (schema compatibility), but reads are removed.

**Implementation details:**

- video-send-detector.ts: YouTube ID extraction regex, asset library match against type IN ('highlight_reel', 'game_film'), upsert to schools.last_video_url / last_video_sent_at / last_video_title using asset.name as title
- last_contact hook: guards against backfill resets (only updates if newer than existing value); applied to all 4 ingest paths (gmail-sync inbound + outbound, sendgrid-inbound inbound + outbound)
- one-time backfill SQL for last_contact: \`UPDATE schools SET last_contact = (SELECT MAX(cl.date) FROM contact_log cl WHERE cl.school_id = schools.id AND cl.parse_status NOT IN ('orphan', 'non_coach'))\`

### Production UX + Classifier Fixes (May 19, 2026 — pm)

Active recruiting use continued to surface real bugs. Six fixes shipped, all triggered by Finn's actual workflow:

**1. Case Western buttons broken — defensive coach fallback.**

Symptom: Draft email / Draft check-in / Prep for call buttons did nothing on Case Western detail page (no network call, no error). Both browsers same behavior.

Root cause: Case Western had two active coaches (Carter Poe head, Fernando Lisboa assistant) but neither marked is_primary=true. Handlers were doing early-return when primaryCoach was null — silent fail.

Fix: replaced \`primaryCoach = coaches.find(c => c.is_primary)\` with a fallback chain:
- Primary coach (existing)
- Head coach by role (new fallback)
- Most recently added active coach (final fallback)

Plus: handlers now show a "No active coaches" dialog when targetCoach is null instead of silent fail. User always sees feedback.

**2. Modal dismissal protection on expensive working surfaces.**

Symptom: Finn tabs between Claude UI and Gmail/SR while copying generated drafts. Accidental click outside modal or Escape press dismisses the modal, losing the draft. Forces LLM regeneration + workflow break.

Fix: disabled outside-click and Escape dismissal on DraftModal and PrepForCallModal. Modals only close via explicit Close button, X button, or Mark as sent buttons. Simple dialogs (delete confirmations, no-coaches error) keep dismiss-on-outside behavior.

**3. URL state persistence across major browsing pages.**

Symptom: Finn navigates calendar to July 2026 on /camps, clicks a camp, hits back button — returns to /camps list view instead of calendar at July 2026.

Fix: replaced useState with useSearchParams + router.push pattern across:
- /camps: view, timeframe, status filter, tier filter, calendar month (?view, ?timeframe, ?status, ?tier, ?month=YYYY-MM)
- /schools: view, stage, tier, division, quick filter, search (?view, ?stage, ?tier, ?division, ?quick, ?search — 400ms debounced)
- /campaigns: filter (?filter)
- /messages: status filter, type filter (?status, ?type)

Default values omitted from URL for clean bookmarkable links. All state changes create history entries.

**4. Pipeline Activity widget — false positives + starved bucket.**

Symptom: HOT bucket contained 8 schools including WPI ("we've done nothing"), Lehigh, Bowdoin. ACTIVE bucket only Cornell + Case Western, missing MSOE despite a May 19 outbound.

Fix to src/lib/pipeline-rail.ts:
- HOT now requires authored_by IN ('coach_personal', 'coach_via_platform') — team_automated excluded
- 60-day staleness window on HOT entries
- parse_status filter (orphan/non_coach excluded)
- Per-bucket caps: HOT max 5, ACTIVE max 5
- WARMING/COLD excluded from widget entirely (not actionable on Today page)

**5. Six historical classifications manually corrected.**

Reclassified 6 known blast emails that had been marked coach_personal/requires_action to team_automated/informational:
- WPI / Coach Kelley / May 7 — ID clinic blast
- Bucknell / Dave Brandt / May 6 — "shooting this out to all 27s"
- CMU / May 4 — "expressed strong interest" templated
- Rochester / May 1 — embedded RQ + Program Guide
- Cal Poly SLO / April 19 — "Thanks for filling out our questionnaire"
- CMU / April 8 — "All," opening

**6. Classifier upgrade — Haiku 4.5 → Sonnet 4.6 + blast-detection rules.**

Root cause of the 6 misclassifications: Haiku 4.5 was fooled by personal sender addresses. Fix to src/lib/classify-inbound.ts:
- Model: claude-haiku-4-5-20251001 → claude-sonnet-4-6 (~$0.50/month additional)
- New CRITICAL RULE: body content overrides sender signals. Blast indicators (group salutations, self-identified blasts, templated post-RQ funnel language, generic camp announcements) → team_automated regardless of sender.
- 3 new few-shot examples (8-10): coach blast from personal email, templated post-RQ funnel, counter-example with genuinely personal body.

Updated LLM Model Standards:
- Classify inbound: **Sonnet 4.6** (was Haiku 4.5)
- Coach scraper, camp extractor: Haiku 4.5 (unchanged)

Future work flagged: backfill reclassification of recent historical inbound rows (60-90 days). Review queue only surfaces low-confidence rows — high-confidence-but-wrong is invisible (design gap, less critical with improved classifier).

**Architectural principles consolidated from May 19:**

1. Canonical sources must auto-sync or be queried directly (cached state divergence)
2. Handlers must never silently bail
3. Working surfaces with expensive content require explicit dismissal
4. URL is canonical for browsable UI state
5. Body content trumps sender metadata for classification

### Communications Plan Rework — Option A Model (May 19-20, 2026)

**The problem this solved:**

Two surfaces overlapped confusingly: the Communications Plan section on the school detail page (Phase 3 of the original messaging strategy work) and the topic suggester in the Draft Email modal. Both drew from the message inventory, both suggested "what to say next," and the relationship between them was never clear. Finn didn't know what the Communications Plan was for or how it connected to drafting an email.

Additional issues: the draft modal's topic suggestions sometimes felt random (e.g., suggesting "which camp should I attend?" tacked onto an unrelated email); Finn couldn't select multiple messages for one email; there was no way to prioritize suggestions; and generated emails read like an adult professional rather than a 17-year-old.

**The model chosen — Option A:**

The Communications Plan is the BRAIN (planning surface): prioritized suggestions, strategic Q&A, Finn's notes. The Draft Email modal is the HANDS (execution surface): it pulls from the plan and generates the email. The draft modal no longer derives its own topics — it executes the plan.

This was shipped in 4 phases.

**Voice fix (shipped first, separately):**

Before the 4-phase rework, a standalone fix to email generation voice. buildEmailDraftPrompt and campaign-email-generator.ts got a VOICE section: Finn is a 17-year-old high school senior, not a corporate professional. Hard rule: never use em-dashes or en-dashes. Avoid formal-business phrasing ("I wanted to reach out", "Moreover", "at your earliest convenience"). Plain, direct, genuine teenager voice. Contractions fine. Concrete rewrite examples provided in the prompt so the model has positive examples, not just negatives.

**Phase 1 — Schema + generator (migration 047):**

- New table school_plan_questions (id, school_id, question, answer, model_used, created_at) — for the strategic Q&A feature.
- New column school_message_plan.manual_order (uuid[]) — Finn's manual reordering of suggestions, array of message_ids.
- suggestions jsonb shape extended: each item gains priority (integer, 1 = highest) and tier ('primary' | 'extra').
- school-message-plan-generator.ts: now returns 3-6 PRIMARY items + up to 4 EXTRA items (was fixed 2-3). Primary = the main prioritized list; extra = lower-priority suggestions surfaced on demand. Generator prompt instructs strategic prioritization over the full conversation arc, not arbitrary ordering.
- New file school-plan-qa-generator.ts: answerSchoolStrategyQuestion() — Opus 4.7, answers a strategic question about one school using full conversation context. Honest and concise, no useless hedging.

**Phase 2 — Communications Plan UI rebuild:**

CommunicationsPlan.tsx rebuilt into 4 subsections:
1. Coverage (collapsible) — unchanged.
2. Suggested next messages — primary items as a prioritized, drag-to-reorder list (HTML5 drag-and-drop, no library). Manual order persists via manual_order. "Show me more" reveals extra-tier items, de-emphasized. "Update suggestions" (quiet styling) replaces the old "Refresh" button — framed as "incorporate the latest conversation," not a reroll. Regeneration merges manual_order (preserves Finn's ordering for surviving message_ids).
3. "Anything else to cover" — the old "Strategic notes" textarea, relabeled and reframed as the place for items Finn wants in upcoming emails that aren't auto-suggested. Auto-saves to finn_notes.
4. "Ask about this school" — strategic Q&A box. Single-shot questions, Opus-generated answers, last 5 Q&As shown with timestamps.

New endpoints: POST/GET /api/schools/[id]/strategy-question. The message-plan PATCH now accepts manual_order; the POST merges manual_order on regeneration.

**Phase 3 — Draft modal pulls from the plan:**

The school-detail draft path (Draft email, Draft check-in) was reworked. The draft modal no longer runs its own topic suggester. Instead:
- Stage 1 (pick): loads the school's Communications Plan. Primary suggestions shown as a checklist — timing='send_now' items pre-checked, 'wait'/'after_event' unchecked. "Show plan extras" reveals extra-tier items as additional checkable rows. An "anything else to cover" textarea is pre-filled from the plan's finn_notes — but it's a per-email WORKING COPY; editing it does NOT write back to the saved plan notes.
- Stage 2 (generate): sends the selected message_ids (coverageItems: titles + notes) and the textarea content (coverageNotes) to /api/draft-email. The email generates to cover exactly those things — no separate topic derivation.
- buildEmailDraftPrompt gained coverageItems and coverageNotes; renders a COVER THESE MESSAGES section.
- The CAMPAIGN draft path is unchanged — campaigns personalize a campaign-wide message_set across many schools and have no per-school plan.
- The topic suggester (buildTopicSuggestPrompt, /api/draft-email/suggest-topics) is retained but no longer called. Candidate for future deletion.

**Phase 4 — Closing questions:**

Every generated email ends with a strategic closing question that follows logically from the email's content and drives the conversation forward (fixes the "random camp question" problem).
- The generation call returns: subject, body (with a closing question woven into the closing paragraph), closingQuestion, and closingAlternatives (2-3 alternative questions).
- System prompt instructs: the closing question must fit the email's actual content, be woven into a natural closing paragraph in Finn's voice, not bolted on. Alternatives must be genuinely different strategic directions.
- New endpoint POST /api/draft-email/swap-closing — Sonnet 4.6 rewrites ONLY the closing paragraph around a different question, rest of body untouched.
- Draft modal review stage shows the active closing question + 2-3 alternatives as swap buttons. The alternatives set is fixed (doesn't refresh on swap). Swapping rotates the old question back into the options.
- Inventory questions that end up in the sent body are caught automatically by the Phase 2 coverage detector — no special handling.

**The model, summarized:**

- Communications Plan = the brain. Prioritized draggable suggestions, "show me more" depth, custom-cover notes, strategic Q&A. Durable per-school strategy.
- Draft Email modal = the hands. Picks from the plan, generates from exact selections, offers swappable closing questions. Executes; does not re-derive.
- This applies to the school-detail draft path only. Campaign drafts are unchanged.

### Camp Materiality + Schools Signal Consolidation (May 28, 2026)

**1. Camp discovery materiality gate (migration 048).**

The Saturday Tavily camp scrape was re-discovering ~25-30 already-known camps each week and creating fresh "Updates Existing Camp" proposals for each. The queue was so full of noise that Finn had stopped reviewing it. Root cause: shouldSkipProposal() returned skip:false for any matched existing camp, with no check for whether anything had actually changed.

Fix:
- Migration 048 adds camp_proposals.update_summary text column.
- New classifyCampUpdate() in src/lib/camp-extractor.ts: given a matched existing camp and proposed_data, computes whether any newly-associated A/B/C tracked school appears (as host or attendee). If yes → material, with a human-readable summary ("Bucknell added as host", "CMU and Rochester added as attending schools"). If no → immaterial, skip entirely.
- Both the live email trigger and the Saturday cron now gate proposal creation on materiality. Immaterial re-scrapes increment proposalsSkipped instead of creating noise.
- Review UI split into "New camps (N)" and "Updates (N)" sections with descriptive badges.
- 27-proposal backlog cleared via scripts/reclassify-camp-proposals.ts (--dry-run flag verified all 27 were noise before running for real).

Finn's priority order codified: (1) brand-new camps, (2) existing camps with newly-associated A/B/C tracked school as host or attendee, (3) everything else (dates, URLs, descriptions, costs) → skip silently.

**2. School recency state consolidation.**

Two independent classifiers (deriveSignal in src/lib/signals.ts for /schools, classifySchool in pipeline-rail for Today) drifted apart, producing conflicting signals and several real bugs:
- "Awaiting reply" and "Active" both rendered teal (opposite meanings, indistinguishable).
- Mines showed "Going cold · 97d" but it was a decline — isAwaitingReply ignored intent='decline'.
- C-tier schools never got Active or Going Cold signals.
- Active outbound prospecting showed "—" because no inbound existed yet.
- No authored_by filter — team blasts made schools look awaiting reply.

Fix:
- New src/lib/school-recency-state.ts is the canonical classifier. classifySchoolRecency() returns one of six states (or null):
  - HOT (Awaiting Finn) — unreplied coach inbound from real coach, within 60-day window. Red.
  - ACTIVE (Active) — two-way activity, last contact <14d, no unreplied. Teal.
  - COOLING (Cooling) — last contact 14-30d. Amber.
  - COLD (Cold) — last contact >30d. Gray.
  - PROSPECTING (Prospecting) — outbound only, no inbound yet. Outlined dot.
  - DECLINED (Declined) — most recent coach inbound was intent='decline' with no later outbound. Muted gray with strikethrough.
  - null — no contact at all, or category Nope/Inactive.
  A/B/C all eligible. Each state has a distinct color — no two states look alike.
- SCHOOL_RECENCY_STYLE map exports per-state styling (dot/bg/text/fill colors).
- /schools list and Today pipeline widget now both delegate to classifySchoolRecency. Pipeline widget keeps its A/B-only tier filter as a documented divergence (classifier is canonical; widget is opinionated about what it surfaces).
- /schools list gained a 6-chip signal filter (multi-select, URL-persisted via ?signal=hot,active).

src/lib/signals.ts (deriveSignal) is now retired — unimported, safe to delete in a follow-up cleanup.

**3. Map signal overlay + filter.**

/schools map previously colored pins by tier only. Insufficient for trip planning ("which schools should I visit on this Northeast trip" needs to know recency state, not just tier).

Initial design used tier-colored ring + signal-colored fill, but the ring was visually too heavy — competed with the fill for attention. Final design:
- Pin fill = signal color (red HOT, teal ACTIVE, amber COOLING, gray COLD, white PROSPECTING, muted DECLINED).
- Tier letter inside pin remains (A/B/C/Nope).
- No tier-colored ring. PROSPECTING pins get a thin neutral border (1.5px gray) for visibility against light map areas.
- Signal filter chips on the map (same 6 states as the list filter, URL-persisted).

**4. Pipeline widget cap + overflow indicator.**

Pipeline Activity widget caps were 5 schools per bucket (HOT and ACTIVE). With Finn's recent outreach burst, ACTIVE had 10 schools and Rochester (#6 in sort) was silently bumped off — looked like the widget wasn't working.

Fix:
- Caps raised 5 → 8 for both HOT and ACTIVE.
- Each bucket now carries totalCount alongside the capped schools list.
- When totalCount > cap, widget renders "+N more →" link routing to /schools?signal=hot or /schools?signal=active (uses the signal filter from fix #3). Pre-applied filter on landing.

---

**Architectural patterns reinforced today:**

1. *One source of truth for derived state.* classifySchoolRecency is canonical "where am I with this school" — surfaced consistently on /schools list, /schools map, and Today widget. Same conceptual principle as classifyCampUpdate (canonical "is this camp update material") and the cache-divergence work from earlier in May. When two surfaces compute related answers, they should call the same function — not independent implementations.

2. *Bounded lists should acknowledge what they're hiding.* The "+N more →" pattern on the Pipeline widget. When a widget caps a list for UI compactness, the cap itself should signal there's more underneath and provide a direct path to see it. Silent truncation is a failure mode — feels like a bug. Applies to any future widget that needs to cap a list.

3. *Agentic research over static research-then-synthesize.* When a generation task requires gathering information that can't be fully specified in advance (which pages to fetch, which search queries to run, what to do when a search comes back empty), give the LLM web tools directly rather than pre-running fixed queries. The model's ability to decide what to look for next based on what it has already found is the entire point — collapsing that into a static pipeline strips out the judgment that made the task solvable in the first place. Use static research only when the queries needed are known and fixed in advance.

4. *Doc-structure decisions are output quality, not visual polish.* When generating documents, the choice between "bold inline text" and "Heading 2" is not aesthetic — the former creates flat content, the latter creates a proper document outline. Heading hierarchy makes documents navigable, copy-paste-able, and convertible to other formats (PDF, structured data). Default to heading levels for any text that would appear in a table of contents, even if visual styling could be achieved with bold runs.

### Prep-for-Call PDF Migration + Deploy Discipline (June 4, 2026)

**1. call_prep_docs RLS policy gap.**

call_prep_docs was created in migration 049 with RLS enabled but no policies — Postgres default in that state is deny-all for non-service-role connections. Service-role inserts from the API route succeeded; client SELECTs returned 200 + empty array + error: null. All 4 uploaded Rochester prep docs were invisible in CallPrepSection despite existing in the DB.

Diagnostic path: Network tab confirmed the query was firing correctly with the right school_id and getting an empty result with no error. SQL editor returned the rows fine — which proved nothing, because the SQL editor uses the service role. pg_policies check revealed the gap.

Fix: migration 051 added "auth users full access on call_prep_docs" FOR ALL TO authenticated USING (true) WITH CHECK (true), mirroring contact_log.

Fingerprint to remember: 200 + empty array + error: null = silent RLS deny. Service-role verification (SQL editor, supabase admin client) proves nothing because it bypasses RLS entirely. Always verify with the actual client role.

**2. Coach archival — silent FK failure.**

The school modal's red-X coach delete was doing a hard DELETE on coaches, which fails on FK constraints from contact_log.coach_id (ON DELETE SET NULL is set, but other FKs RESTRICT). The handler had \`if (!error) { ... refresh }\` which swallowed the failure: the row didn't delete, the UI refreshed anyway, and the coach appeared "gone" until the next page load brought them back.

Fix (migration 052): added archived_at timestamptz to coaches with index on (school_id, archived_at). Red-X replaced with neutral Archive button + inline confirmation. Active-coaches queries filter archived_at IS NULL; contact_log/prep_doc coach_id resolution doesn't filter so historical references remain intact. PATCH /api/coaches/{id}/archive and /unarchive endpoints with school-ownership auth.

Pattern: every Supabase mutation needs an explicit error-surfacing branch, not just an \`if (!error)\` happy path. FK violations are invisible if you only check the truthy side of the error object.

**3. Prep-for-call docx → PDF migration (the long arc).**

Motivation: Finn doesn't have MS Word and docx renders unreliably in Apple Pages. Full replacement, no docx fallback in the generation path (existing .docx docs still readable via the unchanged download route).

Attempt 1 — @react-pdf/renderer with JSX (call-prep-pdf.tsx, 5 LETTER pages, Helvetica built-in, nested \`<Text>\` for split-runs). Failed on Vercel with React error #31 ("Objects are not valid as a React child, found: object with keys {$$typeof, type, key, ref, props}") thrown from inside the @react-pdf reconciler (Wt/Bn/wr/wl/Sl/bl/Ge in reconciler-23.js). Local \`npx tsx scripts/test-pdf-render.ts\` with real Colby data PASSED, ruling out the source code. A minimal test endpoint with just \`<Document><Page><Text>Hello</Text></Page></Document>\` ALSO failed on Vercel with the identical error — confirming @react-pdf is fundamentally incompatible with Next.js 16's bundler, not a code-level bug we could fix.

Attempt 2 — pdfmake (declarative JSON doc definition, no React reconciler). Local generation produced valid 12-page PDFs. Deployed and hit ENOENT for /ROOT/node_modules/pdfkit/js/data/Helvetica-Bold.afm — pdfkit hardcodes \`__dirname + '/data/Helvetica-Bold.afm'\` and __dirname after Next.js's file tracing doesn't match where the .afm files end up (foliojs/pdfkit issue #1549).

First fix attempt: outputFileTracingIncludes in next.config. Initial attempt used the wrong route key ('/api/prep-for-call/generate/route' with /route suffix per my own bad guidance) — silent no-op. App Router keys use URL path WITHOUT /route. Corrected to '/api/prep-for-call/generate' + '/api/**/*' fallback glob. File trace verified locally, but Vercel runtime still failed with the same ENOENT — because pdfkit's __dirname resolution doesn't survive bundling regardless of what files are traced.

Final fix: bundle @fontsource/arimo TTFs (Arimo-Regular, Arimo-Bold, Arimo-Italic, Arimo-BoldItalic) into ./fonts/. Use pdfmake's PdfPrinter (not the default front door) with explicit font definitions, keyed as 'Helvetica' but pointing to Arimo TTFs via path.join(process.cwd(), 'fonts', ...). outputFileTracingIncludes includes './fonts/**/*'. This bypasses pdfkit's standard-font path entirely — pdfmake never looks for the .afm files because we never ask for the standard fonts.

Result: 13-page Colby PDF generates successfully in production. Helvetica throughout (rendered from Arimo TTFs, visually identical for practical purposes), heading hierarchy preserved, split-run question labels render inline, why-it-matters bold-italic label + italic body, page breaks at Part 1/2/3/4, POST-CALL section with horizontal rule.

**4. LLM JSON output parsing robustness.**

Even after the PDF rendering worked, generation failed at "Research iteration 6" with "Unexpected non-whitespace character after JSON at position 2183". JSON.parse in call-prep-research.ts line 258 was choking on Claude's structured response.

Root cause: the model occasionally returns JSON wrapped in markdown fences mid-string (not just at the boundaries), or with brief commentary text alongside the JSON. The previous parser used anchored regexes (^/$) that only matched fences at the absolute start/end of the string, and a greedy \`\{[\s\S]*\}\` fallback that over-matched when commentary contained braces (function bodies in code examples, set notation in math, etc.).

Fix: non-anchored fence stripping (/\`\`\`json\s*/gi + /\`\`\`\s*/g) plus balanced-brace extraction with explicit string-boundary tracking — track \`inString\` flag, handle escape sequences so an escaped quote inside a string doesn't flip the flag, only count braces when not inside a string. Surfaces the actual JSON object regardless of where it sits in the response.

**5. Deploy/git discipline crisis.**

Mid-debug discovery: \`git status\` revealed the entire call_prep_docs feature had been uncommitted for a week. The last commit (May 28, camps/schools/pipeline) was itself local-only — 1 commit ahead of origin/main. All today's work plus the prior week's work was untracked.

Root cause: parallel deploy paths created an illusion. \`vercel --prod\` CLI deploys ship the working tree directly (including untracked files) but label the resulting deploy with the LOCAL HEAD SHA in the dashboard. So the dashboard showed "deployed: SHA abc123" matching local HEAD, while the actual content was working-tree state including untracked files. When CC subsequently pushed actual git commits, auto-deploy from main built from committed state only, effectively reverting working-tree-only state from prod.

Resolution: backup branch backup-todays-work-2026-06-04 created at HEAD before any cleanup. Single catch-up commit consolidated the week's work. CLAUDE.md updated with Deployment & Git Discipline section enforcing: (a) no Vercel CLI use, all deploys via git push + auto-deploy; (b) \`git status\` required before every \`git add\` and after every \`git commit\`, with the status output being the proof of "committed and pushed" rather than the verbal claim.

**Architectural patterns reinforced today:**

1. *RLS-enabled-with-no-policy is silent deny-all.* Fingerprint: 200 status + empty array + error: null. Service-role verification (SQL editor, admin client) proves nothing because it bypasses RLS. When a SELECT returns no rows but the query looks right, check pg_policies for the table BEFORE re-checking the query.

2. *FK constraints + \`if (!error)\` swallow pattern equals silent UI failure.* Every Supabase mutation needs an explicit error-surfacing branch. Refreshing on the implicit truthy side hides RESTRICT violations and similar constraint errors.

3. *@react-pdf/renderer is fundamentally incompatible with Next.js 16's bundler.* A minimal test endpoint reproduces React error #31 from inside the reconciler. Don't reach for @react-pdf in this stack. pdfmake is the working alternative.

4. *pdfkit standard fonts don't survive Next.js file tracing.* pdfkit hardcodes \`__dirname + '/data/*.afm'\`, which breaks after bundling regardless of outputFileTracingIncludes config. Bundle custom TTF fonts and use pdfmake's PdfPrinter with explicit font defs — avoid the standard-font path entirely.

5. *Production behavior doesn't match source code → suspect the deployed bundle first.* When local execution succeeds and Vercel execution fails with environment-specific errors (React reconciler errors, ENOENT on bundled files, __dirname mismatches), the source code is rarely the problem. Build a minimal repro endpoint to isolate environment from code.

6. *Test fixtures with mock data don't prove anything about real-data code paths.* A test that passes with hand-written mock objects can completely miss a bug that fires on the actual data shape from production. When debugging a real-data failure, capture real prepData/payload from logs and use THAT in tests, not synthesized fixtures.

7. *LLM JSON output parsing must handle the messy edge cases.* Non-anchored fence stripping, balanced-brace extraction with string-boundary tracking. The model will sometimes wrap, sometimes commentate, sometimes both — the parser has to survive all of it.

8. *Vercel CLI deploys + uncommitted working tree = misleading SHAs and partial reverts.* The dashboard's "deployed: SHA xyz" can be a lie when the deploy was shipped from working-tree state but labeled with local HEAD. Establish git-only deploys as policy (see CLAUDE.md) and \`git status\` checks as the proof-of-commit ritual.

9. *Diagnostic-first beats theorize-first.* Multiple times today, hypothesized fixes failed because the theory didn't match the actual behavior. Adding instrumentation (console.log, minimal test endpoints, real-data capture) cut faster to the root cause than static analysis. When stalled, bisect.

### School Detail Page Rework + Conversation Summary (June 15, 2026)

**Architectural pattern: Plans evolve from features.**

The Communications Plan as a standalone surface was designed when most schools were cold or prospecting and "what should I say next?" needed real pre-thinking. As conversations became active back-and-forth, that planning surface became out of place at the top of every school visit — most opens are "I got a Today nudge, what do I do?" not "I'm doing strategic planning." The ConversationSummaryCard (June 15) is the active-phase equivalent: a synthesized Gmail-style summary + a contextually-labeled recommended action — with the original strategic planning material (uncovered inventory suggestions) absorbed into the "Show alternatives" expander. Features earn their real estate based on the dominant use case of the moment; surfaces should be re-evaluated as that changes.

### School Detail + Home Page Reworks (June 15, 2026)

**1. School detail page rework.**

Communications Plan retired as a top-of-page surface. New ConversationSummaryCard (Opus 4.7-generated Gmail-style 2-3 sentence synthesis + contextually-labeled primary action button + Show alternatives expander that absorbs the prior Suggested next messages list). Migration 053 adds school_conversation_summary table. Fire-and-forget regen on every contact_log insert for A/B/C tier schools via hooks in gmail-sync and sendgrid-inbound paths. Manual refresh endpoint at /api/schools/[id]/conversation-summary. Layout reorganized: timeline near top, action items promoted to top of sidebar, About panel below with Strategic notes field migrated from old Communications Plan's "Anything else to cover" textarea. Coverage UI removed (school_message_log + detector kept running, no surface). Strategic Q&A UI removed (school_plan_questions table stays unused). Initial backfill ran across 23 active A/B/C schools.

**2. Per-coach button iteration.**

Initial rework removed all coach card action buttons. Restored per-coach Draft email after user feedback — per-coach context still valuable for emailing non-primary coaches (e.g., emailing the HC when the primary contact is an AC, or vice versa). Prep for call removed from per-coach cards entirely — prep docs are realistically only generated for the primary contact at a school. School-level "Prep for call" then moved out of a top-of-page action row and into the Prep docs collapsed disclosure where it semantically belongs (the button generates a prep doc; it belongs with the prep docs). Added "Summary and Next Steps." header above the ConversationSummaryCard to match the existing section header style ("Conversation.", "Coach", etc.).

**3. Home page rebuild.**

Today renamed to Home (nav label + route). Tactical scoring approach dropped — neither user used TacticalSection, HeroSection, HandledSection, or PipelineRail. New layout: compact stats strip with 6 metrics (active schools by tier, pipeline phase distribution as inline-labeled stacked bar, camps registered + upcoming, emails this month with in/out split, response rate, schools awaiting response), recency-sorted stack of compact ConversationSummaryCard variants (top 5 visible by default + "Show all" expand), Think section relocated below the cards. Wait-state cards hidden from default top 5 (revealed via Show all in a separate subsection below non-wait cards). Left-edge color stripes on cards keyed to recommended_action.category: red=reply, orange=follow_up, amber=check_in, blue=introduce/new_topic, gray=wait. "Awaiting Finn" metric clickable, navigates to /schools?signal=hot. Driven by direct user research ("Finn never uses Today" + structured questions about actual usage).

**4. Home → Schools count alignment bug.**

Home stat initially used recommended_action.category = 'reply' (strict — 3 schools). The /schools?signal=hot link target used classifySchoolRecency = 'HOT' (broader — 5 schools). Two surfaces, same intent, different filters, user-visible mismatch. Resolved by aligning the home stat to the canonical recency-state model (classifySchoolRecency). Wording updated from "N coaches awaiting reply" to "N schools awaiting your response" — accurate to the broader set, which includes cases where the coach has replied and Finn owes the next move (e.g., Clark, Middlebury).

**Architectural patterns reinforced today:**

1. *Surfaces follow the dominant use case.* Communications Plan was designed for cold and prospecting schools; the ConversationSummaryCard works for active back-and-forth. Today's tactical scoring was designed for task-driven users; Home's recency-sorted cards work for school-driven users. As usage patterns evolve, re-evaluate surface design rather than accreting features on existing surfaces.

2. *One canonical classifier, used everywhere (reinforced).* When two surfaces compute a related answer, they MUST call the same function — otherwise definitional drift creates user-visible mismatches. The home-stat / schools-filter discrepancy was a textbook instance of the classifier-drift pattern May 28 was supposed to have eliminated.

3. *User research before design.* The Home rework was driven by the simplest possible signal — "Finn never uses it" — followed by structured questions about who actually uses the page, where they start, and what they care about. Design choices fell out of the answers rather than being imposed from architectural preferences. When a surface isn't working, the first move is to understand the actual usage pattern, not to redesign blind.

4. *Cached LLM artifacts are infrastructure.* The school_conversation_summary table was built for the school detail page in the morning and became the data source for the Home card stack by afternoon. When LLM outputs are cached durably (via a regen-on-data-change pattern) instead of regenerated per request, they become composable infrastructure for multiple surfaces at no additional cost. Worth designing future LLM-generated artifacts with this composability in mind.

### Status Updates, Schools List Rework + Session Cleanups (July 9, 2026)

**1. Per-school status updates (migration 054).**

New school_status_updates table: dated log of Finn's current state and intentions per school (camps, timing, recruiting decisions) — distinct from contact_log (things that happened), Strategic notes (email guidance), and schools.notes (freeform). Each entry carries a share_with_coach flag (yes/no/undecided) enforcing a hard contract: share='no' entries inform advisory surfaces (summaries, recommendations, prep docs) but are barred from generated outbound email content; share='yes' entries get worked in where relevant; 'undecided' may be referenced only when clearly valuable, flagged for Finn's review. Wired into fetchSchoolContext (10 most recent, always) and all five LLM prompt builders. New StatusUpdatesPanel on school detail sidebar between Actions and Coach. Any insert/update/delete triggers a forced conversation-summary regen. Leak test verified in prod: share='no' camp-conflict entry correctly excluded from a generated draft; flipped to 'yes', correctly incorporated.

**2. Schools list rework.**

Stage and Progress columns removed (Finn didn't use them; schools.status field and the Stage filter dropdown preserved — status still drives Home's pipeline distribution). Replaced by a Next-step column: recommended_action category pill (same color scheme as Home card stripes) + truncated description from school_conversation_summary. Expandable accordion rows show full summary, rationale, contextual action button, and updated timestamp; expand affordance is distinct from row-click navigation. Mobile rows show the category pill alongside the recency pill.

**3. Summary staleness regeneration.**

Event-driven regen (contact_log inserts, status update changes) covers most freshness, but summaries also drift stale from time alone — camp dates passing, "wait" recommendations aging out. New weekly cron summary-refresh (Sundays 13:00 UTC) regenerates summaries older than 7 days for active A/B/C schools, 1 req/sec, wired into cron_runs (migration 055 extended the cron_name check constraint). Manual "Refresh summaries" button on the schools list with a cost-aware confirm dialog (~$3, ~1 min for the full pipeline) — a deliberate escape hatch, not a routine action.

**4. "+ Add school" button was never wired.**

The button on the schools list did nothing — not a regression, but a visual-only placeholder from the April Phase 3 restyle (commit 5a64da3) that was never connected. Unnoticed for ~3 months because schools entered via SQL and imports. Fix wired it to SchoolModal in add mode with insertSchool + error surfacing per the no-silent-bail principle.

**5. Visual cleanup: SchoolModal + pipeline page.**

SchoolModal (legacy add/edit modal) restyled to the current design language (warm parchment palette, bold-italic section headers, pill buttons/badges); coaches and action items confirmed edit-mode-only. The legacy pipeline page (URL-only, never in nav) was audited: Dashboard tab dropped (superseded by Home), Question Bank tab dropped (redundant with the questions route), redundant Add School header button dropped. Pipeline table, Actions, and Contact Log tabs kept — each is a still-unique global view (inline status editing + drag reorder; cross-school action items; cross-school contact log) — and restyled. Copy for Claude payload untouched, button restyled. Default tab is now Pipeline.

**6. Data corrections + auth.**

Finn's academic numbers corrected everywhere: GPA 3.81W/3.56UW (was 3.78/3.57), SAT 1380 (was 1340 in the athlete profile). Five files fixed including two hardcoded instances in prompts.ts; historical trajectory references (1340 → 1380) intentionally preserved; player_profile.academic_summary verified already current. Git auth switched from HTTPS+token to SSH after a GitHub token rotation broke pushes — token rotations no longer touch the git workflow. New schools added via SQL for PPA Penn 1 (Haverford, St. Lawrence + head coaches); camp coach list also supplied Amherst assistant email, new Emory and Cornell assistant coach records.

**Architectural patterns reinforced today:**

1. *Advisory context vs. outbound content is a hard boundary.* The share_with_coach flag formalizes a distinction that matters for any LLM system holding user confidences: information the model should KNOW (to advise well) vs. information it may SAY (in generated output). Enforce it as an explicit per-item contract in the prompt, and verify with a leak test — "don't mention X" instructions are historically leaky and pass/fail is observable.

2. *Cached LLM artifacts compound (reinforced).* school_conversation_summary now powers three surfaces — school detail, Home cards, and the schools list Next-step column + expanded rows — from one generation cost. Freshness is layered: event-driven regen for data changes, weekly staleness cron for time drift, manual refresh as a deliberate escape hatch with visible cost.

3. *Buttons that were never wired look identical to buttons that broke.* The Add School placeholder survived ~3 months because its failure mode (click, nothing) is indistinguishable from a silent-bail regression. When shipping visual-first, either wire a stub that surfaces "not implemented" or don't ship the control.

4. *Unused columns cost attention.* Stage and Progress were accurate but unused — every glance at the table paid a small scan tax on them. Removing display columns while preserving the underlying field and its filter keeps the data model intact and reclaims the space for what Finn actually wants (next steps).

### Coach Scraper Hardening (July 12, 2026)

**1. False "scraper stale" banner.** The scraper route had two early-return paths that skipped completeRun, and the main loop had no try/catch — unhandled exceptions 500'd the route leaving cron_runs rows stuck 'running' forever. The health check requires status IN (success, partial), so a scraper that ran but crashed looked identical to one that never ran. Fix: all exit paths complete the run (success, partial on per-school errors, failed on fatal). Same principle as the May 19 no-silent-bail rule, applied to cron instrumentation: the audit trail must record the unhappy paths, which is exactly when it's needed.

**2. Pending-proposal dedup.** The May 5 Bug A dedup only suppressed re-proposals after terminal rejection; unactioned PENDING proposals duplicated every run. Extended to skip when a pending row with the same signature exists — one pending proposal per unique change, ever.

**3. Role oscillation guard.** Karl Schroeder (Colby) accumulated 15 proposals over 3 months — Haiku alternately parsing ambiguous page text as "Assistant Coach" vs "Other," including a false departure (applied July 5 while he remained on the page), which then caused endless coach_added re-proposals since is_active=false excluded him from the diff. Fixes: Karl reactivated with role Assistant Coach; new guard skips role_changed proposals that are the exact inverse of one applied for the same coach within 30 days (logged as role_oscillation). A human already picked a direction; the scraper doesn't relitigate it.

**4. Tier filter.** Scraper now only runs schools where category IN (A,B,C) and status != Inactive. Nope-tier schools (e.g., DU) no longer scraped; historical coach records untouched.

**5. Manual prod verification.** A dashboard-triggered run confirmed all fixes live: 24 A/B/C schools scraped, DU skipped, oscillation guard caught Yuri Nascimento's inverse proposal minutes after his role change was applied. Known false-positive pattern reconfirmed: hand-added coaches from camp lists (Peters/Cornell, Sherman/Emory) propose as "departed" until they appear on official staff pages — reject, don't apply.

**Architectural patterns reinforced:**

1. *Audit trails must record failure paths.* An instrumentation call only on the happy path is worse than none — it converts crashes into silent staleness.
2. *Dedup must cover pending state, not just terminal state.*
3. *LLM parsers oscillate on ambiguous input; guards should detect inversion of recent human decisions rather than trying to make the parser deterministic.*
4. *Scope expensive automation to the target set* (tier filter) — the scraper serves the pipeline, not the database.

### Draft Threading, Asset Library + Auth (July 14-15, 2026)

**1. Recommended action → draft flow threading.** The conversation summary's recommended_action was displayed but ignored by DraftModal, which seeded only from the message plan — the user read a specific recommendation ("post-camp thank-you to Robinson"), clicked Draft, and got a generic inventory email addressed to the wrong coach. Fix: recommendation passed through as a prop from all three surfaces (school detail card, Home card, schools-list expanded row via a ?action=draft URL param), shown as framing context, pre-filling "anything else to cover," pre-checking only source_message_ids items, and anchoring buildEmailDraftPrompt via a RECOMMENDED NEXT STEP section. Summary generator schema extended with recommended_coach_id (jsonb, no migration) — the generator emits the target coach's id at generation time rather than the modal string-parsing names. Null-safe for cached summaries.

**2. test_scores asset type + call_prep archaeology.** Adding the type surfaced a constraint violation: three orphaned type='call_prep' asset rows from the June 4 debug marathon (triplicate IIT Milkent docx generations, all is_current=false) predating the call_prep_docs migration. Cleaned (storage via dashboard per the protect_delete guard, rows via SQL), migration 056 then applied cleanly. The exhaustive Record<AssetType,...> maps surfaced all five label/badge sites at compile time.

**3. Asset edit affordance.** Assets had no way to edit name/type/description post-upload. Diagnosis found the Edit button existed for link cards but file cards' onEdit was wired to a no-op — the second "phantom button" found this month (Add School was the first). Full edit modal shipped: category-constrained type dropdown, warning when retyping away from LLM-consumed types, retype-to-resume prompts Re-parse rather than auto-parsing.

**4. Gmail OAuth root cause.** The recurring every-5-10-days Gmail auth error was the Google Cloud OAuth app sitting in Testing mode, which hard-expires refresh tokens after 7 days. Published the app (unverified — the only user is Finn's account); tokens no longer expire. No code change. Also that week: git auth moved from HTTPS+token to SSH after a token rotation broke pushes.

**Architectural patterns reinforced:**

1. *When two systems both "know" the answer, the fresher one must feed the older one* — the recommendation/draft seam existed because two brains (summary vs message plan) evolved independently.
2. *Schema constraints are archaeology tools* — the 056 violation surfaced debris no one knew existed.
3. *Phantom buttons: visual-first shipping without wired handlers is indistinguishable from regression. Grep for no-op handlers when auditing old surfaces.*
4. *Emit structured references (coach ids) at LLM generation time instead of parsing prose downstream.*

### Recruiting Funnel Rework + Judgment Doctrine (July 17, 2026)

**1. The two-axis model.** The old 6-step stage display (derived from the status field, built April) conflated commitment depth with evaluation events and couldn't express the endgame phase now arriving (pre-reads, board placements). Replaced with: a revised 6-stage ladder (Research, Reach out, Engage, Evaluate, Advance, Decide) stored as schools.recruiting_stage — measuring DEPTH reached, never auto-demoting, auto-floored 1-3 from contact_log (substantive coach inbound = 3), manual promotion for 4-6 since those require judgment about coach statements — plus school_milestones badges (seen_live, written_evaluation, pre_read_requested, pre_read_passed, visit, support_offered; manual-only, unique per school). Key rules from pressure-testing: stage 4 entry evidence must be observable coach behavior, not Finn's submissions; stage ≠ priority (Rochester is stage 4 and cold — depth and temperature are independent axes); terminal declines exit via Nope tier rather than any special state (Mines stays plotted at stage 4 × Cooling: declined as a striker, reactivation planned with the wingback profile under the new HC). Migrations 057. Backfill: 54 schools staged; IIT, Rochester, Mines seeded at 4.

**2. The quadrant grid.** New collapsible FunnelGrid on Home (between stats strip and cards): stages as columns, recency states as rows, school chips in cells — a grid of ordinal categories, deliberately NOT a scatter. Action-labeled quadrant zones split at stage 3|4 and Active|Cooling: Close (deep+hot), Convert (shallow+hot), Re-warm (deep+cold), Nudge (shallow+cold). Re-warm is the quadrant the old funnel couldn't express — schools that spent real evaluation effort and parked (Rochester, Mines). Cell truncation removed in a follow-up — all chips render. Reuses classifySchoolRecency (one-canonical-classifier rule).

**3. The judgment doctrine layer.** Live case: after Lafayette's soft-negative ("not in our top pool at the position" — Bordwick, post-PPA), the summary correctly recommended a gracious reply but also suggested asking "what would move him into their top pool" — wrong etiquette from a lower board tier (solicits development feedback in response to a roster-depth verdict; reads as not hearing the message). Root cause: prompts encoded mechanics but no recruiting philosophy. New RECRUITING_JUDGMENT constant (8 principles: roster-math vs development verdicts; no what-would-it-take asks from below; acknowledge coach directness; investment matches reciprocity; state plans over asking permission; no premature commitment signals; one purpose per email; default to the graceful version) injected into all five LLM surfaces. Verified: Lafayette's regenerated recommendation dropped the ask and cited the roster-math distinction in its rationale; Colgate spot-check confirmed no overcorrection — hot conversations stay forward-leaning. Maintenance model: when a recommendation gets corrected in practice, the settled principle is a one-line diff that teaches every surface at once.

**4. Live events absorbed the same week.** Lafayette promoted to stage 4 (+written_evaluation) on Bordwick's board-placement email. St. Lawrence promoted 2→4 on Coach Mike Toshack's written PPA evaluation (4/4/5/5, projection D2/high-D3 → low-D3, strengths: consistent, 1v1 defending, getting forward; coach first name corrected from the seeded "Matt"). The eval projections now triangulate (Rochester "second tier," Lafayette "not top pool," Toshack D2/hD3-lD3) into a coherent band confirming the list's shape: mid-D3 is the sweet spot, top-D3/NESCAC correctly classified as reaches, 1v1 defending the constant across every evaluator.

**Architectural patterns reinforced:**

1. *Separate ordered depth from unordered events* — forcing milestones into a ladder produces stages schools skip or regress through; badges + ladder each do one job.
2. *Auto-derive floors, manually promote judgment calls* — LLMs guessing at board placements from email tone would misfire; humans reading coach emails is the right sensor for stages 4-6.
3. *Encode settled judgment as prompt doctrine* — corrections that stay in chat history are lost; principles in a shared constant compound across every surface.
4. *Visualize the model you actually built* — the grid is the two-axis model made glanceable, and its empty right third (Advance, Decide) is the fall's roadmap.


### App Reorganization: Phases, Vocabulary, Offers (July 25 – August 6, 2026)

**1. The product fork and the phase model.** Prompted by demo feedback from other recruiting parents ("not immediately wowed"), a UX review identified that the nav mapped when features were built, not how the app is used, and that the app's value (accumulated conversational state) is invisible cold. The reorganization pivot: structure the app around the four phases of the recruiting journey, which mirror the per-school stage ladder at the family level. Phase names chosen for the demo promise ladder: **Get Ready** (profile, assets, messages, list building + a School Discovery placeholder), **Get Seen** (camps/showcases + Campaigns' new home — campaigns exited Finn's daily nav but is the early-phase hero for the future product), **Get Recruited** (the daily surface — formerly Home; Think section retired), **Get In** (NEW — offers, admissions, the decision). Schools stays top-level and phase-independent; admin surfaces collapsed under Settings. Root route redirects to Get Recruited.

**2. Get In + school_offers (migration 058).** New offers ledger: school_offers (offer_type, headline, money_note, conditions, key_dates, status, received_on — text-first fields until comparison needs tighten them). Wired into fetchSchoolContext and the summary generator. Built against the live case and immediately absorbed two real offers: Illinois Tech conditional admission (July 23 — Aerospace Engineering, $25K/yr renewable Heald, transcript condition, FAFSA Oct 1 code 001691, official aid letter January; IIT promoted to stage 5 + pre_read_passed) and Clark positive pre-read (received in the same window — $40K/yr minimum merit × 4 years, floor not ceiling; CommonApp required, opened Aug 1; Clark promoted to stage 5). Migration 058 as first shipped was missing the updated_at trigger — applied manually, migration file patched (920ed03).

**3. The March vocabulary resurrection (cycle 2 + 2.5).** The original March design canvas (recovered from Randy's Claude Design files) had color-as-meaning and scale-as-drama that had been flattened away through incremental removals. Ported onto today's architecture with two deliberate softenings chosen by Randy: RUST (#B5502F) replaces alarm-crimson as the act-now accent, and WARM CHARCOAL (#2E2B28) replaces black as the settled/weighty register. The system: parchment base; rust points at what's first (one priority card via deterministic pickDailyPriority — open offer ≤14 days > oldest unanswered reply > time-sensitive follow_up > recent HOT — 6px rust edge + rust ghost numeral; 3px stripes remain the category system, thickness disambiguates); charcoal marks weight (offer cards, the resurrected "Caught up." zero state with teal check); green carries the calm phases (status lines, next-move cards). Every phase masthead gets a live rule-derived status line (asset freshness / next camp days-out / nearest offer date / awaiting-N). Get Seen's camp count replaced with an 8-week dot timeline; asset timestamps freshness-banded (green ≤30d, amber 31-90, rust >90). FunnelGrid pass: temperature dots, strengthened quadrant tints, rust-bordered Close-zone chips.

**4. Behavior fixes surfaced by prod review.** pickDailyPriority's offer rule could never fire — offer schools' summaries are wait-category and wait cards were excluded before selection ran; fixed by letting rule-1 winners bypass the wait exclusion. Passed key dates rendered future-tense ("CommonApp opens Aug 1" five days after Aug 1); date parsing now compares against today and flips verbs ("open since"). Also: one Vercel webhook miss left cycle 2 unbuilt while later commits deployed — resolved with an empty-commit push; second webhook hiccup this month.

**5. Cycle 3 seams.** DraftModal (the app's highest-traffic modal) fully restyled off the purple/blue era onto parchment (ink selection states, rust recommendation framing, black pill primary); MessagesClient link colors converted; CampsCalendar blue deliberately kept (functional status color, not chrome). Designed empty states across 8+ surfaces in the house voice. Unified "+ Note" capture popover on school detail — one entry point routing to status update / action item / contact log / strategic note via existing tables (schools.notes deliberately excluded; it's edit-in-place reference). Offer detection shipped propose-don't-create: the summary generator flags possible_offer when inbound terms aren't reflected in recorded offers (gated on the offers context it already receives); a charcoal chip opens the add-offer modal pre-filled by an on-demand extraction route (POST api/offers/extract, Sonnet-class); human reviews every field — the same review-queue pattern as coach changes.

**Architectural patterns reinforced:**

1. *Organize by journey phase, not feature chronology.* Every feature has a season; the nav should teach the process, not archive the build order. Campaigns wasn't dated — it was early-phase.
2. *Design vocabulary is a system: color-as-meaning + scale-as-drama, tuned to the product's voice.* The judgment-doctrine app shouldn't shout; rust recommends where crimson alarmed, charcoal is weight not void.
3. *Deterministic selection over LLM mood for attention-directing UI* (pickDailyPriority) — and watch for rule interactions: the offer rule and the wait-exclusion silently cancelled until prod review caught it.
4. *Date language must be computed, not templated* — any stored date rendered with a tense verb needs a today-comparison.
5. *Propose-don't-create for high-stakes records (reinforced from coach changes).* Offers are the weightiest data in the app; detection + pre-fill + human save closes the arrived-unnoticed gap without trusting extraction blindly.
6. *Build the endgame surface against the live case.* Get In was designed while IIT's terms were fresh and absorbed Clark's structurally different offer days later — the comparison layout earned its spec immediately.
7. *Generated files with a delete-and-regenerate step silently discard anything written directly to the output.* Edits must go to the source constants (FALLBACK_HEADER/FOOTER in generate-claude-context.ts), and a heading-diff against the prior version is the cheap verification after any regeneration. (Learned the hard way: a69f255 dropped 29 narrative sections.)

### Marketing Front Door, School Discovery + Merged Calendar (August 7, 2026)

**1. Toolchain + model upgrade.** Claude Code migrated from the npm install to the native installer (v2.1.224), which resolved a stale-binary mystery: the global config specified claude-opus-4-8 but sessions ran Opus 4.6 until the migration. Global default now claude-opus-4-8 (~/.claude/settings.json); a Model Review Cadence section in CLAUDE.md nudges a biweekly check. Vercel MCP plugin authenticated with a doctrine addendum: READ deploy status and build logs only, never trigger/cancel/redeploy — deploys remain git-push-only.

**2. Public marketing home page.** The root route is now a public, auth-free marketing page (all content fictional — Sam Rivera, Class of 2028; zero app data queried). Hero ("Get recruited. / Without the guesswork." — second line in rust), four-phase promise ladder with faithful per-phase UI vignettes, an intelligence before/after demonstrating the judgment doctrine, a fictional FunnelGrid, and demo CTAs (stub route). The old root redirect to get-recruited removed; signed-in users get an Open-the-app button; sidebar logo links home. A middleware gotcha was caught en route: src/proxy.ts auth-gates by allowlist, and the demo stub route needed adding to it.

**3. Get Ready buildout.** Assets rebuilt as visual cards (reel with ghost play-triangle anchor, document cards, freshness color-banding). NEW Test Scores card displays actual numbers from a structured player_scores jsonb block added to player_profile (migration 060) — the prose academic_summary was fragile to parse, and the structured pass surfaced a fourth AP score (Human Geography 4, sophomore year, confirmed real) that conversation-level context had missed. School Discovery v1: discovery_schools universe table (migration 059), facet browse (division, region with NY-in-Northeast convention, academic and enrollment bands, engineering flag), add-to-list into the working pipeline at C-tier, and an LLM find-more-like-these layer (Sonnet-class, cached per seed-set, 12 candidates requested and top 8 returned after exclusion).

**4. Discovery hardening arc.** Three rapid follow-ups after the initial ship: (a) proposals excluded only the seed subset, so pipeline schools stored under different name forms (Case Western vs Case Western Reserve, WPI vs Worcester Polytechnic Institute) reappeared as discoveries — fixed by resolving the ENTIRE working list through universe ids, with abbreviation bridging via short_name rows; (b) the universe completed from 811 to 1,066 rows (D1 207 complete, D2 174 complete, D3 394 with all major conferences, NAIA 178 near-complete, JUCO 113 recruiting-relevant) with omission preferred over invention at the uncertain tail; (c) bare-name collisions (Union, Wheaton, Trinity, Westminster, Concordia) resolved by disambiguated seed names PLUS an ambiguity guard in the matcher — exactly-one-match-or-refuse, so colliding names return a verify-program flag rather than the wrong school.

**5. Get Seen merged calendar.** New calendar_events table (migration 061 — showcases, tournaments, outreach send-moments; optional school linkage; updated_at trigger present per the 058 lesson) with an Events section and modal on the Camps page. The Get Seen timeline rebuilt as a proportional 10-week merged view: camps as green dots (filled = registered), showcase/tournament ranges as bars, outreach moments as a rust send glyph — the fall outreach arc (schedule release Sep 1, reel drop Oct 1, end-of-season HS update Nov 11) now sits visibly on the line. Masthead status line and next-move card draw from the merged set. Post-ship fix with a deeper root cause: declined camps were rendering (Case Western, declined, was winning the next-move card) because the camp_finn_status PostgREST embed resolves as an object, not an array — the array-indexed read made finn_status silently null for EVERY camp all along, which had also disabled the filled-dot logic. One repaired read healed three symptoms; the timeline now filters camps to interested/targeted/registered.

**Architectural patterns reinforced:**

1. Resolve entities through ids, not names — the discovery matcher bridges name forms via universe ids, and where names genuinely collide, refuse to match rather than guess (verify-program beats wrong-school).
2. Prefer omission over invention at the knowledge tail — a phantom program a family might contact is worse than a missing one.
3. Silent-null reads are multi-symptom bugs — the object-vs-array embed mismatch presented as three unrelated display issues; when a status field seems universally ignored, check the read before the logic.
4. Structured data beats prose for anything a component renders — the player_scores block both fixed fragile parsing and surfaced a real fact (the fourth AP) the prose had buried.
5. The docs generator has sharp edges, now three: edits go to BOTH the live file and the fallback constants; delete-and-regenerate discards direct edits; and Recent Changes text cannot contain backticks (it lives in a JS template literal). Consolidate these into an editing-safely note in CLAUDE.md at a future pass.

---

## 10. Session Startup Checklist for Claude Code

1. Read \`CLAUDE_CONTEXT.md\` (this file)
2. Skim \`src/lib/types.ts\` to confirm current type definitions
3. Ask Randy: "Any pipeline changes or new coaching contacts since last session?"
4. Always match DB queries to exact column names in Section 4
5. Never hardcode school names, coach names, or emails — pull from DB
6. If touching the schools table, confirm whether the change should also update \`updated_at\`
   (the trigger handles this automatically on UPDATE)

---

`

const FALLBACK_FOOTER = `
---

## 12. Recent Changes

> **How to use this section:** When you make a meaningful change — new feature, schema update,
> tech stack addition, recruiting strategy shift — add a one-line entry here with the date.
> Most recent at the top. This is the fastest way for Claude Code and Claude.ai to catch up
> on what's changed since they last saw the repo.

| Date | What changed | Type |
|---|---|---|
| 2026-08-08 | Get Seen timeline polish: cards edge-clamped inside the container (stems connect off-center at edges), 1-3 day ranges render as single dots (bars only for 4+ days — Middlebury now one dot with the range in its card), vertical spacing tightened ~35%. | UX |
| 2026-08-08 | Get Seen timeline bold treatment: events render as cards-on-stems (next event as a filled petrol hero card with days-out pill; others outline), markers enlarged with white rings (attend circles vs rust rounded-square send markers), 4px rail, black TODAY post, collision-staggered stems, doubled vertical presence. Display-only — merge logic, data colors, and legend semantics unchanged. | UX |
| 2026-08-08 | Get Seen rework: petrol accent adopted from the marketing palette (first in-app jewel migration; timeline data semantics unchanged), masthead status line removed per the Get Ready precedent, page restructured into The calendar plus an Every way in exposure toolkit — recruiting questionnaires card (rq_status metric + not-started chips), film card resurrecting the orphaned batch-reel machinery (coverage metric + BatchReelModal restored and restyled), outreach-at-scale campaigns card, and a coaches-on-file card. Purpose-driven subtitle and second-person copy throughout. | Feature + UX |
| 2026-08-08 | Get Ready pass 3: Your Targets card rebuilt as unified labeled segmented rows (tier, depth, selectivity, division) with stepped in-row color ramps and counts-in-legend (color never the sole carrier). Program facets shipped: discovery_schools.programs text array (migration 062, engineering backfilled from the deprecated boolean), six-program vocabulary (engineering, business, nursing, premed-health, computer science, education) seeded best-effort with absence-means-unknown semantics, Programs multi-select filter, and programs context added to find-more-like-these. | Feature + Schema + UX |
| 2026-08-08 | Get Ready pass 2: section eyebrows removed (single bold-italic headers), kit card headings unified green, Open assets link added. Message inventory renamed Talking Points (standalone card between the kit and the list) with new supporting copy and useful metrics (staleness signal + story-coverage share, replacing raw counts). The list card enriched with depth snapshot (by recruiting stage), selectivity spread (via the discovery id-bridge, unrated bucket for unresolved), and division mix. Discover facets converted to multi-select with checkboxes; Engineering filter retitled Programs (single option, more facets pending a data pass). Fixed find-more exclusion miss on Colorado School of Mines (working row stored as CO School of Mines vs the universe Colorado School of Mines — the co/colorado token gap blocked both exact-name and id-bridge exclusion; renamed the working row to the canonical name). | UX + Bug fix |
| 2026-08-08 | Get Ready rework: universal second-person voice; masthead status line removed (the next-move hero card is now the single message — precedent to cascade to other phases); page restructured into two named zones (Your materials / The kit: 2x2 equal-weight asset grid + message inventory; Your school list / The list: summary + Discover as the featured citizen). Asset grid: reel, resume, transcript, and test scores as four equal cards with distinct glyph treatments (play triangle, versioned doc, academic doc, hero SAT number + compact AP line). | UX |
| 2026-08-08 | Marketing page palette v2: phase ladder rebuilt on the jewel register — emerald, petrol, persimmon, violet (Option I; persimmon becomes the page's act-accent everywhere rust appeared; violet closer resolves the Get In vs judgment-box charcoal collision). 2x2 board: Close moved to top-right (depth left-right, warmth bottom-top), fictional chips replaced with 16-24 real programs from the discovery universe. Marketing page only — in-app palette migration deferred to a future pass. | UX |
| 2026-08-08 | Marketing page revision: phase cards rebuilt as bold color fills (green, NEW burnished gold for Get Seen, rust, charcoal — a warming ladder) with light-on-dark vignettes; phases section recopied ("Your recruiting roadmap."); universal second person across the page plus the in-app phase subtitles; judgment section reframed ("never the desperate one"); full FunnelGrid render replaced with a 2x2 quadrant summary with an inside-the-app tease. | UX |
| 2026-08-07 | Get Seen timeline fixes (display-layer only; camps data + Camps-page sort untouched): (1) declined/other camps excluded — the merged calendar's camp source now filters to finn_status IN (interested, targeted, registered), so the timeline, masthead status line, and next-move card only reflect camps Finn is pursuing (Case Western, declined, no longer wins the masthead; nearest is now Colby). Root cause also fixed: the camp_finn_status embed returns a one-to-one OBJECT, not an array — the old [0] read made finn_status always null, so filled-dot and any status filtering silently never worked. (2) Range camps now render as bars like range events (Middlebury Aug 15–16), green with registered/targeted opacity. | Bug fix |
| 2026-08-07 | Get Seen buildout: calendar_events table (migration 061 — showcases, tournaments, outreach moments; optional school linkage via calendar_event_schools) with add/edit UI on the Camps page (distinct "Events." section; kind selector, single/range dates, location hidden for outreach moments, status, school multi-select). Timeline rebuilt as the merged visual centerpiece: camps (green dots), showcases/tournaments (neutral dots, range→bars), outreach send-moments (rust send glyph), proportional 10-week window, today marker, week ticks, next-item emphasis, legend, mobile stacked fallback. Masthead status line + next-move card now draw from the merged camp+event set. Seeded the three real fall outreach moments (schedule release Sep 1, reel drop Oct 1, end-of-season HS update Nov 11). Camps machinery (proposals, finn_status, coach attendance) untouched — parallel table merged at display time. | Feature + Schema |
| 2026-08-07 | Get Ready buildout: Assets rebuilt as visual cards (reel with ghost play-triangle anchor, document cards, NEW Test Scores card showing actual SAT/AP numbers read from a structured player_scores block on player_profile — migration 060, not hardcoded). School Discovery v1: discovery_schools universe (migration 059, 1,066 curated men's-soccer programs — D1 207 / D2 174 / D3 394 / NAIA 178 / JUCO 113 — with division/region/academic/enrollment facets; NY→Northeast convention; token-key collisions like Union/Boston/Wheaton/Trinity resolved by an ambiguity guard that returns no match rather than the wrong school, plus disambiguated display names), facet browse + add-to-list into the working pipeline (C-tier, Not Contacted, facets folded into notes; the "On your list" badge and similarity both bridge name-form differences via short_name/discovery id, so a current target like WPI or Case Western is recognized and never re-offered), and LLM "find more like these" (/api/discover/similar, Sonnet-class) — 3+ seed schools produce 5–8 reasoned lookalikes token-matched to the universe so facets ride along, excluding every current pipeline school (not just the seed set), cached per seed-set hash with a Refresh override. Get Ready next-move card points at live Discover when assets are fresh. | Feature + Schema |
| 2026-08-07 | Public marketing home page at / (auth-free, fully fictional content): hero + four-phase promise ladder with per-phase accent vignettes (mini priority card, offer card, timeline, asset card), intelligence section with fictional before/after, fictional FunnelGrid render, demo CTAs (stub /demo). Root redirect to /get-recruited removed — signed-in users get "Open the app →" from the page header; sidebar logo now links to /. App routes' auth untouched. | Feature |
| 2026-08-06 | Cycle 3 seams: DraftModal + MessagesClient restyled from purple/blue era onto parchment language (rust recommendation framing, house pills, warm borders, black pill primaries). Designed empty states across 8 surfaces (school detail timeline/actions/coaches/camps, CampsClient, MessagesClient, CampaignsClient, CallPrepSection). Unified "+ Note" capture popover on school detail — one entry point routing to status update / action item / contact log / strategic note via existing tables and hooks. Offer detection: summary generator flags possible_offer when inbound terms aren't reflected in recorded offers; charcoal notice chip on ConversationSummaryCard links to Get In; extraction route at /api/offers/extract pre-fills the add-offer modal via Sonnet (propose-don't-create — human reviews every field). | UX + Feature |
| 2026-08-06 | Cycle 2.5 phase-page punch: live status lines under all four phase mastheads (asset freshness / next camp / nearest offer date / awaiting-N), March green "next move" card resurrected on Get Ready + Get Seen (rule-derived, hides when no genuine move), asset timestamp freshness color-banding, ghost glyphs on Get Ready cards, Get Seen camps count replaced with an 8-week dot timeline. Fixes: pickDailyPriority rule-1 schools now bypass the wait-exclusion (offer schools can win the rust card); passed key dates no longer render as "opens" (masthead fragment + offer notice bars). | UX + Bug fix |
| 2026-08-06 | App reorg cycle 2: March design vocabulary resurrected. Get Recruited: stats strip removed (awaiting-N into masthead as rust status line + optional offer-deadline fragment), queue priority treatment — one card via deterministic pickDailyPriority (near-dated open offer > oldest reply > time-sensitive follow_up > recent HOT) with 6px rust edge + rust ghost numeral; secondaries white with ink numerals; 3px category stripes retained (thickness disambiguates). Charcoal "Caught up." zero state resurrected (teal check). FunnelGrid pass: temperature dots, eyebrows, strengthened quadrant tints, rust Close-zone chip borders. Phase accents: green (Get Ready/Get Seen), rust (Get Recruited), charcoal (Get In — offer cards restyled with aligned comparison layout + date awareness; IIT admitted vs Clark application-required legible at a glance). | UX |
| 2026-08-06 | App reorg cycle 1: phase-based architecture. Nav rebuilt around the four journey phases — Get Ready (profile/assets/messages/list + discovery placeholder), Get Seen (camps + campaigns' new home), Get Recruited (formerly Home; Think section retired), Get In (NEW — offers/admissions endgame). Migration 058 adds school_offers; IIT's July 23 conditional admission ($25K/yr Heald, transcript condition, Oct 1 FAFSA, January aid letter) seeded as the first offer card. IIT promoted to stage 5 + pre_read_passed milestone. Offers wired into LLM context. Schools stays top-level; Settings collapses admin surfaces. Campaigns/Messages/Library/Camps exit top-level nav, live within phases, routes intact. | Feature + Schema + UX |
| 2026-07-17 | Recruiting-judgment doctrine layer: new RECRUITING_JUDGMENT constant (8 seeded principles — roster-math vs development verdicts, no what-would-it-take asks from lower tiers, acknowledge coach directness, investment matches reciprocity, state plans over asking permission, no premature commitment signals, one purpose per email, default to the graceful version) injected into all five LLM prompt surfaces (summary, draft, campaign, suggestions, prep). Maintained as one-line diffs when recommendations get corrected in practice. Verified against the live Lafayette case: post-regen recommendation dropped the top-pool ask in favor of gracious acknowledgment + stated cadence. | Feature |
| 2026-07-17 | FunnelGrid polish: cell chip truncation removed — all schools render in their cells (grid grows vertically as needed; mobile fallback also shows full lists). Prospecting row label spacing fixed (column widened 90px → 100px). | UX |
| 2026-07-17 | Recruiting funnel rework phase 2: depth × temperature quadrant grid on Home (collapsible, between stats strip and school cards). Columns = six recruiting stages, rows = recency states, chips = active A, B, C schools, clickable. Action-labeled quadrant zones (Close, Convert, Re-warm, Nudge) split at stage 3-4 and Active-Cooling. Transitional Declined signal renders in-grid with a triage marker; terminal declines exit via Nope tier. Mobile renders a stacked four-bucket fallback. | Feature + UX |
| 2026-07-17 | Recruiting funnel rework phase 1: revised 6-stage ladder (Research, Reach out, Engage, Evaluate, Advance, Decide) stored as schools.recruiting_stage (migration 057) — auto-derived floor for stages 1-3 from contact_log (never demotes), manual promotion for 4-6 via header popover. New school_milestones table + badges (seen_live, written_evaluation, pre_read_requested, pre_read_passed, visit, support_offered), manual-only. Old status-derived step display replaced. Stage + milestones added to LLM context. Backfill seeded IIT and Rochester at stage 4 with earned milestones; Mines at 4 (striker-era evaluation, reactivation planned). | Feature + Schema |
| 2026-07-14 | Asset library: Edit action added to asset cards — name, type (category-constrained dropdown), description, and URL (links) editable post-upload. Warning shown when retyping away from LLM-consumed types (resume, transcript, reels, SR); retyping to resume prompts Re-parse rather than auto-parsing. Storage paths unchanged on retype. New EditAssetModal component; Edit button now visible on both file and link cards. | Feature |
| 2026-07-14 | Asset library: "Test Scores" added as a file asset type (SAT reports, AP score reports). Migration 056 extends the DB check constraint on assets.type. TypeScript AssetType union, AddFileModal dropdown, AssetCard labels/colors, VersionHistoryDrawer labels, and upload route storage folder all updated (5 sites). Resume parser confirmed not triggered by test_scores uploads (gated on type === 'resume'). | Feature |
| 2026-07-12 | Draft flow now seeded by the recommended action: clicking a summary card's action button passes the recommendation into DraftModal — shown as framing context, pre-fills "anything else to cover," pre-checks only inventory items the recommendation references (source_message_ids), and anchors buildEmailDraftPrompt via a RECOMMENDED NEXT STEP section. Summary generator schema extended with optional recommended_coach_id (jsonb, no migration) so the draft targets the coach the recommendation names (Robinson vs. default chain); null-safe for existing cached summaries. Per-coach draft buttons and plan-only flow unchanged. | Feature + Bug fix |
| 2026-07-12 | Coach scraper fixes: (1) cron_runs completion gap — two early-return paths and unhandled exceptions in the scrape loop skipped completeRun, leaving rows stuck as 'running' and causing false "scraper stale" health banner; all exit paths now complete the run. (2) Pending-proposal dedup added — proposals with an existing pending (manual) row matching the same signature are now skipped, preventing duplicate proposals stacking across runs; 1 Nope-tier DU proposal cleaned up. (3) Tier filter — scraper now only runs A/B/C active schools (Nope and Inactive schools skipped; historical coach records untouched). (4) Role oscillation guard — role_changed proposals are skipped when the inverse change (before/after swapped) was applied within 30 days, preventing Haiku parse ambiguity from generating infinite ping-pong proposals. Karl Schroeder (Colby) reactivated (is_active=true, role=Assistant Coach) after false departure; moot coach_added proposal deleted. | Bug fix |
| 2026-07-10 | Schools list rework: Stage and Progress columns removed (status field and Stage filter preserved), replaced with Next-step column showing recommended_action category pill plus truncated description from school_conversation_summary. Rows expandable (accordion) to full summary, rationale, and action button. Weekly staleness cron (summary-refresh, Sundays 7 AM MT, migration 055 extends cron_runs check constraint) regenerates summaries older than 7 days for active A, B, C schools. Manual "Refresh summaries" button with cost-aware confirm dialog. | Feature + UX |
| 2026-07-10 | Per-school status updates: new school_status_updates table (migration 054) — dated log of Finn's current state/intentions per school, each entry with a share_with_coach flag (yes/no/undecided). Share flag is a hard contract: share='no' entries inform advice but are barred from generated outbound email content. Wired into fetchSchoolContext + all five LLM prompt builders. New Status updates sidebar panel on school detail. Adding/editing triggers summary regen. | Feature + Schema |
| 2026-07-10 | Visual design cleanup: SchoolModal restyled to current design language (warm parchment palette, bold-italic section headers, pill buttons, coaches/actions hidden in add mode). /pipeline legacy page restyled — Dashboard tab and Question Bank tab dropped (superseded by Home and /questions), "+ Add School" header button removed (/schools owns that flow), Pipeline now default tab. Pipeline table, Actions panel, and shell all restyled to match. No functional changes. | UX |
| 2026-07-10 | Bug fix: "+ Add school" button on /schools was broken — button had no onClick handler (visual placeholder since Phase 3 restyle, never wired). Added SchoolModal integration with insertSchool, error surfacing via alert on failure per the no-silent-bail principle. | Bug fix |
| 2026-07-08 | Data correction: Finn's academic numbers updated everywhere — GPA 3.81W/3.56UW (was 3.78/3.57), SAT 1380 (was 1340 in athlete profile). Verified LLM prompt builders pull from live sources rather than hardcoding. Checked player_profile.academic_summary for staleness. Historical trajectory references (1340 → 1380) intentionally preserved. | Data |
| 2026-06-15 | Bug fix: Home page "Awaiting Finn" stat now uses classifySchoolRecency = 'HOT' (matches the /schools?signal=hot filter it links to) instead of the stricter recommended_action.category = 'reply' filter. Wording updated from "N coaches awaiting reply" to "N schools awaiting your response" — accurate to the broader set, which includes cases where the coach has replied and Finn owes the next move. | Bug fix |
| 2026-06-15 | Home page polish: stats strip pipeline distribution bar now has inline segment labels + hover tooltips (taller bar, labels inside when segment wide enough, count-only for narrow segments). "Awaiting Finn" metric clickable, navigates to /schools?signal=hot. School cards: wait-state cards excluded from default top-5 (visible only via Show all expand, in a separate "Waiting on coaches" subsection below non-wait cards). Left-edge color stripe added to cards keyed to recommended_action.category (red=reply, orange=follow_up, amber=check_in, blue=introduce/new_topic, gray=wait). | UX |
| 2026-06-15 | Today page rebuilt as Home. Renamed nav label Today → Home (route stays at /). New layout: compact stats strip (6 metrics — active schools by tier, pipeline phase distribution stacked bar, camps registered+upcoming, emails this month, response rate, coaches awaiting Finn), recency-sorted stack of compact school summary cards (top 5 with Show all expand, click → school detail, reuses school_conversation_summary data), Think section (existing 4-5 strategic prompts relocated below cards). Removed: TacticalSection (scored top 3), HandledSection, PipelineRail visual widget. Underlying lib files (pipeline-rail.ts, today-scoring.ts, today-selection.ts, todayLogic.ts) kept as they have no cost and may be reused. Ingestion health banner preserved. Old TodayClient.tsx deleted. | Feature + UX |
| 2026-06-15 | School detail page rework + LLM-driven conversation summary. Migration 053 adds school_conversation_summary table. New ConversationSummaryCard at top of school detail surfaces 2-3 sentence Gmail-style summary of conversation state + contextually-labeled primary action button (Draft reply / Draft email / Draft check-in based on recommended action category). Hybrid model: recommendation pulls from both conversation state AND uncovered inventory messages. Fire-and-forget regen fires on every Inbound and Outbound contact_log insert for A/B/C tier schools (gmail-sync + sendgrid-inbound paths) with idempotency check against last_contact_log_id. Manual refresh endpoint at POST /api/schools/[id]/conversation-summary. Layout reorganized: timeline promoted near top, action items moved to top of sidebar, About panel below it (now includes Strategic notes field migrated from old "Anything else to cover" textarea), Call prep docs moved to collapsed disclosure below timeline. Coach card buttons: Draft email kept per-coach (each coach can be emailed directly), Prep for call removed from per-coach cards and surfaced school-level in secondary action row (fallback chain to primary coach). Removed UI: Coverage subsection (school_message_log table + coverage detector keep running, no UI surface), Strategic Q&A subsection (school_plan_questions table stays unused). Initial backfill ran summaries across 23 active A/B/C schools. | Feature + Schema + UX |
| 2026-06-04 | CLAUDE.md Deployment & Git Discipline rules added. Two constraints: never run Vercel CLI directly (all deploys via git push + auto-deploy from main); \`git status\` required before every \`git add\` and after every \`git commit\`. Existing "Before shipping" section's old \`vercel --prod\` reference updated to \`git push\` for consistency. Established after a multi-hour debug session where a week of feature work sat uncommitted in the working tree while CLI deploys silently shipped working-tree state with misleading dashboard SHAs. | Process |
| 2026-06-04 | Prep-for-call research JSON parsing made robust (src/lib/call-prep-research.ts). Model occasionally wraps its final structured response in markdown code fences mid-string or adds commentary alongside the JSON. Previous parser used anchored fence-stripping (^/$) that missed mid-string fences, with a greedy \`{[\\s\\S]*}\` fallback that over-matched on commentary containing braces. Replaced with non-anchored fence stripping plus balanced-brace extraction tracking string boundaries and escape sequences so quoted braces don't miscount. | Bug fix |
| 2026-06-04 | call_prep_docs RLS gap — migration 051 added missing SELECT policy. The table was created with RLS enabled (migration 049) but ZERO policies, producing default deny-all for the authenticated client. Service-role writes via server route succeeded; client SELECTs returned 200 + empty array + error: null (the silent fingerprint). All uploaded and generated prep docs were invisible until the policy was added. Policy mirrors contact_log's pattern: "auth users full access on call_prep_docs" FOR ALL TO authenticated USING (true) WITH CHECK (true). | Bug fix |
| 2026-06-04 | Prep-for-call output switched docx → PDF. Initial @react-pdf/renderer attempt failed in Vercel + Next.js 16 with React error #31 from inside the @react-pdf reconciler (reproduced even on a minimal Document/Page/Text test endpoint — fundamental bundler incompatibility). Migrated to pdfmake; pdfkit's standard-font __dirname lookup then failed in Vercel's traced bundle (ENOENT on Helvetica-Bold.afm). Resolved by bundling Arimo TTFs into ./fonts/ and using pdfmake's PdfPrinter with explicit font defs (alias 'Helvetica' → Arimo paths), bypassing the standard-font path entirely. New files: call-prep-pdf.ts (now .ts, not .tsx), fonts/Arimo-*.ttf. next.config outputFileTracingIncludes adds './fonts/**/*' under the '/api/prep-for-call/generate' key (no /route suffix — App Router keys use the URL path). Download route handles both .docx and .pdf; existing .docx docs still work. | Feature + Bug fix |
| 2026-06-04 | Coach archival: migration 052 (archived_at on coaches). Archive replaces hard-delete (which silently failed due to FK constraints). Inline confirmation, archived coaches disclosure with unarchive. Legacy Fields section removed from SchoolModal. useCoaches hook returns archivedCoaches + archiveCoach/unarchiveCoach. | Feature + Bug fix |
| 2026-06-04 | Prep doc upload capability added (migration 050: source column). UploadPrepDocModal for .docx/.pdf files with coach dropdown + date picker. Redundant "+ Generate" button removed from CallPrepSection — generation stays on coach card only. Source badges (Generated/Uploaded) on all docs. Upload API at /api/call-prep-docs/upload. | Feature |
| 2026-06-04 | Prep docs moved out of asset library into dedicated call_prep_docs table (migration 049). New CallPrepSection on school detail page between Communications Plan and Contact Log. New download route /api/call-prep-docs/[id]. useCallPrepDocs hook. 'call_prep' removed from AssetType. Generation writes to call_prep_docs instead of assets. | Schema + Feature |
| 2026-06-04 | Prep-for-call docx formatting fixed — proper heading hierarchy (H1/H2/H3), refined accent palette (8B1A1A dark red, 0D3D7A dark navy, 1F3A2F dark green, etc.), split-run question labels, document-level font defaults. Two content tuning items also applied: lead with positive achievements in Recent Performance, surface chemistry pathways before engineering when both exist. | UX |
| 2026-06-04 | Prep-for-call flow rebuilt with agentic research using Claude Opus 4.8 + web_search/web_fetch tools. Static "research-then-synthesize" replaced with model-driven research loop. Quality bar: matches or exceeds manually-built reference docs (Rochester, IIT). | Feature |
| 2026-06-04 | Prep-for-call button shipped (initial static-research version). Output failed quality bar — multiple "not available in research" gaps where research was conducted but missed primary sources. Replaced same-day. | Bug fix |
| 2026-05-28 | Pipeline widget cap raised 5 → 8 with "+N more →" overflow link routing to /schools?signal=hot or ?signal=active. Map pin tier-ring removed — signal fill + tier letter only. | UX |
| 2026-05-28 | School recency state consolidation. New classifySchoolRecency() in school-recency-state.ts is canonical for /schools list, /schools map, Today pipeline widget. Six distinct states (HOT/ACTIVE/COOLING/COLD/PROSPECTING/DECLINED) each with distinct color. Decline precedence over going-cold. A/B/C all eligible. Map signal overlay + filter (URL-persisted via ?signal=). src/lib/signals.ts retired. | Feature |
| 2026-05-28 | Camp discovery materiality gate (migration 048). classifyCampUpdate() suppresses immaterial re-scrape proposals — only new camps and newly-associated A/B/C tracked schools (host or attendee) reach the queue. Review UI split into New camps / Updates sections with descriptive badges. Backlog of 27 noise proposals cleared via reclassify-camp-proposals.ts (dry-run verified first). | Bug fix |
| 2026-05-20 | Communications Plan rework complete (4 phases, migration 047). Option A model: plan is the planning surface (prioritized draggable suggestions, "show me more", strategic Q&A, custom-cover notes), draft modal is the execution surface (picks from plan, generates from exact selections). Closing questions with swappable alternatives. Email voice fixed to teenager tone (no em-dashes). | Feature + Schema |
| 2026-05-19 | Classifier upgraded Haiku 4.5 → Sonnet 4.6 with new blast-detection rules and few-shot examples. 6 historical misclassifications manually corrected. | Quality |
| 2026-05-19 | Pipeline Activity widget: HOT bucket filters by authored_by + 60-day staleness window, per-bucket caps (HOT 5, ACTIVE 5), parse_status filter added. | Bug fix |
| 2026-05-19 | URL state persistence across /camps, /schools, /campaigns, /messages: ~17 pieces of state moved from useState to useSearchParams + router.push. Back button restores page state naturally. | UX |
| 2026-05-19 | Modal dismissal protection: DraftModal and PrepForCallModal no longer dismiss on outside-click or Escape. Explicit close only. Simple dialogs unchanged. | UX |
| 2026-05-19 | Defensive coach fallback in school detail handlers: primary → head coach → most recently added active coach. "No active coaches" dialog instead of silent failure. | Bug fix |
| 2026-05-19 | Cached state divergence cleanup: 5 fixes total. Reel URL via assets table (3 surfaces), video send tracking via runtime detector, last_contact via ingest hooks, videos_sent replaced with last_video_url. Systematic audit identified all instances; established architectural principle (canonical source must auto-sync or be queried directly). | Bug fix + Architecture |
| 2026-04-26 | Phase 2a Milestone 3.5: AI personalization in draft review modal — Haiku 4.5, streaming, school + coach + inbound context, stats hallucination guard, no-coach-quote rule | Feature |
| 2026-04-26 | Phase 2a Milestone 3: draft review modal with copy/mark-sent-Gmail/mark-sent-SR/dismiss; channel value mapping (gmail/sr wire → Email/Sports Recruits DB) | Feature |
| 2026-04-26 | Phase 2a Milestone 2.5: "+ Add school" action with tier filter + search; channel column width fix | Feature |
| 2026-04-25 | Phase 2a Milestone 2: campaign detail view with template edit, schools table, status transitions, TODO callout for RQ template | Feature |
| 2026-04-25 | Phase 2a Milestone 1: New Campaign 3-step wizard + campaigns list page + Skip→Dimsd. column rename | Feature |
| 2026-04-24 | Phase 2a Milestone 0: migration 024 schema (campaign_templates, campaigns, campaign_schools) + 024b data migration (40 wingback + 38 RQ from action_items, 4 one-offs preserved) | Schema |
| 2026-04-24 | Phase 1 close-out: 180-day window + no tier gate + null-school guard in Today filter; strict confidence rubric + Example 7 in classifier; full 70-row reclassification ($0.16 total, 100% high confidence, 57% requires_action); 27→4 Awaiting Reply (21 orphans cleaned up, row 68 manual override applied); two bugs fixed (positive whitelist, null-school leakage) | Bug fix |
| 2026-04-23 | Phase 1: Inbound classification — migration 023 (authored_by × intent two-axis model, Haiku classifier, fire-and-forget live hook, /settings/classification-review UI, Today filter, tier selector on school detail) | Schema + Feature |
| 2026-04-23 | Part 5b: Gmail partials review UI — migration 022 (parse_status full/partial/non_coach/orphan, coaches.source), /settings/gmail-partials UI, reparsePartialsForSchool, backfill rescued 4 rows | Schema + Feature |
| 2026-04-23 | Part 5 complete: SPA skip (Notre Dame), ND coaches seeded, 18 queue items applied, 5 resolved (4 rejected team-inbox/false-positive, 1 accepted Emory 7-char convention) | Schema + Feature |
| 2026-04-23 | Part 5d: Coach Roster Scraper — migration 020, scraper with Claude Haiku 4.5, URL discovery, initial seed (6 new coaches), Sun+Wed cron, /settings/coach-changes review UI, Today view callout | Feature |
| 2026-04-23 | Part 5a: schools.domains[] infrastructure — migration 019, auto-learn script, parser Strategy 1b, reparse-orphan-domains.ts rescued 11 rows (Hopkins + Tufts) | Schema + Feature |
| 2026-04-22 | Part 4 extension: sent scan in autolabel captures Finn's direct outbound Gmail to known coaches | Feature |
| 2026-04-22 | Part 4 of email ingestion: Gmail API direct integration with OAuth, daily cron, /settings/gmail UI, parser rework | Feature |
| 2026-04-21 | Part 3a of email ingestion: live outbound CC capture via sendgrid webhook (HTML email preclean + reuse of sr-paste-parser) | Feature |
| 2026-04-21 | Part 3b of email ingestion: SR Sent bulk importer (migration 017, sr-paste-parser, /bulk-import page, content-hash dedup) | Feature |
| 2026-04-20 | Part 2 of email ingestion: SendGrid webhook + SR inbound parser (migrations 014, 015, 016) + school aliases + reparse script | Feature |
| 2026-04-19 | Part 1 of email ingestion: coaches table migration + backfill + app integration (migrations 012, 013) | Feature |
| 2026-04-19 | Phase 3c: Library landing, Assets/Questions restyle | Feature |
| 2026-04-19 | Phase 3b: School detail page at /schools/[id] with timeline, action bar, coach card | Feature |
| 2026-04-19 | Phase 3a: Schools list at /schools with filters, signals, 6-stage flow | Feature |
| 2026-04-19 | Phase 2: Today view replaces Dashboard as home page | Feature |
| 2026-04-19 | Phase 1: Liverpool design system + app shell | UI |
| 2026-04-19 | contact_log snooze/dismiss (migration 011) + Today Awaiting reply UI | Schema |
| 2026-04-17 | Prep for call feature — AI-generated school-specific question triage | Feature |
| 2026-04-17 | Question bank — 15 questions, 5 categories, add/edit/delete, nav tab | Feature |
| 2026-04-17 | school_question_overrides + school_specific_questions tables (migration 010) | Schema |
| 2026-04-16 | AI email drafting — /api/draft-email, DraftEmailModal, asset context layer | Feature |
| 2026-04-16 | Asset library — file upload, link management, versioning (migration 003) | Feature |
| 2026-04-16 | action_items table with drag-and-drop sort_order (migration 004-008) | Schema |
| 2026-04-15 | Initial app setup — schools, contact_log tables, Next.js + Supabase + Vercel | Setup |
| 2026-04-15 | Added \`generate-claude-context.ts\` script + \`npm run export-context\` | Tooling |

> **Change types:** Setup · Schema · Feature · UI · Tooling · Strategy · Coaching · Data

---

## 13. Key Coaching Contacts (verified April 2026 — confirm before emailing)

| School | Role | Name | Status |
|---|---|---|---|
| University of Rochester | HC | Ben Cross | 🔥 Hottest lead — praised film |
| MSOE | HC | Rob Harrington | Ongoing — connecting in May |
| Lafayette College | HC | Dennis Bohn | Ongoing conversation |
| Case Western Reserve | HC | Carter Poe | Responded on SR, sent schedule form |
| Cal Poly SLO | HC | Oige Kennedy | Invited to May 9-10 ID camp |
| Colorado School of Mines | HC | VACANT | Interim: Ben Fredrickson — hold all outreach |
| WPI | HC | Brian Kelley | Intro sent |
| RPI | HC | Adam Clinton | Intro sent |
| South Dakota Mines | HC | Teren Schuster | Replied April 15 — await Finn response |
| Bucknell | HC | Dave Brandt | Ongoing — 3-4-3 confirmed |
| Carnegie Mellon | HC | Brandon Bowman | Middling response — keep warm |
| Cornell | HC | John Smith | Intro sent |
| Dartmouth | HC | Connor Klekota | Hired Dec 2025 — intro sent |
| Emory | HC | Cory Greiner | Intro sent |
| Cal Poly Pomona | HC | Matt O'Sullivan | Intro sent |
| Washington University | HC | Andrew Bordelon | Intro sent |

---

## 14. "Copy for Claude" Export (strategy sessions in Claude.ai)

The app has a "Copy for Claude" button on the \`/pipeline\` page (\`src/components/DashboardClient.tsx\`),
which now defaults to the Pipeline tab (Dashboard and Question Bank tabs removed July 2026).
The button copies a formatted plaintext pipeline summary to the clipboard for pasting into Claude.ai
strategy sessions.

Format per school:
\`\`\`
SCHOOL: [name]
  Status: [status]
  Division: [division] — [conference]
  Last Contact: [date]
  Head Coach: [name]
  Notes: [notes]
  Next Action: [action] ([owner]) — due [date]
\`\`\`

---

*Context file last regenerated: see Section 11 header for date.*
*To update: \`npm run export-context\` from repo root.*
*Maintained by: Randy Almond | finnalmond08@gmail.com*
`

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔄  Fetching schools from Supabase...')

  const { data: schools, error: schoolsError } = await supabase
    .from('schools')
    .select('*')
    .not('category', 'eq', 'Nope')
    .not('status', 'eq', 'Inactive')
    .order('category', { ascending: true })
    .order('name',     { ascending: true })

  if (schoolsError) {
    console.error('❌  Error fetching schools:', schoolsError.message)
    process.exit(1)
  }

  console.log('🔄  Fetching contact log...')

  const { data: logs, error: logsError } = await supabase
    .from('contact_log')
    .select('*')
    .order('date', { ascending: false })

  if (logsError) {
    console.error('❌  Error fetching contact log:', logsError.message)
    process.exit(1)
  }

  console.log('🔄  Fetching action items...')

  const { data: actionItemsData, error: actionsError } = await supabase
    .from('action_items')
    .select('*')
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (actionsError) {
    console.error('❌  Error fetching action items:', actionsError.message)
    process.exit(1)
  }

  console.log('🔄  Fetching coaches...')

  const { data: coachesData, error: coachesError } = await supabase
    .from('coaches')
    .select('*')
    .order('sort_order', { ascending: true })

  if (coachesError) {
    console.error('❌  Error fetching coaches:', coachesError.message)
    process.exit(1)
  }

  const allSchools    = (schools         ?? []) as School[]
  const allLogs       = (logs            ?? []) as ContactLogEntry[]
  const allActions    = (actionItemsData ?? []) as ActionItem[]
  const allCoaches    = (coachesData     ?? []) as Coach[]

  console.log(`✅  ${allSchools.length} schools | ${allLogs.length} contact log entries | ${allCoaches.length} coaches`)

  // Group by tier
  const tiers: Record<string, School[]> = { A: [], B: [], C: [] }
  for (const school of allSchools) {
    if (tiers[school.category]) tiers[school.category].push(school)
  }

  // Count overdue actions
  const today = new Date().toISOString().slice(0, 10)
  const overdueCount = allActions.filter(a => a.due_date && a.due_date < today).length

  // Build Section 11
  const pipelineLines: string[] = []
  pipelineLines.push(`## 11. Live Pipeline — Generated ${todayFormatted()}`)
  pipelineLines.push('')
  pipelineLines.push(`**Active schools: ${allSchools.length}** | Overdue actions: ${overdueCount}`)
  pipelineLines.push('(Category Nope and status Inactive excluded)')
  pipelineLines.push('')

  for (const tier of ['A', 'B', 'C']) {
    const tierSchools = tiers[tier]
    if (!tierSchools.length) continue

    const tierLabel = tier === 'A' ? 'Tier A — Highest Priority' :
                      tier === 'B' ? 'Tier B' : 'Tier C — Exploratory'

    pipelineLines.push(`### ${tierLabel} (${tierSchools.length} schools)`)
    pipelineLines.push('')

    for (const school of tierSchools) {
      pipelineLines.push(formatSchoolBlock(school, allLogs, allActions, allCoaches))
      pipelineLines.push('')
    }
  }

  const outputPath = path.resolve(process.cwd(), 'CLAUDE_CONTEXT.md')

  // Try to preserve existing header/footer (Recent Changes, etc.) from the file
  const existing = parseExistingFile(outputPath)
  let header: string
  let footer: string

  if (existing) {
    header = existing.header
    footer = existing.footer
  } else {
    console.warn('⚠️  Existing CLAUDE_CONTEXT.md missing or malformed (no Section 11/12 markers).')
    console.warn('    Falling back to hardcoded static content.')
    header = FALLBACK_HEADER
    footer = FALLBACK_FOOTER
  }

  const output = header + pipelineLines.join('\n') + footer
  fs.writeFileSync(outputPath, output, 'utf8')

  console.log('')
  console.log(`✅  CLAUDE_CONTEXT.md written → ${outputPath}`)
  console.log(`    Tier A: ${tiers.A.length} | Tier B: ${tiers.B.length} | Tier C: ${tiers.C.length}`)
  if (overdueCount > 0) {
    console.log(`    ⚠️   ${overdueCount} overdue action${overdueCount > 1 ? 's' : ''} — check next_action_due`)
  }
  console.log('')
  console.log('    Ready for Claude Code: say "Read CLAUDE_CONTEXT.md before we start"')
}

main().catch(err => {
  console.error('❌  Unexpected error:', err)
  process.exit(1)
})

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
The app tracks ~50 active target schools across division, coaching contacts, outreach status,
contact logs, and next actions.

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
| Club | Albion SC Colorado MLS NEXT Academy (U19) |
| High School | Alexander Dawson School, Lafayette, CO |
| GPA | 3.81 weighted / 3.56 unweighted |
| SAT | 1380 (Math 690 / English 690) |
| Honors | National Honor Society |
| AP Courses | AP Calculus AB, AP Chemistry, AP U.S. History |
| Academic Interest | Mechanical Engineering or Aerospace Engineering |
| Email | finnalmond08@gmail.com |

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
notes               text
created_at          timestamptz
updated_at          timestamptz
\`\`\`

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
              'sports_recruits' | 'link' | 'other'
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
- **Styling**: Tailwind CSS
- **Deployment**: Vercel
- **Key paths**:
  - \`src/lib/types.ts\` — TypeScript types (School, ContactLogEntry, ActionItem, etc.)
  - \`src/lib/supabase.ts\` — Supabase client initialization
  - \`supabase/migrations/\` — schema (001) and seed (002) files
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
Rate-limited to 5 calls/sec (200ms delay). Cost ~\$0.00085/row (Haiku pricing).

**Review UI:** \`/settings/classification-review\` — shows all low-confidence classified inbound rows.
Groups by school. Per-card: authored_by + intent chips, Haiku notes, snippet with expand, override dropdowns,
"Save override" (sets confidence=high, removes from queue) and "Mark unknown" buttons.
Low-confidence count badge appears in sidebar nav ("Email Review" link).

**Today filter (\`src/lib/todayLogic.ts\` — \`isActionableReply\` + \`getFilteredAwaitingReplies\`):**
Positive whitelist (once classified): \`authored_by IN (coach_personal, coach_via_platform)\` AND \`intent = requires_reply\`.
Unclassified rows (\`classified_at IS NULL\`) are conservatively included until the live hook fires.
Window: 180 days. No tier gate. Null school_id rows excluded at the unreplied-detection layer.

**Tier does NOT gate Today's Awaiting Reply.** Classification + thread state + 180-day window are
the only filters. A Tier-Nope school with an unreplied coach question still appears in Awaiting Reply.

Rationale: if a coach asked a direct question, Finn owes a reply regardless of the school's current
tier. Finn can re-tier the school after replying. The tier gate was originally on the extended-window
logic but was removed during Phase 1 close-out — it would have hidden genuine unreplied asks from
NC State and MIT (both currently Tier Nope) that Finn should still respond to.

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

Phase 2 (campaigns) and Phase 3 (Today redesign) build on this foundation.

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

The app has (or will have) a "Copy for Claude" button that copies a formatted plaintext
pipeline summary to the clipboard for pasting into Claude.ai strategy sessions.

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

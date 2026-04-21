/**
 * generate-claude-context.ts
 *
 * Regenerates the dynamic pipeline section of CLAUDE_CONTEXT.md from live Supabase data.
 * Static sections (athlete profile, philosophy, tech stack) are preserved as-is.
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

// ─── Static content ───────────────────────────────────────────────────────────
const STATIC_HEADER = `# Finn Almond — College Soccer Recruiting App: Claude Context File

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
| GPA | 3.78 weighted / 3.57 unweighted |
| SAT | 1340 |
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
id          uuid PK
school_id   uuid FK → schools.id (cascade delete)
date        date
channel     'Email' | 'Phone' | 'In Person' | 'Text' | 'Sports Recruits'
direction   'Outbound' | 'Inbound'
coach_name  text
summary     text
created_by  uuid FK → auth.users.id
created_at  timestamptz
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

## 9. Session Startup Checklist for Claude Code

1. Read \`CLAUDE_CONTEXT.md\` (this file)
2. Skim \`src/lib/types.ts\` to confirm current type definitions
3. Ask Randy: "Any pipeline changes or new coaching contacts since last session?"
4. Always match DB queries to exact column names in Section 4
5. Never hardcode school names, coach names, or emails — pull from DB
6. If touching the schools table, confirm whether the change should also update \`updated_at\`
   (the trigger handles this automatically on UPDATE)

---

`

const STATIC_FOOTER = `
---

## 11. Recent Changes

> **How to use this section:** When you make a meaningful change — new feature, schema update,
> tech stack addition, recruiting strategy shift — add a one-line entry here with the date.
> Most recent at the top. This is the fastest way for Claude Code and Claude.ai to catch up
> on what's changed since they last saw the repo.

| Date | What changed | Type |
|---|---|---|
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

## 12. Key Coaching Contacts (verified April 2026 — confirm before emailing)

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

## 13. "Copy for Claude" Export (strategy sessions in Claude.ai)

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

*Context file last regenerated: see Section 10 header for date.*
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

  // Build Section 10
  const pipelineLines: string[] = []
  pipelineLines.push(`## 10. Live Pipeline — Generated ${todayFormatted()}`)
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

  const output = STATIC_HEADER + pipelineLines.join('\n') + STATIC_FOOTER
  const outputPath = path.resolve(process.cwd(), 'CLAUDE_CONTEXT.md')
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

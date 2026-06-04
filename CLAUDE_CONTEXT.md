# Finn Almond — College Soccer Recruiting App: Claude Context File

> **How to use:** Drop this file in the root of the repo. At the start of a Claude Code session,
> say: "Read CLAUDE_CONTEXT.md before we start."
>
> **To update the pipeline section:** `npm run export-context`
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
| Club | Albion SC Boulder County – MLS NEXT Academy U19 |
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

### Table: `schools`
```
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
rq_updated_at       timestamptz       -- set when rq_status transitions to "Completed"
videos_sent         boolean           -- legacy; prefer last_video_url IS NOT NULL
last_video_url      text              -- most recent YouTube URL Finn sent to this school
last_video_title    text              -- fetched via YouTube oEmbed
last_video_sent_at  timestamptz       -- sent_at of the contact_log row containing the URL
rq_link             text              -- URL to school's RQ page on their recruiting platform
notes               text
created_at          timestamptz
updated_at          timestamptz
```

### Table: `action_items`
```
id            uuid PK
school_id     uuid FK → schools.id (cascade delete)
action        text
owner         'Finn' | 'Randy' | null
due_date      date
sort_order    integer       -- persistent manual priority order
completed_at  timestamptz   -- NULL = active, NOT NULL = completed (migration 027)
selected_for_today_at timestamptz  -- locks item into Today's top 3 for this day
created_at    timestamptz
```

**Phase 2a note:** As of migration 024b, action_items contains only genuine one-offs.
The 40 wingback + 38 RQ recurring outreach tasks were migrated into the campaigns
system (campaign_schools rows). 4 protected one-offs remain:
- `debcecec-b39a-4a70-b0f0-bc055734c5e3` — Check for new HC (Mines)
- `47b69e2e-2e01-43bf-b4f7-f9d2f3b2490d` — Reply to "Let's connect in May" (MSOE)
- `938b5a13-aa2c-4faa-bbc9-d114f9031050` — MLS NEXT Fest follow-up (Case Western)
- `46cbae05-aeb6-409e-b987-9de1af0e1d74` — Update RQ May 29 (Mines, distinct from batch)

### Table: `contact_log`
```
id                uuid PK
school_id         uuid FK → schools.id (cascade delete)
coach_id          uuid FK → coaches.id (on delete set null)
date              date              -- calendar day (deprecated for ordering — use sent_at)
sent_at           timestamptz NOT NULL  -- actual or approximate send time (migration 026)
channel           'Email' | 'Phone' | 'In Person' | 'Text' | 'Sports Recruits' | 'Other'
direction         'Outbound' | 'Inbound'
coach_name        text          -- raw sender display name (from Gmail parse)
summary           text
gmail_message_id  text          -- non-null = ingested from Gmail
parse_status      'full' | 'partial' | 'non_coach' | 'orphan'
                  -- full: school+coach resolved; partial: school known, coach unknown (review queue)
                  -- non_coach: user-marked (sender is admin/bot/recruiter)
                  -- orphan: school unknown
parse_notes       text
handled_at        timestamptz       -- "Done" from Today; hides from Today, transparent on school detail
selected_for_today_at timestamptz  -- locks item into Today's top 3 for this Mountain-time day
created_by        uuid FK → auth.users.id
created_at        timestamptz
```

**Today visibility for inbounds** is gated by ALL of: tier IN (A,B,C), channel IN (Email,
Sports Recruits), handled_at IS NULL, dismissed_at IS NULL, snoozed_until <= NOW() or NULL,
classified_at IS NULL or (authored_by IN (coach_personal, coach_via_platform) AND intent IN
(requires_reply, requires_action)), window <= 180 days.

**Channel value mapping (campaigns send flow):** The campaign draft review modal accepts
wire values `'gmail'` and `'sr'` from the client, but writes the canonical DB values
`'Email'` and `'Sports Recruits'` respectively. Conversion happens in
`/api/campaigns/[id]/schools/[schoolId]/route.ts` at the mark_sent action handler.
This matches the existing convention used by gmail-sync, sendgrid webhook, bulk-import,
and ContactLogPanel — all of which write `'Email'` and `'Sports Recruits'` directly.
No rows in the DB use `'gmail'` or `'sr'` — those are display/wire-only values.

### Table: `campaign_templates` (added in migration 024)
```
id          uuid PK
name        text
body        text                    -- Mustache-style placeholders
created_at  timestamptz
updated_at  timestamptz
```

Supported placeholders: `{{coach_last_name}}`, `{{coach_first_name}}`, `{{school_name}}`,
`{{coach_role}}`. Templates are first-class objects; one template can back multiple
campaigns in later phases (in 2a, each campaign has its own template).

### Table: `campaigns` (added in migration 024)
```
id             uuid PK
name           text
template_id    uuid FK → campaign_templates.id
status         'draft' | 'active' | 'paused' | 'completed'
tier_scope     text[]                  -- default ['A','B'], advisory only
throttle_days  int                     -- default 7, NOT enforced in 2a
created_at     timestamptz
activated_at   timestamptz
completed_at   timestamptz
```

`tier_scope` pre-populates the school checklist when creating a new campaign; Finn can
add C-tier schools manually via the "+ Add school" action on the detail view.
`throttle_days` is stored for Phase 2b; no code reads it in 2a.

### Table: `campaign_schools` (added in migration 024)
```
id              uuid PK
campaign_id     uuid FK → campaigns.id (cascade delete)
school_id       uuid FK → schools.id
coach_id        uuid FK → coaches.id (nullable)
status          'pending' | 'sent' | 'dismissed' | 'bounced'
sent_at         timestamptz
contact_log_id  uuid FK → contact_log.id (set when status='sent')
dismissed_at    timestamptz
created_at      timestamptz
unique (campaign_id, school_id)
```

`coach_id` is the recommended primary recipient at draft time; updated to current primary
coach when Finn opens the draft review modal. `dismiss` removes from THIS campaign only —
the school remains eligible for future campaigns. Sent rows are terminal in 2a (no un-send).

### Table: `assets`
```
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
```

### Table: `questions`
```
id          uuid PK
question    text
rationale   text
category    'formation' | 'roster' | 'development' | 'culture' | 'aid'
is_custom   boolean                         -- true = user-added, false = seeded default
sort_order  integer
created_at  timestamptz
updated_at  timestamptz
```

### Table: `school_question_overrides`
```
id           uuid PK
school_id    uuid FK → schools.id (cascade delete)
question_id  uuid FK → questions.id (cascade delete)
status       'priority' | 'answered' | 'skip'
context_note text                           -- what we know, or why it's priority
created_at   timestamptz
updated_at   timestamptz
-- unique constraint on (school_id, question_id)
```

### Table: `school_specific_questions`
```
id            uuid PK
school_id     uuid FK → schools.id (cascade delete)
question_text text
rationale     text
category      'formation' | 'roster' | 'development' | 'culture' | 'aid'
created_at    timestamptz
updated_at    timestamptz
```

### Table: `coaches`
```
id           uuid PK
school_id    uuid FK → schools.id (cascade delete)
name         text
role         text                   -- 'Head Coach' | 'Assistant Coach' | 'Associate Head Coach' | 'Other' | etc.
email        text
is_primary   boolean                -- true = designated contact for this school
is_active    boolean not null default true
                                    -- false = departed coach, soft-deleted via apply of coach_departed proposal
needs_review boolean                -- true = flagged for human review (coach_departed applies this)
sort_order   integer
notes        text                   -- used for endowed chair titles, misc
source       text not null          -- 'manual' (default) | 'scraped' (roster scraper) | 'from_gmail' (Gmail partials UI)
created_at   timestamptz
updated_at   timestamptz
```

**is_active filtering convention:** Read surfaces (school detail, campaign selectors, scraper diff,
UI pickers) filter is_active=true. Write surfaces (ingestion paths from Gmail, SendGrid, SR webhook,
bulk import) do NOT filter — historical inbound emails to departed coaches must still resolve to
their original coach record to keep contact_log linkage intact.

### Table: `coach_changes`
```
id            uuid PK
school_id     uuid FK → schools.id (cascade delete)
change_type   'coach_added' | 'coach_departed' | 'email_added' | 'email_changed' | 'role_changed' | 'name_changed'
coach_id      uuid FK → coaches.id (on delete set null)
details       jsonb    -- shape varies by change_type; see migration 020 for per-type docs
status        'auto' | 'manual' | 'seed' | 'applied' | 'rejected'
created_at    timestamptz
reviewed_at   timestamptz
reviewer_note text
```

### Table: `player_profile` (singleton — migration 025)
```
id                    uuid PK
current_stats         text
upcoming_schedule     text
highlights            text
academic_summary      text
last_parsed_at        timestamptz
source_asset_id       uuid FK → assets.id
current_reel_url      text              -- canonical "current reel" URL
current_reel_title    text              -- fetched via YouTube oEmbed
current_reel_updated_at timestamptz     -- when current reel was set
created_at            timestamptz
updated_at            timestamptz
```

Singleton enforced via partial unique index on `((true))`. Player profile is parsed from
Finn's Soccer Resume by `src/lib/asset-parsers.ts` on upload. Current reel fields are
managed via manual SQL for v1 (asset library UI for reel management is future work).

### Table: `strategic_skips` (migration 032)
```
id          uuid PK
prompt_key  text NOT NULL         -- e.g. 'reel_coverage', 'rq_refresh'
week_start  date NOT NULL         -- Sunday date in Mountain time
created_at  timestamptz default now()
```

Index: `(week_start, prompt_key)`. RLS enabled. Persists weekly "skip this week" actions
for strategic prompts. Resets implicitly when week_start advances to next Sunday.

### Table: `batch_reel_sends` (migration 033)
```
id          uuid PK
school_id   uuid NOT NULL FK → schools.id (cascade delete)
reel_url    text NOT NULL
sent_via    text NOT NULL         -- 'Email' | 'Sports Recruits' | 'Skipped'
sent_at     timestamptz NOT NULL default now()
created_at  timestamptz default now()
```

Indexes: `(school_id, sent_at desc)`, `(reel_url)`. RLS enabled. Persists BatchReelModal
flow state. Distinct from contact_log — contact_log only receives entries from actual email
ingest. batch_reel_sends records Finn's intent during batch sends, including SR-sent cases
that won't appear in contact_log until SR ingest captures the email.
State derivation: most recent row per school_id by sent_at DESC wins.

### Scraper columns on `schools`
```
coach_page_url              text      -- URL of school's official men's soccer coaches page
coach_page_last_scraped_at  timestamptz
coach_page_last_error       text
coach_page_scrape_enabled   boolean not null default true
                            -- false = SPA/JS-rendered page; scraper skips but URL preserved
                            -- currently false: Notre Dame (und.com is a React SPA)
```

**SPA schools — how to handle a new one:**
1. Write the URL to `schools.coach_page_url` for human reference.
2. Set `coach_page_scrape_enabled = false`.
3. Manually insert the coaching staff into `coaches` (all emails null if unknown).
4. Log in CLAUDE_CONTEXT "Known SPA schools" list.

### RLS
All tables have RLS enabled. Any authenticated user gets full access.
Use the **service role key** in scripts/server-side code to bypass RLS.
Use the **anon key** in the frontend (Next.js client components).
---

## 5. Email Subject Line Format

```
Finn Almond | Left Wingback | Class of 2027 | [School Name]
```

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
  - `src/lib/types.ts` — TypeScript types (School, ContactLogEntry, ActionItem, Campaign, CampaignSchool, etc.)
  - `src/lib/supabase.ts` — Supabase client initialization
  - `supabase/migrations/` — schema migrations (numbered, applied via Supabase dashboard)
  - `supabase/scripts/` — data migrations and one-shot scripts (committed)
  - `supabase/scratch/` — investigation queries (gitignored)
  - `scripts/generate-claude-context.ts` — this script
- **Deployment**: Vercel Pro tier (upgraded May 5, 2026): unlocks minute-granular crons, 60s default function timeout (configurable to 300s), better cold start performance. gmail-sync now runs every 15 minutes (was daily on Hobby tier).

**SQL execution convention:** All psql commands run as `psql -f <path>` against files
on disk. No inline `-c "..."` SQL — that pattern triggers Claude Code's brace-quote
approval warnings on JSON-shaped strings. Schema migrations are pasted into the Supabase
dashboard SQL editor (Randy runs them); investigation queries can run via TS scripts
over the Supabase JS client (read-only).

---

## 9. Known Gaps and Limitations

### Coach Roster Scraper
- **SPA schools** (JS-rendered, static fetch fails): currently only **Notre Dame** (`und.com`).
  These have `coach_page_scrape_enabled = false` — scraper skips them, URL is preserved.
  Staff must be seeded manually; updates require manual checking.
- **Email ambiguity**: If a school uses a shared team inbox (e.g., `mensoccer@calpoly.edu`),
  the scraper suppresses it (shared email detection). Coaches at that school will have null email.
- **Shared domains**: Some schools share CDN-hosted sites — rate limiting (2s delay) mitigates this.
- **Gmail partial re-linking**: Handled by `reparsePartialsForSchool()` in `src/lib/gmail-resolve.ts`.
  Fires automatically after every coach_added event (coach-changes review) and after create-and-link
  in the Gmail partials UI. Backfill script: `scripts/backfill-reparse-partials.ts`.
  Initial backfill (2026-04-23): 17 partials checked, 4 rescued (Caltech x3, Colgate x1). 13 remain.

### Gmail Partials — Part 5b (migration 022, shipped 2026-04-23)

**Scope filter (architectural note):**
`/settings/gmail-partials` and `scripts/backfill-reparse-partials.ts` filter on
`gmail_message_id IS NOT NULL`. This intentionally scopes the review UI to Gmail-sourced partials,
where rescue means matching a sender name to a coach record. Non-Gmail partials (Sports Recruits
webhook, bulk importer) are excluded — they require a different resolution strategy
(name-matching against a different signal set, not email-matching). Do not remove this filter
without also building SR/bulk resolution logic, or the UI will surface rows it cannot resolve.

**SR/bulk partials gap (technical debt, ~123 rows as of backfill):**
Sports Recruits and bulk-importer partials have `school_id` set but no `coach_id` and no
`gmail_message_id`, so they have no resolution path through the current UI. They are mostly
historical rows from pre-scraper imports — not a growing problem. Future options:
- Separate SR-partials review UI (mirrors gmail-partials but matches on `coach_name` string)
- Bulk name-matching pass against `coaches.name`, similar to `reparse-orphan-domains.ts`
- Enrich SR webhook payloads with stronger coach identifiers before the row hits `contact_log`
Not urgent. Revisit if the queue grows or if a name-matching pass is built for another reason.

**coaches.source column — current state and expected evolution:**
Immediately after migration 022, all 236 existing coaches have `source='manual'` (the column
default). No retroactive backfill of `'scraped'` was performed — distinguishing scraper-inserted
coaches from manually-seeded ones via `coach_changes` history was ambiguous. Going forward:
- Scraper apply path writes `source='scraped'`
- Create-and-link in `/settings/gmail-partials` writes `source='from_gmail'`
- Manual inserts (seed scripts, direct SQL) default to `'manual'`
The column becomes a useful diagnostic over time. After several months of operation,
`select source, count(*) from coaches group by source` will show where coaches enter the system.
Not actionable in the short term.

**Backfill math (for audit / future verification):**
- Pre-deploy: 140 partial + 96 full
- Backfill scope: 17 Gmail partials (`gmail_message_id IS NOT NULL`)
- Rescued: 4 (Caltech x3 — Rockne DeCoster; Colgate x1 — "Rick Brown" matched "Ricky Brown")
- Post-backfill: 136 partial + 100 full
- Gmail partials resolved via review UI: 1 (see forwarded-message bug below)
- Gmail partials remaining: 0
- Non-Gmail partials (out of scope): 123

**Forwarded-message parser bug (known, not fixed in parser — 2026-04-23):**
When Randy forwards an inbound coach email to himself/Finn, the Gmail sync ingests it as a
separate message. The outer `From` is Randy → `direction=Outbound`. If the original subject
contains a school name that collides with another school (e.g. "MIT Camp Attendee" in a Colgate
email), the subject-based school match fires first and wins over the domain match, because the
domain match is skipped when outer From = Randy's address.

Concrete case: `contact_log fd453e74` — Randy forwarded Rick Brown's Colgate reply. Subject
"Re: MIT Camp Attendee | 2027 Striker | Finn Almond" → parser matched MIT (low confidence).
Outer From=Randy → Outbound. Manual fix applied 2026-04-23: school_id=Colgate, direction=Inbound,
parse_status=non_coach (the actual Colgate/Rick Brown contact already exists in row 628d6317 as
status=full; marking the forwarded copy non_coach avoids duplication).

Parser fix needed: detect "Forwarded message" in raw_source, extract inner `From:` header domain
for school matching, and classify direction as Inbound (since the forwarded content is an inbound
reply). Do not remove the forwarded-message detection logic currently in place — it just needs
to act on the inner headers, not the outer.

**SendGrid webhook parse_status vocabulary fix (2026-04-24):**
The SendGrid inbound webhook previously wrote `parse_status='partial'` for non-recruiting inbound
(non-SR emails) and for SR notifications where no school could be matched — both cases where
`school_id IS NULL`. This violated Phase 5b vocabulary (`partial` = school known, coach unknown;
`orphan` = school unknown). 21 historical rows were relabeled to `'orphan'` on 2026-04-24; the
source-level fix was applied in the same session. Going forward:
- Non-SR notifications → `'orphan'` (school_id=null, no classification hook)
- SR notifications with no school match → `'orphan'` (school_id=null, no classification hook)
- Outbound CC fallback (parseSRPaste fails) → `'orphan'` (school_id=null)
- Classification (Haiku) only fires when `school_id IS NOT NULL` in both the live hooks and backfill

### Inbound Classification — Phase 1 (migration 023, shipped 2026-04-23)

**Two-axis model:** Every inbound `contact_log` row gets classified on two independent axes:
- `authored_by`: `coach_personal` | `coach_via_platform` | `team_automated` | `staff_non_coach` | `unknown`
- `intent`: `requires_reply` | `requires_action` | `informational` | `acknowledgement` | `decline` | `unknown`

**Classifier:** `src/lib/classify-inbound.ts` — Claude Haiku (`claude-haiku-4-5-20251001`), fire-and-forget.
- Exports `classifyInbound(input)` and `classifyAndUpdate(admin, rowId, input)`
- Truncates body to 2000 chars for cost control (2000 captures signature blocks with coach title/role)
- Fallback: `{unknown, unknown, low, "classifier parse error..."}` on any failure
- Never throws — all errors are logged and swallowed
- Prompt updated 2026-04-24: stricter confidence rubric + Example 7 (recruiting-template pattern).
  Rule: when email has both a pleasantry ("keep us updated") AND concrete action links (forms, camps),
  classify as `requires_action` — concrete asks take priority over conversational framing.

**Live hooks:** Both `/api/cron/gmail-sync` and `/api/webhooks/sendgrid-inbound` fire `classifyAndUpdate`
as a dynamic import after every successful Inbound insert. Uses `dynamic import().then().catch()` so
classification never blocks or breaks the insert path.

**Backfill:** `scripts/backfill-inbound-classification.ts` — supports `--dry-run` and `--reclassify-all`.
Rate-limited to 5 calls/sec (200ms delay). Cost ~$0.00085/row (Haiku pricing).

**Review UI:** `/settings/classification-review` — shows all low-confidence classified inbound rows.
Groups by school. Per-card: authored_by + intent chips, Haiku notes, snippet with expand, override dropdowns,
"Save override" (sets confidence=high, removes from queue) and "Mark unknown" buttons.
Low-confidence count badge appears in sidebar nav ("Email Review" link).

**Today visibility gates (as of Phase 2b — 2026-04-29):**

An inbound contact_log row appears in Today's tactical zone when ALL of:
1. Tier: school.category IN (A, B, C) — Nope excluded via `isTargetTier()`
2. Channel: Email or Sports Recruits — phone/text/in-person don't trigger reply expectations
3. Classification: `authored_by IN (coach_personal, coach_via_platform)` AND
   `intent IN (requires_reply, requires_action)`. Unclassified rows (classified_at IS NULL)
   included conservatively.
4. Thread state: no outbound with later sent_at for the same school (via `isAwaitingReply()`)
5. Not handled (`handled_at IS NULL`), not dismissed (`dismissed_at IS NULL`), not snoozed
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

**Tier selector:** School detail page (`SchoolDetailClient.tsx`) now shows a dropdown to change
`schools.category` (A/B/C/Nope) inline. Uses existing `useSchools().updateSchool()` — no new API endpoint.
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
  Status = `completed`.
- **RQ campaign (spring 2026):** Retired — status = `completed`, zero sends made. The RQ
  "campaign" was not actually a messaging campaign; it was a personal checklist for updating
  Finn's position in each school's recruiting questionnaire. The data migration (024b) grouped
  it with wingback because both originated as recurring action_items, but RQ was a task list
  that Finn worked through directly outside the campaigns system. When the template builder hit
  "insufficient historical sends to synthesize from," that was the system signaling "this isn't
  a campaign" — the signal was missed at migration time.

**Schema (migration 024):** Three new tables — `campaign_templates`, `campaigns`,
`campaign_schools` — see Section 4 for column definitions. RLS pattern matches action_items
(authenticated users full access). Realtime publication enabled on all three tables for
reactive UI updates.

**Data migration (024b):** Migrated 40 wingback + 38 RQ recurring outreach tasks from
action_items into campaign_schools rows. 4 protected one-offs preserved in action_items
(IDs documented in Section 4 under action_items).

Reconciliation results:
- **Wingback campaign — April 2026:** 40 schools total, 20 status='sent' (matched to
  contact_log rows from prior outreach, 60-day window with `summary ilike '%wingback%'`),
  20 status='pending'. Status remains 'draft' — Finn will review template before activating.
- **RQ campaign — spring 2026:** 38 schools total, all status='pending'. No matching
  contact_log entries found (RQ outreach hasn't started yet — these were planned, not sent).
  Template body is a TODO PLACEHOLDER — Finn must author the body text before activating.

**UI (Milestones 1 through 3.5):**

Routes:
- `/campaigns` — list view with name, status, pending/sent/dimsd counts, created date
- `/campaigns/new` — 3-step wizard (name + template, school checklist, throttle)
- `/campaigns/[id]` — detail view with header, template section (read-only with edit),
  schools table grouped by status, status transition buttons, "+ Add school" action
- Draft review modal (opens from "Draft →" button on a pending row)

Send flow: copy-paste model only — no actual sending. Finn copies the rendered body to
clipboard, sends via his Gmail or SR account manually, then clicks "Mark as sent via
Gmail" or "Mark as sent via SR" in the modal. Modal creates a contact_log row with
`channel='Email'` (Gmail) or `'Sports Recruits'` (SR), `direction='Outbound'`, summary =
first 140 chars of rendered body (falls back to campaign name if body is empty).

**Channel recommendation logic:** The Channel column in the Pending section reads the
school's most recent inbound's `authored_by`. `coach_personal` → recommend Gmail.
`coach_via_platform` → recommend SR. `team_automated`, `staff_non_coach`, `unknown`,
or no inbound → no recommendation, displayed as "—".

**Add School action (Milestone 2.5):** Schools can be added to a campaign after creation
via a search modal on the detail view. Default list shows only schools matching
`campaigns.tier_scope` (A+B); "All tiers" toggle includes C-tier. Schools already in the
campaign (regardless of status — pending, sent, or dismissed) are excluded from the list.
Dismissed schools are restored via the Dismissed section, not re-added.

**Personalize with AI (Milestone 3.5):** Button in the draft review modal calls Anthropic
API (Haiku 4.5) to fill in the template's bracketed placeholders (`[Finn: add school-
specific note...]`, `[Finn: add current stats...]`) using:
- School context (name, tier, division, conference, location, notes)
- Coach context (name, role)
- Recent inbound history (last 2-3 inbound contact_log rows for this school, with
  authored_by + summary + date)
- Finn's player profile (Section 2 of this file)

System prompt explicitly instructs:
- Avoid quoting or paraphrasing the coach's prior message back at them (mirror-y
  responses are off-putting)
- Stats hallucination guard: the `[Finn: add current stats, highlights, or recent
  results]` bracket is replaced with `[TODO: stats]` rather than filled, since the
  system has no durable stats source. Finn fills this manually.
- Other brackets that can't be confidently filled get `[TODO: <description>]`.

Streaming token-by-token into the textarea. Send/dismiss buttons disabled during stream.
Generated content is editable — Finn always reviews before clicking Mark as sent.
Per-school edits do NOT modify the campaign template.

### Phase 2a Tech Debt and Open Questions

**Cross-campaign throttle enforcement (deferred to Phase 2b):**
`campaigns.throttle_days` column exists (default 7) but no code reads it in 2a. In 2b,
the system should prevent a school from receiving a campaign send if it received any
campaign send within the last `throttle_days` days, regardless of which campaign.

**Reply linking (deferred to Phase 2b):**
When a coach replies to a campaign email, the inbound contact_log row should link back
to the originating `campaign_schools` row (primary match by Gmail thread_id, fallback by
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
When `campaign_schools.coach_id` points to a coach with `needs_review=true`, the AI
personalization prompt receives the coach name without any warning. Example: Cornell's
John Smith (HC, `needs_review=true`) — the AI confidently addresses "Coach Smith" without
hedging. Phase 2b should pass `needs_review` into the prompt context and instruct the AI
to use a generic salutation ("Coach," or "Coaching Staff,") when the flag is set.

**SR notification school-name aliases incomplete (identified 2026-04-27):**
SR's outbound CC notifications use full school names ("University of Michigan") while the
`schools` table uses shorter names ("U Michigan" / short_name "Michigan"). When the SR parser
can't match the long form, the row becomes `parse_status='partial'` with `school_id=null`,
and the campaign linker silently skips it (no school_id = no link attempt). Michigan example
(2026-04-27): contact_log row `61f5ceb6` created as partial+orphan, `campaign_schools` left
with "Pending capture", required manual rescue.

Mitigation pattern: when this happens, add the long-form name as an alias to the affected
school's `aliases` column, then manually rescue the contact_log row + link the campaign_schools
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
- Migration 026: `sent_at` timestamptz NOT NULL on contact_log. Backfill of 289 rows.
  Shared `resolveSentAt()` helper. All four ingestion paths write sent_at from email Date
  headers. Timeline sorts by sent_at. Staleness calculation uses sent_at. Fixed Stevens
  Apr 22 inbound/outbound ordering bug.

**Group B — Capabilities:**
- Migration 027: action_items `completed_at`. Non-destructive completion, "+ Add action item"
  inline form, "Recently completed" section (last 5 per school).
- Manual contact log entry: inline form on school detail conversation section. Direction,
  channel (Phone/Text/In Person/Email/Other), coach dropdown, date, time, summary. Edit and
  delete for source='manual' rows. Timezone-correct sent_at via Mountain offset calculation.
- Migration 028: `rq_updated_at`, `last_video_url`, `last_video_title`, `last_video_sent_at`
  on schools. Video backfill: 44 schools populated via YouTube oEmbed.
- Migration 029: rq_status enum cleanup (collapsed legacy values).
- Right-rail polish: all About panel fields editable inline — notes (textarea), RQ status
  (dropdown with rq_updated_at), Tier (dropdown A/B/C/Nope), Admit (dropdown with null
  option), video display (hyperlinked title + sent date). School detail is now fully
  two-way: every field is viewable and editable without leaving the page.

### Phase 3a — Today Tactical Zone (shipped 2026-04-30)

**Foundation:**
- Shared `src/lib/awaiting-reply.ts` with `isAwaitingReply()` and `isTargetTier()` — single
  source of truth for reply detection, used by both signals.ts and todayLogic.ts
- Tier filter: Nope excluded from all awaiting/cold signals
- Channel filter: only Email and Sports Recruits trigger reply expectations
- sent_at comparisons replace date column for timezone-correct same-day detection
- Intent whitelist expanded: requires_reply AND requires_action both surface in Today
  (classifier doesn't reliably distinguish between them)

**Tactical scoring (`src/lib/today-scoring.ts`):**
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

**Four hardcoded prompts (`src/lib/strategic-prompts.ts`):**
- `reel_coverage`: A/B schools where `last_video_url != current_reel_url` and no
  `batch_reel_sends` row for the current reel. Score: count/total.
- `rq_refresh`: A/B schools where rq_status != Completed OR rq_updated_at IS NULL OR
  rq_updated_at < 60 days ago. Score: count/total.
- `stale_tier_a`: Tier A schools with no outbound in 30+ days, excluding schools in
  tactical selection. Score: min(count/8, 1.0) * 1.5.
- `pipeline_shape`: surfaces when Tier A < 8 OR Tier B < 6. Score: 1.0 (A<8) or 0.5 (B<6).

**Scoring and visibility:**
- Top 3 by relevanceScore. Weekly cadence (Sunday 00:00 MT week boundary).
- Visibility: !skippedThisWeek AND count > 0 AND relevanceScore > 0.
- Gap-focused summaries ("X of Y need attention"), no success-state UI.
- Server-side weekly skips via `strategic_skips` table.
- `getCurrentWeekStart()` uses Intl.DateTimeFormat for timezone-safe Sunday calculation.

**StrategicPrompt architecture:**
- `affectedSchoolIds`: schools still needing the action (drives prompt card count)
- `allTargetSchoolIds`: full target set including already-done (drives batch flow modal)

**BatchReelModal (reel_coverage action):**
- Lists all target A/B schools with state from `batch_reel_sends` (pending/sent/skipped)
- Click any pending/skipped school to draft (any order — not forced sequential)
- DraftModal opens with TaskContext `{type: 'send_reel', metadata: {reelUrl, reelTitle}}`
  → reel-focused topic suggestions and draft generation
- Sent = terminal (locked, checkmark). Skipped = re-clickable (revisit pattern).
- Close-without-send: reverts to pre-draft state, no DB write.
- State persists via `batch_reel_sends` table. Mount-time: most recent row per school wins.
- Email path: writes `sent_via='Email'`. SR path: writes `sent_via='Sports Recruits'`.

**School detail RQ enhancements:**
- `rq_link` inline editable (pencil-on-hover pattern)
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

Architectural decision: soft-delete via is_active flag, not hard delete. Preserves contact_log FK references and the recruiting history they encode. To re-activate a coach (rare — handle via SQL): `update coaches set is_active=true where id='...';`

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

Markdown fence stripping handles both ```json and ``` prefixes plus trailing reasoning text after the array. First version of the parser failed on every Haiku response; the fix added trim + slice(0, lastIndexOf(']')+1) logic to handle text-after-JSON cases.

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

Saturday cron at /api/cron/camp-discovery, runs all A/B/C tier active schools (~33). Tavily query format: `${school.name} men's soccer ID camp` (no year — extractor handles staleness). search_depth: 'advanced', max_results: 5, include_raw_content: true. Per-result extraction via Haiku 4.5.

Files: src/lib/tavily.ts (Tavily client), src/app/api/cron/camp-discovery/route.ts (Saturday 14:00 UTC = 8 AM MT), vercel.json schedule entry.

Belt-and-suspenders dedup: skip if camp_proposals exists with source_ref=`web:${url}` AND status='pending'.

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

The targeted-state deploy caused a production crash on any school detail page that rendered camps with the new 'targeted' value. Root cause: CAMP_STATUS_STYLE map in SchoolDetailClient.tsx had no entry for 'targeted', so `.bg` lookup returned undefined.

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

POST endpoint. Checks campaign_email_drafts cache first, generates if missing. Supports `regenerate: true` to force fresh generation (increments regeneration_count, updates regenerated_at, stores last_hint if provided).

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
```
id, title, type (update | question), notes, expires_at,
status (active | archived), created_at, updated_at
```

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
```
id, message_id (FK messages), school_id (FK schools),
contact_log_id (FK contact_log), detected_at,
detection_source (auto | manual), notes,
unique (message_id, school_id, contact_log_id)
```

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
```
id, school_id (unique), finn_notes text, suggestions jsonb,
suggestions_generated_at, suggestions_model_used,
created_at, updated_at
```

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
- one-time backfill SQL for last_contact: `UPDATE schools SET last_contact = (SELECT MAX(cl.date) FROM contact_log cl WHERE cl.school_id = schools.id AND cl.parse_status NOT IN ('orphan', 'non_coach'))`

### Production UX + Classifier Fixes (May 19, 2026 — pm)

Active recruiting use continued to surface real bugs. Six fixes shipped, all triggered by Finn's actual workflow:

**1. Case Western buttons broken — defensive coach fallback.**

Symptom: Draft email / Draft check-in / Prep for call buttons did nothing on Case Western detail page (no network call, no error). Both browsers same behavior.

Root cause: Case Western had two active coaches (Carter Poe head, Fernando Lisboa assistant) but neither marked is_primary=true. Handlers were doing early-return when primaryCoach was null — silent fail.

Fix: replaced `primaryCoach = coaches.find(c => c.is_primary)` with a fallback chain:
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

The school modal's red-X coach delete was doing a hard DELETE on coaches, which fails on FK constraints from contact_log.coach_id (ON DELETE SET NULL is set, but other FKs RESTRICT). The handler had `if (!error) { ... refresh }` which swallowed the failure: the row didn't delete, the UI refreshed anyway, and the coach appeared "gone" until the next page load brought them back.

Fix (migration 052): added archived_at timestamptz to coaches with index on (school_id, archived_at). Red-X replaced with neutral Archive button + inline confirmation. Active-coaches queries filter archived_at IS NULL; contact_log/prep_doc coach_id resolution doesn't filter so historical references remain intact. PATCH /api/coaches/{id}/archive and /unarchive endpoints with school-ownership auth.

Pattern: every Supabase mutation needs an explicit error-surfacing branch, not just an `if (!error)` happy path. FK violations are invisible if you only check the truthy side of the error object.

**3. Prep-for-call docx → PDF migration (the long arc).**

Motivation: Finn doesn't have MS Word and docx renders unreliably in Apple Pages. Full replacement, no docx fallback in the generation path (existing .docx docs still readable via the unchanged download route).

Attempt 1 — @react-pdf/renderer with JSX (call-prep-pdf.tsx, 5 LETTER pages, Helvetica built-in, nested `<Text>` for split-runs). Failed on Vercel with React error #31 ("Objects are not valid as a React child, found: object with keys {$$typeof, type, key, ref, props}") thrown from inside the @react-pdf reconciler (Wt/Bn/wr/wl/Sl/bl/Ge in reconciler-23.js). Local `npx tsx scripts/test-pdf-render.ts` with real Colby data PASSED, ruling out the source code. A minimal test endpoint with just `<Document><Page><Text>Hello</Text></Page></Document>` ALSO failed on Vercel with the identical error — confirming @react-pdf is fundamentally incompatible with Next.js 16's bundler, not a code-level bug we could fix.

Attempt 2 — pdfmake (declarative JSON doc definition, no React reconciler). Local generation produced valid 12-page PDFs. Deployed and hit ENOENT for /ROOT/node_modules/pdfkit/js/data/Helvetica-Bold.afm — pdfkit hardcodes `__dirname + '/data/Helvetica-Bold.afm'` and __dirname after Next.js's file tracing doesn't match where the .afm files end up (foliojs/pdfkit issue #1549).

First fix attempt: outputFileTracingIncludes in next.config. Initial attempt used the wrong route key ('/api/prep-for-call/generate/route' with /route suffix per my own bad guidance) — silent no-op. App Router keys use URL path WITHOUT /route. Corrected to '/api/prep-for-call/generate' + '/api/**/*' fallback glob. File trace verified locally, but Vercel runtime still failed with the same ENOENT — because pdfkit's __dirname resolution doesn't survive bundling regardless of what files are traced.

Final fix: bundle @fontsource/arimo TTFs (Arimo-Regular, Arimo-Bold, Arimo-Italic, Arimo-BoldItalic) into ./fonts/. Use pdfmake's PdfPrinter (not the default front door) with explicit font definitions, keyed as 'Helvetica' but pointing to Arimo TTFs via path.join(process.cwd(), 'fonts', ...). outputFileTracingIncludes includes './fonts/**/*'. This bypasses pdfkit's standard-font path entirely — pdfmake never looks for the .afm files because we never ask for the standard fonts.

Result: 13-page Colby PDF generates successfully in production. Helvetica throughout (rendered from Arimo TTFs, visually identical for practical purposes), heading hierarchy preserved, split-run question labels render inline, why-it-matters bold-italic label + italic body, page breaks at Part 1/2/3/4, POST-CALL section with horizontal rule.

**4. LLM JSON output parsing robustness.**

Even after the PDF rendering worked, generation failed at "Research iteration 6" with "Unexpected non-whitespace character after JSON at position 2183". JSON.parse in call-prep-research.ts line 258 was choking on Claude's structured response.

Root cause: the model occasionally returns JSON wrapped in markdown fences mid-string (not just at the boundaries), or with brief commentary text alongside the JSON. The previous parser used anchored regexes (^/$) that only matched fences at the absolute start/end of the string, and a greedy `\{[\s\S]*\}` fallback that over-matched when commentary contained braces (function bodies in code examples, set notation in math, etc.).

Fix: non-anchored fence stripping (/```json\s*/gi + /```\s*/g) plus balanced-brace extraction with explicit string-boundary tracking — track `inString` flag, handle escape sequences so an escaped quote inside a string doesn't flip the flag, only count braces when not inside a string. Surfaces the actual JSON object regardless of where it sits in the response.

**5. Deploy/git discipline crisis.**

Mid-debug discovery: `git status` revealed the entire call_prep_docs feature had been uncommitted for a week. The last commit (May 28, camps/schools/pipeline) was itself local-only — 1 commit ahead of origin/main. All today's work plus the prior week's work was untracked.

Root cause: parallel deploy paths created an illusion. `vercel --prod` CLI deploys ship the working tree directly (including untracked files) but label the resulting deploy with the LOCAL HEAD SHA in the dashboard. So the dashboard showed "deployed: SHA abc123" matching local HEAD, while the actual content was working-tree state including untracked files. When CC subsequently pushed actual git commits, auto-deploy from main built from committed state only, effectively reverting working-tree-only state from prod.

Resolution: backup branch backup-todays-work-2026-06-04 created at HEAD before any cleanup. Single catch-up commit consolidated the week's work. CLAUDE.md updated with Deployment & Git Discipline section enforcing: (a) no Vercel CLI use, all deploys via git push + auto-deploy; (b) `git status` required before every `git add` and after every `git commit`, with the status output being the proof of "committed and pushed" rather than the verbal claim.

**Architectural patterns reinforced today:**

1. *RLS-enabled-with-no-policy is silent deny-all.* Fingerprint: 200 status + empty array + error: null. Service-role verification (SQL editor, admin client) proves nothing because it bypasses RLS. When a SELECT returns no rows but the query looks right, check pg_policies for the table BEFORE re-checking the query.

2. *FK constraints + `if (!error)` swallow pattern equals silent UI failure.* Every Supabase mutation needs an explicit error-surfacing branch. Refreshing on the implicit truthy side hides RESTRICT violations and similar constraint errors.

3. *@react-pdf/renderer is fundamentally incompatible with Next.js 16's bundler.* A minimal test endpoint reproduces React error #31 from inside the reconciler. Don't reach for @react-pdf in this stack. pdfmake is the working alternative.

4. *pdfkit standard fonts don't survive Next.js file tracing.* pdfkit hardcodes `__dirname + '/data/*.afm'`, which breaks after bundling regardless of outputFileTracingIncludes config. Bundle custom TTF fonts and use pdfmake's PdfPrinter with explicit font defs — avoid the standard-font path entirely.

5. *Production behavior doesn't match source code → suspect the deployed bundle first.* When local execution succeeds and Vercel execution fails with environment-specific errors (React reconciler errors, ENOENT on bundled files, __dirname mismatches), the source code is rarely the problem. Build a minimal repro endpoint to isolate environment from code.

6. *Test fixtures with mock data don't prove anything about real-data code paths.* A test that passes with hand-written mock objects can completely miss a bug that fires on the actual data shape from production. When debugging a real-data failure, capture real prepData/payload from logs and use THAT in tests, not synthesized fixtures.

7. *LLM JSON output parsing must handle the messy edge cases.* Non-anchored fence stripping, balanced-brace extraction with string-boundary tracking. The model will sometimes wrap, sometimes commentate, sometimes both — the parser has to survive all of it.

8. *Vercel CLI deploys + uncommitted working tree = misleading SHAs and partial reverts.* The dashboard's "deployed: SHA xyz" can be a lie when the deploy was shipped from working-tree state but labeled with local HEAD. Establish git-only deploys as policy (see CLAUDE.md) and `git status` checks as the proof-of-commit ritual.

9. *Diagnostic-first beats theorize-first.* Multiple times today, hypothesized fixes failed because the theory didn't match the actual behavior. Adding instrumentation (console.log, minimal test endpoints, real-data capture) cut faster to the root cause than static analysis. When stalled, bisect.

---

## 10. Session Startup Checklist for Claude Code

1. Read `CLAUDE_CONTEXT.md` (this file)
2. Skim `src/lib/types.ts` to confirm current type definitions
3. Ask Randy: "Any pipeline changes or new coaching contacts since last session?"
4. Always match DB queries to exact column names in Section 4
5. Never hardcode school names, coach names, or emails — pull from DB
6. If touching the schools table, confirm whether the change should also update `updated_at`
   (the trigger handles this automatically on UPDATE)

---

## 11. Live Pipeline — Generated June 4, 2026

**Active schools: 23** | Overdue actions: 8
(Category Nope and status Inactive excluded)

### Tier A — Highest Priority (5 schools)

SCHOOL: Case Western
  Status: Ongoing Conversation
  Division: D3 — UAA
  Location: Cleveland, OH
  Admit Likelihood: Reach
  Coach: Carter Poe — Head Coach <ccp51@case.edu> [primary]
  Coach: Fernando Lisboa — Assistant Coach <fxm272@case.edu>
  Last Contact: 2026-05-27
  RQ Status: Completed
  Videos Sent: Yes
  Notes: In AZ
Complete Schedule Form
Filled out schedule form for MLS NEXT Fest
  Contact Log (3 shown):
    [2026-05-29] Inbound via Sports Recruits — Carter Poe:
      Finn,
      
      Thanks for the update, and congrats on the opportunity.  As far as things to see, I think the main things include mentality, work rate, and technical ability.
      
      Coach Poe
    [2026-05-27] Outbound via Sports Recruits — Carter Poe:
      Coach Poe,
      
      Thanks for the breakdown on how you use wingbacks, that was helpful. I see myself in the attacking profile, getting forward and being involved in the attack is the part of the role I've grown into most since the switch from striker.
      
      Unfortunately I can't make the Future 500 camp, but...
    [2026-05-21] Inbound via Sports Recruits — Carter Poe:
      Finn,
      
      Thanks for reaching out.  
      
      As far as how we use wingbacks, it depends on the quality of the player.  If they're more an attacking profile player, then we want them to join the attack and be very involved in that sense.  However, if they're less attacking or perhaps less athletic, then we ...

SCHOOL: CO School of Mines
  Status: Ongoing Conversation
  Division: D2 — RMAC
  Location: Golden, CO
  Admit Likelihood: Target
  Coach: Ben Fredrickson — Assistant Coach <ben.fredrickson@mines.edu> [primary] ⚠ needs_review
  Last Contact: 2026-02-20
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Yes, absolutely follow up — and the timing actually sets up well. Here's the reasoning:Why this rejection doesn't close the door:
It came from an assistant coach (Ben Fredrickson), not Mulholland, and was based on seeing Finn play as a striker at an ID camp.
The program is now in a coaching transition — a new head coach means a new recruiting board, new positional needs, and fresh eyes. The old rejection carries much less weight.
Finn is a different player now — left wingback at MLS NEXT Academy level, with an Olympico and stronger film than he had in February.
The play: Wait for the hire, then reach out to the new head coach directly.Don't reply to Fredrickson's rejection email, and don't reference the camp result. Start fresh with the new HC as if it's a first contact, because functionally it is. Frame it around the new position, current form, and genuine interest in Mines as an engineering school.

Signed up for Feb 7, 2026 ID Camp
Played meh and got rejection email
Did ID CAMP #1 - June 7-8, 2025
Emailed on 3/15 with update
Emailed about PHX on 2/12 (responded)
  Next Action: Check for new HC (Finn) — due 2026-04-29
  Also: Update RQ (Finn) — due 2026-05-29
  Also: Test Action Item (Finn) — due 2026-05-05
  Also: Test AI 2 (Randy) — due 2026-04-28
  Also: Check for new HC (Finn) — due 2026-05-06
  Contact Log (3 shown):
    [2026-02-20] Inbound via Email — Ben Fredrickson:
      Finn Almond,
      We hope this email finds you well.
      Thank you for joining us at our recent ID soccer camp on Feb 7th. We truly appreciate your time, energy, and effort you brought to the field. It was a pleasure getting to know you and watching you play.
      After careful consideration, we have decided t...
    [2026-01-07] Outbound via Sports Recruits — Greg Mulholland:
      Hi Coach,
      
       
      I hope everything is going well, I just wanted to let you know that I signed up for the ID camp in February.
      
       
      I've also attached both of my highlight videos below so you can see me a little bit more before the camp.
      
       
      Best,
      
      Finn Almond 
      
       
      Main Highlight Video
      
      MLS NEXT Highlight...
    [2025-12-29] Outbound via Sports Recruits — Greg Mulholland:
      Hi Coach,
      
      I wanted to follow up with you after MLS NEXT Fest.
      
      I’m a 2027 forward/winger with Albion SC Colorado MLS NEXT and played approximately 135 minutes across three matches at Fest. We went 1–2, including a 1–0 win and two competitive losses.
      
      I also made a MLS NEXT Fest specific highligh...

SCHOOL: Colby
  Status: Ongoing Conversation
  Division: D3 — NESCAC
  Location: Waterville, ME
  Admit Likelihood: Far Reach
  Coach: Sean Elvert — Head Coach <selvert@colby.edu>
  Coach: Ben Manoogian — Assistant Coach <bmanoogi@colby.edu> [primary]
  Coach: Yuri Nascimento — Other <ynascime@colby.edu>
  Coach: Karl Schroeder — Other ⚠ needs_review
  Last Contact: 2026-05-30
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Yes in Arizona
  Contact Log (3 shown):
    [2026-05-30] Outbound via Sports Recruits — Ben Manoogian:
      Hi Coach,
      
      Thanks for your perspective. I'll get back to you when I figure out which one works best.
      
      Thank you so much,
      
      Finn Almond
    [2026-05-28] Inbound via Sports Recruits — Ben Manoogian:
      Finn, 
      
      I wouldn't say one is better than the other, but rather different opportunities!  The Harvard camp will have around 10 other institutions taking in your play and more prospective players overall. The Colby camp will be a bit more personal with 3-4 other institutions hopefully in attendanc...
    [2026-05-27] Outbound via Sports Recruits — Ben Manoogian:
      Hi Coach,
      
      As I'm looking at schedules I think I could make the Harvard camp from July 12-13 or the Colby camp on August 9th. From your point of view is one better than the other?
      
      Best,
      
      Finn Almond

SCHOOL: Middlebury
  Status: Ongoing Conversation
  Division: D3 — NESCAC
  Location: Middlebury, VT
  Admit Likelihood: Far Reach
  Coach: Alex Elias — Head Coach <aelias@middlebury.edu>
  Coach: Tim Peng — Assistant Coach <tp@middlebury.edu> [primary]
  Coach: Ben Potter — Assistant Coach <bpotter@middlebury.edu>
  Coach: Leland Gazo — Assistant Coach <lagazo@middlebury.edu>
  Coach: Luke Madden — Assistant Coach
  Last Contact: 2026-05-19
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Personal Intro
ID Camp Info
  Contact Log (3 shown):
    [2026-05-30] Inbound via Sports Recruits — Tim Peng:
      Come to the August one mate
      
      Tim Peng
      Assistant Men’s Soccer Coach
      
      Middlebury College
    [2026-05-19] Outbound via Sports Recruits — Tim Peng; Alex Elias; Ben Potter:
      Coach Peng,
      
      A quick end-of-season update: we finished league play 9W-2L-3D and I started every game at left wingback with 3 goals and 2 assists. We qualified for MLS NEXT Cup but unfortunately we don't have the numbers to attend.
      
      I also wanted to pass along an updated SAT score: 1380 (690 Math ...
    [2026-04-20] Inbound via Sports Recruits — Tim Peng:
      That’s great to hear-
      
      Here’s the link as well https://www.middleburysoccercamps.com
      
      I think we will be a strong team in the fall
      
      Tim Peng Assistant Men’s Soccer Coach Middlebury College

SCHOOL: University of Rochester
  Status: Ongoing Conversation
  Division: D3 — UAA
  Location: Rochester, NY
  Admit Likelihood: Target
  Coach: Ben Cross — Head Coach <bc006j@sports.rochester.edu>
  Coach: Sean Streb — Assistant Coach <sstreb3@ur.rochester.edu> [primary]
  Coach: Andrew Crawford — Assistant Coach <acrawf10@sports.rochester.edu>
  Last Contact: 2026-05-19
  RQ Status: Completed
  Videos Sent: Yes
  Contact Log (3 shown):
    [2026-05-20] Outbound via Email — Sean Streb:
      Hey Coach,
      
      Thanks for the feedback, as I'm preparing for the camp I'll focus on those areas.
      
       
      
      One other question, as I'm getting flights I'm going to have time all day Friday and part of the day Sunday free. Is there anything you recommend I should do in the Rochester area?
      
       
      
      Best,
      
      Finn Al...
    [2026-05-19] Outbound via Sports Recruits — Sean Streb; Ben Cross; Andrew Crawford:
      Coach Streb,
      
      Thanks for the spring update — sounds like a strong finish against Buffalo State and Canisius.
      
      I registered for the June 20 ID camp and I am looking forward to getting on campus and meeting in person.
      
      A quick end-of-season update: we finished league play 9W-2L-3D, and I started at...
    [2026-05-19] Inbound via Sports Recruits — Sean Streb:
      Finn,
      
      Thanks for sending the updated highlight! I am also glad to hear you will be attending the June 20th clinic! For wingbacks, we like to see them fit to cover the line for extended periods of time, quick, technical to take players on in the final third,
       strong 1v1 defender, and they recogni...

### Tier B (9 schools)

SCHOOL: Bowdoin
  Status: Ongoing Conversation
  Division: D3 — NESCAC
  Location: Brunswick, ME
  Admit Likelihood: Far Reach
  Coach: Scott Wiercinski — Head Coach <swiercin@bowdoin.edu> [primary]
  Coach: Andrew Banadda — Assistant Coach <a.banadda@bowdoin.edu>
  Coach: Elayna Girardin — Assistant Coach
  Last Contact: 2026-05-20
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Coach Banadda will be in AZ
  Contact Log (3 shown):
    [2026-05-20] Outbound via Sports Recruits — Scott Wiercinski; Andrew Banadda:
      Coach Wiercinski,
      
      A quick end-of-season update: we finished league play 9W-2L-3D and I started every game at left wingback with 3 goals and 2 assists. We qualified for MLS NEXT Cup but unfortunately we don't have the numbers to attend.
      
      I also wanted to pass along an updated SAT score: 1380 (690...
    [2026-04-03] Inbound via Sports Recruits — Scott Wiercinski:
      Finn,
      
      Thank you for your interest in our Bowdoin Soccer program.  We are excited
      to learn more about you and watch you compete in the months
      ahead. Unfortunately, we are not able to attend your Scottsdale event due
      to commitments elsewhere.  We wish you the best of luck.
      
      We recently published o...
    [2026-04-02] Outbound via Sports Recruits — Scott Wiercinski:
      Coach Wiercinski,
      
      I wanted to follow up after connecting with your staff in Arizona — it was a good interaction and Bowdoin has stayed on my list.
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy. The NESCAC's combination of academic culture and competitive soccer ...

SCHOOL: Cal Poly San Luis Obispo (Cal Poly SLO)
  Status: Intro Sent
  Division: D1 — Big West
  Location: San Luis Obispo, CA
  Admit Likelihood: Reach
  Coach: Oige Kennedy — Head Coach <mensoccer@calpoly.edu>
  Coach: Zach Watson — Assistant Coach <zwatso01@calpoly.edu>
  Coach: Brandon Bautista — Assistant Coach <bbauti11@calpoly.edu> [primary]
  Last Contact: 2026-05-20
  RQ Status: Completed
  Videos Sent: Yes
  Contact Log (3 shown):
    [2026-05-20] Outbound via Email — Brandon Bautista:
      Coach Bautista,
      
      A quick end-of-season update: we finished league play 9W-2L-3D and I
      started every game at left wingback with 3 goals and 2 assists. We
      qualified for MLS NEXT Cup but unfortunately we don't have the numbers to
      attend.
      
      I also wanted to pass along an updated SAT score: 1380 (690 M...
    [2026-04-19] Inbound via Email — Brandon Bautista:
      Hello!
      
      Thanks for filling out our questionnaire. I wanted to share our summer ID camp info with you so you can put it on your radar. Please see the dates below:
      
        *   May 9 & 10, 2026
      
        *   August 1 & 2, 2026
      
      Our ID Camp is an excellent opportunity to participate in training sessions and game...
    [2026-04-03] Inbound via Sports Recruits — Brandon Bautista:
      Hi Finn,
      
      Thanks for reaching out!
      
      We will be hosting an ID camp on May 9-10 & August 1-2 that you can attend.
      It’ll be a great opportunity to get in front of our staff in a training and
      match environment as we continue to recruit for 2027. If you’re interested,
      you can register at the link belo...

SCHOOL: Lafayette College
  Status: Ongoing Conversation
  Division: D1 — Patriot League
  Location: Easton, PA
  Admit Likelihood: Reach
  Coach: Dennis Bohn — Head Coach <bohnd@lafayette.edu>
  Coach: Gabriel Robinson — Associate Head Coach <robingab@lafayette.edu> [primary]
  Coach: Ismar Tandir — Assistant Coach <tandiri@lafayette.edu>
  Coach: Josh Bordwick — Assistant Coach <bordwicj@lafayette.edu>
  Last Contact: 2026-05-27
  RQ Status: Completed
  Videos Sent: Yes
  Contact Log (3 shown):
    [2026-06-03] Inbound via Sports Recruits — Gabriel Robinson:
      Finn, 
      
      Excellent, we are looking forward to meeting and working with you at camp. 
      
      Best, 
      
      Gabriel Robinson
      
      Associate Head Men's Soccer Coach
      
      Lafayette College
      
      211 A.P. Kirby Sports Center
      
      Easton, PA 18042
      
      610-330-5495 (office)
      
      610-330-5702 (fax)
      
      www.goleopards.com
    [2026-05-30] Outbound via Sports Recruits — Gabriel Robinson:
      Hi Coach,
      
      I'm all signed up for the PPA Penn 1 camp! Really looking forward to getting out there and getting in front of the coaching staff.
      
      Best,
      
      Finn Almond
    [2026-05-28] Inbound via Sports Recruits — Gabriel Robinson:
      Finn, 
      
      Thank you for the email touching base with us. We would love to have you out to a camp. You will need to register and complete the necessary documents. 
      
      Please let me know if any questions come up! 
      
      Summer ID camp
      information 
      
      https://peakperformancesoccer.com/
      
      Best, 
      
      Gabriel Robinso...

SCHOOL: Lehigh University
  Status: Ongoing Conversation
  Division: D1 — Patriot League
  Location: Bethlehem, PA
  Admit Likelihood: Reach
  Coach: Dean Koski — Head Coach <lehighmenssoccer@lehigh.edu> [primary]
  Coach: Ryan Hess — Associate Head Coach <reh311@lehigh.edu>
  Coach: Matt Giacalone — Assistant Coach
  Coach: Brendan McIntyre — Assistant Coach
  Coach: Chase Tackett — Assistant Coach <cht526@lehigh.edu>
  Last Contact: 2026-05-27
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Yes in Arizona
  Contact Log (3 shown):
    [2026-05-27] Outbound via Sports Recruits — Ryan Hess:
      Hi Coach,
      
      Unfortunately I can't make the June 6-7 or July 18-19 camps due to prior commitments. Are there any other options to get in front of your coaching staff this summer or camps you will be attending?
      
      Best,
      
      Finn Almond
    [2026-05-21] Inbound via Email — Ryan Hess:
      Finn
      
      Sorry to hear you couldn't make the cup, but we hope to see you soon.
      
      We'd love to host you for a camp this summer, as we plan to use our camps
      to make some final decisions about the class of 2027.
      
      We just added Georgetown University to our June 6-7 camp! As well as have a
      few other dates...
    [2026-05-21] Inbound via Sports Recruits — Ryan Hess:
      .unsubscribe_email_
      .unsubscribe_email_Finn,
      
      We're very excited to have confirmed our staff for ID Camp, with the latest addition of the Georgetown to our experienced staff!
      
      We have a few field players spots open for June 6-7 and look forward to working with you this summer.
      
      							_______
      Rya...

SCHOOL: Milwaukee School of Engineering (MSOE)
  Status: Ongoing Conversation
  Division: D3 — Northern Athletics Collegiate Conference (NACC)
  Location: Milwaukee, WI
  Admit Likelihood: Likely
  Coach: Rob Harrington — Head Coach <harrington@msoe.edu> [primary]
  Coach: Joe Schauer — Assistant Coach
  Coach: Caden Pruitt — Assistant Coach
  Coach: Derek Marie — Assistant Coach
  Coach: John Moynihan — Assistant Coach
  Coach: Lukas Schwenke — Assistant Coach
  Last Contact: 2026-05-19
  RQ Status: Completed
  Videos Sent: Yes
  Notes: What do you want to study?
  Next Action: Reply to "Let's connect in May" (Finn) — due 2026-05-03
  Contact Log (3 shown):
    [2026-06-03] Outbound via Phone:
      Sounds great!
    [2026-06-03] Inbound via Phone — Rob Harrington:
      Friday at 1 pm
    [2026-06-03] Outbound via Phone:
      Can you do tomorrow at 4pm, Friday at 1pm or Friday at 3pm?

SCHOOL: Rochester Institute of Technology (RIT)
  Status: Intro Sent
  Division: D3 — Liberty League
  Location: Rochester, NY (Henrietta suburb)
  Admit Likelihood: Target
  Coach: Bill Garno — Head Coach <bill.garno@rit.edu> [primary]
  Coach: Yuri Lavrynenko — Associate Head Coach
  Coach: Kevin May — Assistant Coach
  Coach: Travis Wood — Other
  Last Contact: 2026-05-20
  RQ Status: Completed
  Videos Sent: Yes
  Contact Log (3 shown):
    [2026-05-20] Outbound via Email — Bill Garno:
      Coach Garno,
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Boulder County MLS
      NEXT Academy U19. RIT stands out to me for the combination of a top
      engineering program — I'm targeting mechanical or aerospace — and
      competitive Liberty League soccer.
      
      I moved from striker to left wingback mid...
    [2026-04-02] Outbound via Sports Recruits — Bill Garno; Yuri Lavrynenko; Kevin May; Travis Wood:
      Coach Garno,
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy. RIT's combination of a top engineering college and competitive Liberty League soccer is exactly the profile I'm looking for.
      
      I play an attacking wingback role on the left side — strong in 1v1 situations...
    [2025-12-03] Outbound via Sports Recruits — Bill Garno; Yuri Lavrynenko; Kevin May; Travis Wood:
      Hi Coach,
      I wanted to follow up quickly in case my earlier email got buried.
      
      I’m Finn Almond, a 2027 left-footed striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in your program and would love it if you could check out one of my games at MLS Next Fest.
      
      Here is my schedule in...

SCHOOL: RPI
  Status: Intro Sent
  Division: D3 — Liberty League
  Location: Troy, NY
  Admit Likelihood: Reach
  Coach: Adam Clinton — Head Coach <clinta@rpi.edu> [primary]
  Coach: Steve Wieczorek — Assistant Coach <wieczs@rpi.edu>
  Coach: Paul Fowler — Assistant Coach
  Coach: Sean Maruscsak — Assistant Coach <maruss@rpi.edu>
  Last Contact: 2026-05-20
  RQ Status: Completed
  Videos Sent: Yes
  Contact Log (3 shown):
    [2026-05-20] Outbound via Email — Adam Clinton:
      Coach Clinton,
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Boulder County MLS
      NEXT Academy U19. RPI stands out to me for the combination of top-tier
      engineering — I'm targeting mechanical or aerospace — and Liberty League
      soccer.
      
      I moved from striker to left wingback mid-season at my c...
    [2026-04-02] Outbound via Sports Recruits — Adam Clinton; Sean Maruscsak; Julian Boehning; Steve Wieczorek:
      Coach Clinton,
      
      I'm following up on my earlier message. I'm Finn Almond, a 2027 left wingback playing for Albion SC Colorado MLS NEXT Academy. RPI's engineering reputation is one of the strongest in the country, and the Liberty League's level of play is something I want to compete in.
      
      I play lef...
    [2025-12-03] Outbound via Sports Recruits — Adam Clinton; Sean Maruscsak; Julian Boehning; Steve Wieczorek:
      Hi Coach,
      I wanted to follow up quickly in case my earlier email got buried.
      
      I’m Finn Almond, a 2027 left-footed striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in your program and would love it if you could check out one of my games at MLS Next Fest.
      
      Here is my schedule in...

SCHOOL: South Dakota Mines (South Dakota School of Mines & Technology)
  Status: Ongoing Conversation
  Division: D2 — Rocky Mountain Athletic Conference (RMAC)
  Location: Rapid City, SD
  Admit Likelihood: Likely
  Coach: Teren Schuster — Head Coach <Teren.Schuster@sdsmt.edu> [primary]
  Coach: Rob Reagan — Assistant Coach <robert.reagan@sdsmt.edu>
  Coach: Mike Fairchild — Other
  Last Contact: 2026-05-20
  RQ Status: Completed
  Videos Sent: Yes
  Contact Log (3 shown):
    [2026-05-20] Outbound via Sports Recruits — Teren Schuster; Rob Reagan:
      Coach Schuster,
      
      A quick end-of-season update: we finished league play 9W-2L-3D and I started every game at left wingback with 3 goals and 2 assists. We qualified for MLS NEXT Cup but unfortunately we don't have the numbers to attend.
      
      I also wanted to let you know I'll be playing with Flatirons ...
    [2026-04-21] Outbound via Sports Recruits — Teren Schuster:
      Hi Coach,
      
      It would be awesome to see you down here at one of my games. We have 4 games left in our regular season and if we win out, there's a good chance we'll go to MLS NEXT Cup in Utah in May.
      
      Here are my league games.  Let me know which you're looking to come to and I can get you all the de...
    [2026-04-20] Inbound via Sports Recruits — Teren Schuster:
      Hi Finn,
      
      Too bad, we are nearly finished with training, this is our last week. Send
      me your league schedule and I'll see if I can swing down and watch you play
      
      Teren Schuster, Head Men's Soccer Coach
      
      Hardrocker Men’s Soccer
      
      South Dakota Mines
      
      501 E. Saint Joseph St., Rapid City, SD 57701
      
      O:...

SCHOOL: WPI
  Status: Intro Sent
  Division: D3 — NEWMAC
  Location: Worcester, MA
  Admit Likelihood: Target
  Coach: Brian Kelley — Head Coach <bkelley@wpi.edu> [primary]
  Coach: Alex Wolfel — Assistant Coach <arwolfel@wpi.edu>
  Coach: Taskin Guven — Assistant Coach
  Coach: Riley Doherty — Assistant Coach
  Coach: Gabe Ramos — Assistant Coach <gramos@wpi.edu>
  Last Contact: 2026-05-29
  RQ Status: Completed
  Videos Sent: Yes
  Contact Log (3 shown):
    [2026-05-29] Inbound via Email — Brian Kelley:
      Okay, thanks for letting me know and let me know when you sign up.
      
      Coach Kelley
      
      From: Finn Almond <finnalmond08@gmail.com>
      Sent: Wednesday, May 27, 2026 5:14 PM
      To: Kelley, Brian <bkelley@wpi.edu>
      Subject: [EXT] Re: ID Clinic Registration
      
      You don't often get email from finnalmond08@gmail.com<m...
    [2026-05-29] Inbound via Email — Brian Kelley:
      Hi Finn,
      
      We teach our wingbacks and backs along with every other position the fundamentals of the game which sets them up for success.  How hard each player competes is the real deciding factor.
      
      
      FYI and reminder.
      
      Thank you for emailing, I am catching up on some emails tonight.
      
      Please conside...
    [2026-05-27] Outbound via Email — Brian Kelley:
      Hi Coach,
      
      I'm super interested in the camp. I've just got to work some logistics with
      my parents first.
      
      Best,
      Finn Almond
      
      On Fri, May 22, 2026 at 2:11 PM Kelley, Brian <bkelley@wpi.edu> wrote:
      
      > Thank you for your interest in our program.
      >
      >
      >
      > Here is a link to our clinic which will be hel...

### Tier C — Exploratory (9 schools)

SCHOOL: Amherst
  Status: Ongoing Conversation
  Division: D3 — NESCAC
  Location: Amherst, MA
  Admit Likelihood: Far Reach
  Coach: Justin Serpone — Head Coach <jserpone@amherst.edu> [primary]
  Coach: Derek Shea — Assistant Coach
  Coach: Alex Ortega — Assistant Coach <aortega@amherst.edu>
  Coach: Jeff Huffman — Assistant Coach
  Last Contact: 2026-05-31
  RQ Status: Completed
  Videos Sent: Yes
  Contact Log (3 shown):
    [2026-05-31] Inbound via Sports Recruits — Rye  Jaran:
      Great, Finn!
      
      Looking forward to seeing you there!
      
      Best,
      Coach Jaran
    [2026-05-30] Outbound via Sports Recruits — Rye Jaran:
      Hi Coach,
      
      Thanks for the information. I just signed up for the PPA Penn 1 camp! Really looking forward to getting out there and getting in front of the coaching staff.
      
      Best,
      
      Finn Almond
    [2026-05-28] Inbound via Sports Recruits — Rye  Jaran:
      Hey Finn,
      
      Thanks for the update, and your continued interest! In regards to our formation, we have played both, but I'd say we lean more towards playing with a back 4! Would love to work with you at camp this summer!
      
      Coach

SCHOOL: Clark
  Status: Intro Sent
  Division: D3 — NEWMAC
  Location: Worcester, MA
  Admit Likelihood: Likely
  Coach: Samuel Matteson — Head Coach <smatteson@clarku.edu> [primary]
  Coach: Matthews Lima — Assistant Coach <malima@clarku.edu>
  Coach: Maitoe Suppasuesanguan — Assistant Coach <msuppasuesanguan@clarku.edu>
  Coach: Nur Adhikarie — Assistant Coach <nadhikarie@clarku.edu>
  Last Contact: 2026-05-28
  Videos Sent: Yes
  Notes: Sent MIT camp follow up email
Has a shared engineering program with Columbia
  Contact Log (3 shown):
    [2026-05-28] Inbound via Email — Samuel Matteson:
      Hi Finn,
      
      It's great to hear from you, we enjoyed watching your highlight tape.  When you have time, could you please complete our recruiting questionnaire as this is imperative in our ability to communicate with recruits.
      
      Complete Clark Men's Soccer Questionnaire<https://questionnaires.armssoft...
    [2026-05-27] Outbound via Email — Samuel Matteson:
      Coach Matteson,
      
      Quick end-of-season update. We finished league play 9W-2L-3D and I started
      every game at left wingback with 3 goals and 2 assists. I've been in the
      role full-time since November after moving over from striker at my coach's
      request.
      
      Latest reel: https://youtu.be/ajpAuqjSzpI
      
      Clar...
    [2026-04-02] Outbound via Sports Recruits — Samuel Matteson; Matthews Lima; Maitoe Suppasuesanguan; Nur Adhikarie:
      Coach Matteson,
      
      I wanted to follow up after the MIT ID camp this past July — it was a great experience and I came away with a lot of respect for the coaches involved in that event.
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy out of Dawson School in Lafayette, ...

SCHOOL: Colgate
  Status: Ongoing Conversation
  Division: D1 — Patriot League
  Location: Hamilton, NY
  Admit Likelihood: Reach
  Coach: Erik Ronning — Head Coach <eronning@colgate.edu>
  Coach: Ricky Brown — Assistant Coach [primary]
  Coach: Tim Stanton — Assistant Coach
  Last Contact: 2026-05-30
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Yes in Az
Will try to see a game
No engineering program, but has applied mathematics and other hard sciences
Emailed about MIT Camp and Coach Brown responded. Not going to be at the camp. Are starting to work on 2027s. Invited to their camp which is on August 1-2.
  Contact Log (3 shown):
    [2026-06-02] Inbound via Sports Recruits — Ricky Brown:
      Finn,
      
      Would be great to have you July 31 - August 1. Crimson Summer camps will be at Harvard which we are not attending.
      
      Typically, we take about one kid from camp per year.
      
      Best,
      
      RB
    [2026-05-30] Outbound via Sports Recruits — Ricky Brown:
      Coach Brown,
      
      Thanks for the note and for the camp link. I'd like to come to one of the Colgate ID Camps this summer July 31-August 1 or either of the Crimson Summer camps in August. Are you also coaching at the Northeast Elite ID Camp July 6-9? If so, that could be another option on my end.
      
      A c...
    [2026-05-28] Inbound via Sports Recruits — Ricky Brown:
      Finn,
      
      Thank you for reaching out regarding your (continued) interest in Colgate.
      We are just arriving back to campus from our trip to Utah, and will be prioritizing reaching out to those individuals we are permitted to reach out to and were able to comprehensively evaluate.
      
      From this point on, ...

SCHOOL: Cornell
  Status: Intro Sent
  Division: D1 — Ivy League
  Location: Ithaca, NY
  Admit Likelihood: Far Reach
  Coach: John Smith — Head Coach [primary] ⚠ needs_review
  Coach: Daniel P. Wood — Head Coach <msoccer@cornell.edu>
  Coach: Luke Staats — Associate Head Coach
  Coach: Tyler Keever — Assistant Coach
  Last Contact: 2026-05-19
  RQ Status: Completed
  Videos Sent: Yes
  Contact Log (3 shown):
    [2026-05-19] Outbound via Email — Daniel P. Wood:
      Coach,
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Boulder County MLS
      NEXT Academy U19. I wanted to introduce myself and provide an update from
      the end of the spring club season . Cornell stands out to me for the
      combination of a top engineering college — I'm targeting mechanical or
      aer...
    [2026-04-26] Outbound via Sports Recruits — John Smith; Tyler Keever; Luke Staats:
      Coach Smith,
      
      I'm a 2027 left wingback for Albion SC's MLS NEXT U19 Academy and I'm drawn to Cornell for the combination of strong engineering programs—I'm interested in mechanical or aerospace engineering—and competing at the Ivy League level.
      
      A quick update on my season so far:
      
      16 game starti...
    [2025-11-27] Outbound via Sports Recruits — Luke Staats; John Smith; Tyler Keever:
      Hi Coach,
      My name is Finn Almond, a 2027 left-footed striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in Cornell because of the strong engineering college, especially mechanical and aerospace pathways, and the way your team plays vertically and aggressively.
      
      I recently finish...

SCHOOL: Dartmouth
  Status: Intro Sent
  Division: D1 — Ivy League
  Location: Hanover, NH
  Admit Likelihood: Far Reach
  Coach: Connor Klekota — Head Coach <Connor.A.Klekota@dartmouth.edu> [primary]
  Coach: Ross Macklin — Assistant Coach <ross.d.macklin@dartmouth.edu>
  Coach: Robby Dambrot — Assistant Coach <rob.dambrot@dartmouth.edu>
  Coach: Liam Abdalla — Assistant Coach <liam.c.abdalla@dartmouth.edu>
  Last Contact: 2026-05-27
  Videos Sent: Yes
  Notes: Sent MIT camp follow up email, but no response
No interaction with Finn
Has Engineering program combined with AB program
  Contact Log (3 shown):
    [2026-05-27] Outbound via Email — Connor Klekota:
      Coach Klekota,
      
      Thanks for the note about Dartmouth and the summer ID camps. Dartmouth has
      been high on my list for a while, the Thayer engineering program plus Ivy
      League soccer is exactly the combination I'm looking for. I'm targeting
      mechanical engineering.
      
      A quick update from my end: we fini...
    [2026-05-22] Inbound via Email — Connor Klekota:
      96
      
      
                  Dartmouth
                  Dartmouth Soccer
                  Schedule
                  Roster
                  Camps
      
      
      				Finn,
      
      I hope all is well and we are excited to connect with you! We would like to provide you with information about Dartmouth College and what we have to offer from a soccer a...
    [2026-04-22] Outbound via Email — Connor Klekota:
      Hi Coach Klekota,
      
      I'm a 2027 left wingback at Albion SC Colorado MLS NEXT Academy U19 and
      wanted to reach out directly to get on your radar.
      
      I'm a 16-game starter at left wingback for our U19 Academy side where I
      have 2G/1A, including an Olimpico at MLS NEXT Cup Qualifiers in Scottsdale
      last we...

SCHOOL: Emory
  Status: Intro Sent
  Division: D3 — UAA
  Location: Atlanta, GA
  Admit Likelihood: Reach
  Coach: Cory Greiner — Head Coach <cgreine@emory.edu> [primary]
  Coach: Clayton Schmitt — Associate Head Coach <ceschmi@emory.edu>
  Coach: Felipe Quintero — Other
  Coach: Jose Casique — Assistant Coach
  Last Contact: 2026-05-27
  Videos Sent: Yes
  Next Action: Email coach directly.  Wingback intro.  Camp interest. How do they use wingbacks. (Finn) — due 2026-05-15
  Contact Log (3 shown):
    [2026-05-27] Outbound via Email — Cory Greiner:
      Coach Greiner,
      
      Quick end-of-season update. We finished league play 9W-2L-3D and I started
      every game at left wingback with 3 goals and 2 assists. I moved over from
      striker mid-season at my coach's request and have been in the role
      full-time since November.
      
      Latest reel: https://youtu.be/ajpAuqjS...
    [2026-04-02] Outbound via Sports Recruits — Cory Greiner; Clayton Schmitt:
      Coach Greiner,
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy. The UAA's academic culture and Emory's consistent D3 soccer program are a strong combination. The 3-2 engineering partnership with Georgia Tech is also something I've been looking at as a path to the e...
    [2025-12-03] Outbound via Sports Recruits — Clayton Schmitt; Cory Greiner:
      Hi Coach,
      I wanted to follow up quickly in case my earlier email got buried.
      
      I’m Finn Almond, a 2027 left-footed striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in your program and would love it if you could check out one of my games at MLS Next Fest.
      
      Here is my schedule in...

SCHOOL: Illinois Institute of Technology (Illinois Tech)
  Status: Ongoing Conversation
  Division: D3 — Northern Athletics Collegiate Conference (NACC)
  Location: Chicago, IL (Bronzeville, near downtown)
  Admit Likelihood: Target
  Coach: Marlon McKenzie — Head Coach <mmckenzie1@illinoistech.edu>
  Coach: Aziz Tahir — Assistant Coach <atahir2@illinoistech.edu>
  Coach: Julian Soto — Assistant Coach
  Coach: Mateo Sanchez — Assistant Coach
  Coach: Dylan Milkent — Head Coach [primary]
  Last Contact: 2026-04-02
  RQ Status: Completed
  Videos Sent: Yes
  Contact Log (3 shown):
    [2026-06-04] Inbound via Phone — Dylan Milkent:
      Phone call with Coach Milkent and Finn
      
      Nice guy.  Seemed super interested.
      Went to the wedding of the Colby head coach who's currently on honeymoon in Italy.
      Wants to see a full game film
      Wants to see a game film from a USL game when we have one
      70% of roster is upper classmen and most defenders...
    [2026-06-01] Outbound via Text — Dylan Milkent:
      That’s should work perfectly. Looking forward to it
    [2026-06-01] Outbound via Text:
      I am currently playing with flatirons FC, which has been great for improving my 1v1 defending and just being aggressive out of the air. 
      
      I am looking at a couple other engineering school in the northeast as well. 
      
      As for availability, I just got my Wisdom teeth out today so I am available all d...

SCHOOL: Princeton
  Status: Ongoing Conversation
  Division: D1 — Ivy League
  Location: Princeton, NJ
  Admit Likelihood: Far Reach
  Coach: Jim Barlow — Head Coach <jimbarlo@princeton.edu> [primary]
  Coach: Steve Totten — Associate Head Coach <stotten@princeton.edu>
  Coach: Sam Maira — Assistant Coach <smaira@princeton.edu>
  Coach: Tom Moffat — Assistant Coach
  Last Contact: 2026-06-03
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Academics
Test Scores
Events
Not in Arizona
  Contact Log (3 shown):
    [2026-06-03] Inbound via Sports Recruits — Steve Totten:
      Finn,
      
      Our full staff is currently scheduled to work that camp so it could be a good chance to be seen.  We are currently looking for 3 more for our top group of 2027s, with one of those likely to be a GK.  We are still actively evaluating.  We generally compare the
       best players we see at camp t...
    [2026-05-30] Outbound via Sports Recruits — Steve Totten:
      Coach Totten,
      
      Thanks for the note.
      
      One update from my end: I was invited to join Flatirons FC's USL Academy program for 2026-27 alongside my Albion commitments.
      
      Princeton is still high on my list. I saw the two College Prep Camps on June 13-14 and August 1-2. Given that you mentioned camp is o...
    [2026-05-28] Inbound via Sports Recruits — Steve Totten:
      Hi Finn,
      
      Thanks for your update.  How we play in terms
       of formations and roles is dependent upon our personnel and will change.
      
      Steve

SCHOOL: Williams
  Status: Ongoing Conversation
  Division: D3 — NESCAC
  Location: Williamstown, MA
  Admit Likelihood: Far Reach
  Coach: Steffen Siebert — Head Coach <ss40@williams.edu> [primary]
  Coach: Bill Schmid — Assistant Coach <williamsmenssoccer@gmail.com>
  Last Contact: 2026-05-27
  Videos Sent: Yes
  Contact Log (3 shown):
    [2026-05-27] Outbound via Sports Recruits — Steffen Siebert; Bill Schmid:
      Coach Siebert,
      
      Quick end-of-season update. We finished league play 9W-2L-3D and I started every game at left wingback with 3 goals and 2 assists. I've been in the role full-time since November after moving over from striker at my coach's request.
      
      Latest reel: https://youtu.be/ajpAuqjSzpI
      
      I kno...
    [2026-04-06] Inbound via Sports Recruits — Bill Schmid:
      Finn,
      
      Thanks for reaching out with your interest in Williams. It’s great to hear
      from you!
      
      We are in the thick of the 2027 recruiting process and would be happy to
      learn more about you! When you have some time, please fill out our Recruit
      Questionnaire <https://questionnaires.armssoftware.com/f...
    [2026-04-02] Outbound via Sports Recruits — Steffen Siebert; Bill Schmid:
      Coach Siebert,
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy. Williams is a program I've had on my list for a while — the NESCAC's academic culture and the level of D3 soccer in that conference are among the best in the country.
      
      I play left wingback in a back-th...

---

## 12. Recent Changes

> **How to use this section:** When you make a meaningful change — new feature, schema update,
> tech stack addition, recruiting strategy shift — add a one-line entry here with the date.
> Most recent at the top. This is the fastest way for Claude Code and Claude.ai to catch up
> on what's changed since they last saw the repo.

| Date | What changed | Type |
|---|---|---|
| 2026-06-04 | CLAUDE.md Deployment & Git Discipline rules added. Two constraints: never run Vercel CLI directly (all deploys via git push + auto-deploy from main); `git status` required before every `git add` and after every `git commit`. Existing "Before shipping" section's old `vercel --prod` reference updated to `git push` for consistency. Established after a multi-hour debug session where a week of feature work sat uncommitted in the working tree while CLI deploys silently shipped working-tree state with misleading dashboard SHAs. | Process |
| 2026-06-04 | Prep-for-call research JSON parsing made robust (src/lib/call-prep-research.ts). Model occasionally wraps its final structured response in markdown code fences mid-string or adds commentary alongside the JSON. Previous parser used anchored fence-stripping (^/$) that missed mid-string fences, with a greedy `{[\s\S]*}` fallback that over-matched on commentary containing braces. Replaced with non-anchored fence stripping plus balanced-brace extraction tracking string boundaries and escape sequences so quoted braces don't miscount. | Bug fix |
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
| 2026-05-16 | Schools map view: Leaflet + OpenStreetMap with tier-colored markers, popup with detail page link. /schools List|Map tab toggle persists in URL. Migration 046 adds lat/lng. Geocoding backfill via Nominatim (54/62 auto, 8 manual fixes). | Feature + Schema |
| 2026-05-16 | Nope school cascade: when school category becomes Nope, interested camps auto-decline with declined_reason='School moved to Nope tier'. Defense-in-depth filter on camp views. One-time backfill cleaned 5 existing rows. | Feature |
| 2026-05-16 | Strategic notes wiring: fetchSchoolContext now fetches school_message_plan.finn_notes; rendered in email body, topic suggester, prep-for-call, and campaign generate-draft prompts. Closes loop between Phase 3 suggestions and actual generated content. | Polish |
| 2026-05-15 | Utah trip cancelled — 2 inventory items archived. Inventory enriched: 7 existing items rewritten with richer strategic notes, 5 new core items added (Position transition, Olimpico, Academic identity, depth chart question, successful-recruit question), 2 time-sensitive items added (Spring grades, AP results with expires_at). Backfill rerun: 113 coverage matches across 157 historical outbound rows (up from 75). | Feature + Content |
| 2026-05-15 | Tech debt Chunk B: 15+ component maps converted to exhaustive Record<UnionType, T>; LLM generators (campaign email, school plan, coverage detector) wrapped in try/catch with empty fallbacks | Quality |
| 2026-05-15 | Tech debt Chunk A: shared fetchSchoolContext() helper extracted (5 LLM routes migrated); generate-draft parse_status filter bug fixed by inheritance; 246 lines of dead legacy prompt code removed | Quality |
| 2026-05-15 | Phase 3 polish: communications plan moved above conversation timeline, source links deep-link to contact_log entries with gold flash, contact dates replace detected_at | Polish |
| 2026-05-15 | Messaging Strategy Phase 3 (migration 045): school_message_plan table, Opus-powered per-school suggestions, communications plan UI on school detail, inventory integration in campaign creation and topic suggester | Feature + Schema |
| 2026-05-14 | Messaging Strategy Phase 2 (migration 044): school_message_log table, Sonnet 4.6 coverage detector, ingest-side fire-and-forget hooks in gmail-sync and sendgrid-inbound, backfill of 157 outbound rows → 75 matches | Feature + Schema |
| 2026-05-14 | Messaging Strategy Phase 1 (migration 043): messages table with 9 seed inventory items, /messages page with filters, type-to-confirm delete | Feature + Schema |
| 2026-05-14 | SR email ingestion cleanup: extractMessageBody rewritten to strip CSS/HTML/SR boilerplate at ingest time; backfill cleaned UCLA (5505→785 chars) and Caltech (3736→176 chars), both re-classified to higher confidence | Bug fix |
| 2026-05-13 | LLM model standardization: all email flows + prep-for-call upgraded to Opus 4.7; resume parser upgraded to Sonnet 4.6; high-volume extraction flows (classify, scraper, camp extractor) confirmed correct on Haiku 4.5 | Quality |
| 2026-05-13 | Email generation context expansion: full conversation history (no truncation), camps, decline history, coach changes, date awareness rule, signature standardization | Quality |
| 2026-05-13 | Migration 042: campaign_email_drafts.model_used default updated to claude-opus-4-7 | Schema |
| 2026-05-13 | Topic suggester action_items filter fixed + date awareness in prompts (resolves Cal Poly SLO May 9-10 past-camp suggestion bug) | Bug fix |
| 2026-05-11 | Campaign list kebab dropdown: React portal + edge-aware positioning (flips above near viewport bottom) | Bug fix |
| 2026-05-11 | Campaign archive + delete: migration 041 (archived_at), kebab actions, type-to-confirm delete, CASCADE preservation of contact_log | Feature + Schema |
| 2026-05-11 | Campaign draft modal: subject line restoration, Regenerate with hint input (migration 040 adds last_hint) | Feature + Schema |
| 2026-05-11 | Campaign creation simplified: removed template editor, only campaign name + messages to communicate | Feature |
| 2026-05-11 | Campaign email generation rework: LLM-powered per-school drafts via Sonnet 4.6, migration 039 (campaign_email_drafts table + message_set column), full conversation history input | Feature + Schema |
| 2026-05-11 | Calendar status priority sort: targeted at top of visible stack, ~85 lines deleted (slot-stability replaced with per-cell sort) | Feature + Refactor |
| 2026-05-11 | Inline action item editing via shared EditableActionRow: description + due_date editable in school detail sidebar | Feature |
| 2026-05-11 | Targeted camp state: migration 038 (targeted_at column), Model B action item gating (targeted, not interested), amber pill/bar colors throughout | Schema + Feature |
| 2026-05-09 | Phase B4 Tavily web discovery validated in production — first natural cron + cron_runs instrumentation | Validation |
| 2026-05-07 | cron_runs audit table (migration 037), health monitoring extended to coach-scraper and camp-discovery | Schema + Feature |
| 2026-05-07 | Pending Camp Decisions strategic prompt (camp_decisions) — forces decision pass on interested camps within 60 days | Feature |
| 2026-05-06 | Coach scraper Bug A + Bug C fixes validated via natural Wednesday cron — zero regression on processed rows | Validation |
| 2026-05-05 | SendGrid webhook health monitoring added to Today screen banner; getIngestionHealth() generalized to support multiple sources | Feature |
| 2026-05-05 | Gmail sync cadence: daily → every 15 minutes (Vercel Pro upgrade); UI copy now matches reality | Ops |
| 2026-05-05 | Vercel Pro tier upgrade — unlocks minute-granular crons, 60s function timeout, better cold starts | Ops |
| 2026-05-05 | Today screen Gmail sync health banner (yellow >24h stale, red >72h or missing row) | Feature |
| 2026-05-05 | Phase B3 (live trigger): extractAndProposeCamps wired into gmail-sync and sendgrid-inbound as fire-and-forget hook; validated end-to-end on reconnect | Feature |
| 2026-05-05 | Phase B2 (backfill): scripts/backfill-camp-extraction.ts; initial run produced 15 new camp proposals + 8 matched-existing from 32 inbound rows | Tooling |
| 2026-05-05 | Phase B1 (foundation): migration 036 (camp_proposals table), camp-extractor.ts with Haiku 4.5, 3-check dedup helper, /settings/camp-proposals review UI | Schema + Feature |
| 2026-05-05 | Migration 035: coaches.is_active soft-delete pattern + dedup against rejection history; Bug A and Bug C fixes in coach scraper review pipeline | Schema + Bug fix |
| 2026-05-04 | Phase A6: Camps calendar view — view toggle, month grid, multi-day bars, auto-derived short names (camp-display.ts), host school pencil + click-outside dismiss | Feature |
| 2026-05-04 | Phase A5: Camps action item integration — syncActionItemForCamp state machine (auto-create on deadline+interested, complete on registered, delete on declined) | Feature |
| 2026-05-04 | Phase A4: Camps section on school detail — Hosted/Attending subsections, + Add with host pre-fill | Feature |
| 2026-05-03 | Phase A3: Camp detail page — inline edit, status pills, school attendees, delete confirmation, editable host school selector | Feature |
| 2026-05-03 | Fix: useCamps takes schools as param, stable channel subscription — eliminates cascading useSchools subscription errors | Bug fix |
| 2026-05-02 | Phase A2: /camps list view with filter pills, AddCampModal, Camps added to nav (6 top-level items) | Feature |
| 2026-05-02 | Phase A1: Migration 034 (4 camps tables + backfill 7 camps), camps.ts data layer, useCamps() hook, PipelineTable camp dates | Schema + Feature |
| 2026-05-02 | Dropped schools.id_camp_1/2/3 columns + TypeScript cleanup across 4 files | Schema + Cleanup |
| 2026-05-01 | Today visual redesign shipped: V5 design language — red hero card, compact numeral rail, teal strategic cards, pipeline rail (HOT/ACTIVE/WARMING/COLD), masthead metrics (active/overdue/this week), caught-up state, mobile responsive | Feature |
| 2026-05-01 | Nav restructure: 9 items → 5 top-level (Today/Schools/Campaigns/Library/Tools), Tools group with expandable sub-items, /tools landing page, Import removed from nav | Feature |
| 2026-05-01 | New: src/lib/pipeline-rail.ts + src/components/today/PipelineRail.tsx — pipeline classification and right-rail component | Feature |
| 2026-05-01 | Deleted dead code: AwaitSection, ColdSection, HeroSection, WeekSection — replaced by TacticalSection in Phase 3a | Cleanup |
| 2026-05-01 | Banners removed from Today page — Tools sidebar badges carry coach-changes/parse-review/classification alert signals | UI |
| 2026-04-30 | Phase 3b shipped: strategic zone — 4 hardcoded prompts (reel coverage, RQ refresh, stale Tier A, pipeline shape), BatchReelModal with persistence, TaskContext-aware email gen, school detail RQ enhancements | Feature |
| 2026-04-30 | Migrations 032+033: strategic_skips, batch_reel_sends tables; schools.rq_link, player_profile.current_reel_* columns | Schema |
| 2026-04-30 | Phase 3a shipped: Today tactical zone — scored top 3, locked daily selection, Done/Undo with handled_at, HandledSection, single source of truth state | Feature |
| 2026-04-30 | Migrations 030+031: handled_at + selected_for_today_at on contact_log and action_items | Schema |
| 2026-04-30 | Foundation: shared awaiting-reply.ts (isAwaitingReply + isTargetTier), tier/channel/intent filters, sent_at comparisons | Refactor |
| 2026-04-30 | Fix: SR brand detection in sendgrid webhook (isSRNotification now matches "SportsRecruits" without .com); non-SR orphans dropped at parse time instead of stored | Bug fix |
| 2026-04-30 | Fix: orphan-drop for non-recruiting emails forwarded from Gmail (newsletters, bank alerts, etc.) — 74 historical orphans deleted | Data |
| 2026-04-29 | Tier + Admit editable inline dropdowns in right-rail About panel — completes school detail two-way | Feature |
| 2026-04-29 | Right-rail polish: editable notes (inline textarea), RQ status (click-to-edit dropdown + rq_updated_at tracking), video tracking display (last_video_url/title/sent_at with hyperlinked title) | Feature |
| 2026-04-29 | Migration 029: rq_status enum cleanup — collapsed legacy "(no email yet)" values into Completed | Data |
| 2026-04-29 | Migration 028: schools.rq_updated_at, last_video_url, last_video_title, last_video_sent_at + backfill 44 schools via YouTube oEmbed | Schema |
| 2026-04-29 | Manual contact log entry: inline form on school detail (direction, channel, coach, date, time, summary) with edit/delete for source='manual' rows | Feature |
| 2026-04-29 | Action items two-way: migration 027 (completed_at), non-destructive complete, "+ Add action item" inline form, "Recently completed" section (last 5) | Feature |
| 2026-04-29 | Timeline sent_at ordering: migration 026, shared resolveSentAt helper, all ingestion paths write sent_at, timeline sorts by sent_at DESC, staleness uses sent_at | Bug fix + Schema |
| 2026-04-27 | Phase 2a deployed to production; wingback campaign completed (40 schools sent/dismissed); RQ campaign retired (not a messaging campaign — was a checklist worked outside the system) | Milestone |
| 2026-04-26 | Phase 2a Part 3b: symmetric outbound linking (linkCampaignToOutbound for the send-then-mark workflow ordering) | Bug fix |
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
| 2026-04-15 | Added `generate-claude-context.ts` script + `npm run export-context` | Tooling |

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

The app has a "Copy for Claude" button on the `/pipeline` page (`src/components/DashboardClient.tsx`)
that copies a formatted plaintext pipeline summary to the clipboard for pasting into Claude.ai
strategy sessions.

Format per school:
```
SCHOOL: [name]
  Status: [status]
  Division: [division] — [conference]
  Last Contact: [date]
  Head Coach: [name]
  Notes: [notes]
  Next Action: [action] ([owner]) — due [date]
```

---

*Context file last regenerated: see Section 11 header for date.*
*To update: `npm run export-context` from repo root.*
*Maintained by: Randy Almond | finnalmond08@gmail.com*

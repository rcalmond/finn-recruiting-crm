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
videos_sent         boolean
notes               text
created_at          timestamptz
updated_at          timestamptz
```

### Table: `action_items`
```
id          uuid PK
school_id   uuid FK → schools.id (cascade delete)
action      text
owner       'Finn' | 'Randy' | null
due_date    date
sort_order  integer   -- persistent manual priority order
created_at  timestamptz
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
```

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
needs_review boolean                -- true = flagged for human review (coach_departed applies this)
sort_order   integer
notes        text                   -- used for endowed chair titles, misc
source       text not null          -- 'manual' (default) | 'scraped' (roster scraper) | 'from_gmail' (Gmail partials UI)
created_at   timestamptz
updated_at   timestamptz
```

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

**Today filter (`src/lib/todayLogic.ts` — `isActionableReply` + `getFilteredAwaitingReplies`):**
Positive whitelist (once classified): `authored_by IN (coach_personal, coach_via_platform)` AND `intent = requires_reply`.
Unclassified rows (`classified_at IS NULL`) are conservatively included until the live hook fires.
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

**Tier selector:** School detail page (`SchoolDetailClient.tsx`) now shows a dropdown to change
`schools.category` (A/B/C/Nope) inline. Uses existing `useSchools().updateSchool()` — no new API endpoint.
No migration needed (category column already existed).

**Empirical calibration results (2026-04-24, 70-row backfill):**
- Distribution: 40 requires_action (57%), 8 requires_reply (11%), 9 acknowledgement (13%), 8 informational (11%), 2 decline (3%), 1 staff_non_coach×informational, 2 team_automated×requires_action
- Confidence: 67 high / 3 medium / 0 low
- Today "Awaiting your reply" after filter: 3 rows in 90-day window (Dale Jordan/Stevens, Teren Schuster/SD Mines, Rob Harrington/MSOE)

### Phase 2a — Campaigns Foundation (migration 024 + 024b, shipped locally not yet deployed)

**Status:** All 7 Phase 2a commits live on local main, NOT yet pushed to origin. Production
deploy gated on Milestone 3.5 dry-run review (AI-drafted personalization output validation).

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

**RQ template body remains TODO:** The RQ campaign cannot be activated meaningfully until
Finn authors the template body. The current placeholder text starts with "TODO:" and
includes a soft warning on the Activate button (when active, this might surface a
confirmation dialog — TBD if implemented).

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

1. Read `CLAUDE_CONTEXT.md` (this file)
2. Skim `src/lib/types.ts` to confirm current type definitions
3. Ask Randy: "Any pipeline changes or new coaching contacts since last session?"
4. Always match DB queries to exact column names in Section 4
5. Never hardcode school names, coach names, or emails — pull from DB
6. If touching the schools table, confirm whether the change should also update `updated_at`
   (the trigger handles this automatically on UPDATE)

---

## 11. Live Pipeline — Generated April 24, 2026

**Active schools: 34** | Overdue actions: 27
(Category Nope and status Inactive excluded)

> **NOTE:** This section is auto-generated and is currently STALE (April 24).
> Run `npm run export-context` to regenerate before relying on it.

[Section 11 content unchanged — run export-context to refresh]

---

## 12. Recent Changes

> **How to use this section:** When you make a meaningful change — new feature, schema update,
> tech stack addition, recruiting strategy shift — add a one-line entry here with the date.
> Most recent at the top. This is the fastest way for Claude Code and Claude.ai to catch up
> on what's changed since they last saw the repo.

| Date | What changed | Type |
|---|---|---|
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
| University of Rochester | HC | Ben Cross | Hottest lead — praised film |
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

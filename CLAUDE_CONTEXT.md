# Finn Almond — College Soccer Recruiting App: Claude Context File

> **How to use:** Drop this file in the root of the repo. At the start of a Claude Code session,
> say: "Read CLAUDE_CONTEXT.md before we start."
>
> **To update the pipeline section:** `npm run export-context`
> (regenerates Section 10 from live Supabase data; all other sections are static)

---

## 1. What This App Is

**Throughball** (powered by **Regista**) — a college soccer recruiting CRM, now being productized for sale to other recruiting families (see the Throughball Rebrand + Productization section in 9). Regista is the named judgment engine: it reads coach replies, ranks the next move, and drafts responses. Multi-family tenancy (T1) is LIVE as of 2026-08-14: family #1 = Almond (**Randy Almond**, owner/parent-manager; **Finn Almond**, member/player) is the only real family, served on the finnsoccer.com domain; family #2 = Testerson is a sealed TEST family used for acceptance probes (born empty except 15 non-custom questions cloned by the create-family runbook). See the Tenancy Architecture section in 9.
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
                    -- VESTIGIAL: superseded by the recruiting_stage/milestone model.
                    -- No longer editable in the UI (the editor + masthead/modal pills
                    -- were removed). Column stays because deriveStage still reads it
                    -- (future cleanup). New schools still get a default on insert.
last_contact        date
head_coach          text
coach_email         text
admit_likelihood    'Likely' | 'Target' | 'Reach' | 'Far Reach'
rq_status           text   -- migration 001; "Completed" | "To Do" | "Updated" (only "Completed" counts as done)
rq_updated_at       timestamptz  -- migration 028; completion/refresh timestamp (180-day staleness on /questionnaires)
rq_link             text   -- migration 032; URL to the school's recruiting questionnaire
videos_sent         boolean
recruiting_stage    smallint not null default 1
                    -- 1=Research, 2=Reach out, 3=Engage, 4=Evaluate, 5=Advance, 6=Decide
                    -- Auto-derived floor for 1-3 from contact_log; manual promotion for 4-6
                    -- High-water mark: never auto-demotes
created_at          timestamptz
updated_at          timestamptz
-- notes (free text) DROPPED in migration 064 — content reviewed and discarded, retired from
--   every generation prompt and UI site first, then the column. 063 intentionally skipped
--   (a drafted RQ migration obviated by the audit-first Questionnaires build). Strategic notes
--   are a SEPARATE column and live untouched in school_message_plan.family_notes
--   (renamed from finn_notes at the T1 C6 sitting).
```

### Table: `school_milestones` (migration 057)
```
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
```

### Table: `school_offers` (migration 058)
```
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
```

Text-first fields deliberately — structure can tighten once offer #3+ exists and comparison needs emerge.
Wired into fetchSchoolContext (always fetched, no gate). Summary generator renders an OFFERS / ADMISSIONS section.
recommended_action jsonb on school_conversation_summary extended with optional `possible_offer: boolean` and `possible_offer_note: string` (no migration — jsonb).

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

### Table: `assets`
```
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

### Table: `discovery_schools` (migration 059)
```
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
```
Static reference universe (1,066 rows) powering School Discovery on Get Ready — facet browse + add-to-list (C-tier) + LLM find-more-like-these. Region is derived from state (NY in Northeast). Colliding names are disambiguated in the seed AND guarded in the matcher (exactly-one-universe-match-or-refuse; ambiguous names return a verify-program flag rather than the wrong school). Program facets (migration 062) power the Programs multi-select filter and enrich the find-more prompt; has_engineering is retained for provenance but deprecated in favor of programs.

**players.player_scores (migration 060):** a structured jsonb block — `{ sat: {total, math, ebrw}, ap: [{subject, score}], note? }` — born on the player_profile singleton, carried to the per-family players table by T1. Canonical source for the Get Ready Test Scores card; the free-text academic_summary stays for prose. Seeded from the real numbers (SAT 1380; four AP scores incl. Human Geography 4).

### Table: `calendar_events` (migration 061)
```
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
```
Lightweight parallel event species (showcases, tournaments, outreach send-moments). Merged with camps at DISPLAY time on the Get Seen timeline; camps machinery (proposals, camp_family_status — renamed from camp_finn_status at the T1 C6 sitting — coach attendance) is untouched. Realtime publication enabled.

### Table: `calendar_event_schools` (migration 061)
```
event_id   uuid FK → calendar_events.id (cascade delete)
school_id  uuid FK → schools.id (cascade delete)
primary key (event_id, school_id)
```
Optional nullable linkage — most events link no schools.

### Table: prep_docs (renamed from call_prep_docs — camp-prep migrations 0-3, run manually 2026-08, not in supabase/migrations/)

One row per prep document, call OR camp. Created as call_prep_docs (migration 049), generalized by the camp-prep stretch.

- id (uuid pk), school_id FK, created_at, generated_at
- doc_type — 'call' | 'camp'
- coach_id FK + coach_name_snapshot — snapshot pattern; coach_name_snapshot is now NULLABLE with a call-requires-coach check (a call doc must carry a coach; camp docs have none)
- camp_id — FK to camps ON DELETE SET NULL, with camp_name_snapshot / camp_dates_snapshot (snapshot pattern mirroring coach_id/coach_name_snapshot — the doc survives camp deletion)
- storage_path — renamed from docx_storage_path; NULLABLE with an uploaded-requires-file check. For camp docs it is set when the PDF is first built — the PDF is a DERIVED artifact; content is the document
- research_id — FK to school_research. Set historically on call docs; NO LONGER SET by camp generation (Phase 5.5 scope cut; column left in place)
- inputs (jsonb) — the three verbatim camp-prep input fields (camp_email_raw, travel_prose, extra_notes)
- extracted_schedule (jsonb) — the confirmed CampExtraction (null until the user confirms)
- content (jsonb) — the structured CampDoc; source of truth for the in-app render, print, and PDF
- framing_notes, tool_call_count, source — call-prep-era fields, unchanged

### Table: school_research (camp-prep migration 1C)

Per-school grounded research snapshots. Columns: id, school_id, generated_at, status (enum), model, tool_call_count, error, is_current, snapshot (jsonb), sources (jsonb), fetched_urls (jsonb URL ledger). is_current is flipped atomically by the set_current_research(p_school_id, p_id) SQL function — a FAILED run never becomes current; superseded rows are retained for history. 30-day staleness convention (STALE_DAYS in src/lib/school-research.ts). Currently consumed ONLY by the school-detail Research section — the camp doc deliberately does not read it (see Camp Prep Design Rules in Section 9).

### Table: players (T1 tenancy — per-family; carries the former player_profile fields)

One row per player per family (one player at alpha; reads take oldest-first). Created at the T1 C6 sitting (2026-08-14). All nine former player_profile singleton reads are now players-by-family reads; the resume parser updates the family's player row and SKIPS (with a warning) a family with no player row — it never invents one. Columns: id, family_id FK → families, name, plus the fields carried over from player_profile: current_stats, upcoming_schedule, highlights, academic_summary, player_scores (jsonb — see above), and the camp-prep fields home_timezone (IANA), position, grad_year, preparation_notes, recruiting_preferences.

player_profile itself (and strategic_skips) still EXISTS in the DB but is FROZEN — blocked in the tenant-db wrapper since the C6 sitting, dropped at C7 (NOT yet run). Nothing reads player_profile post-deploy; do not propose reads of it.

preparation_notes and recruiting_preferences are FAMILY-AUTHORED ECHO FIELDS whose column comments are binding on every generator; quoted verbatim:

- preparation_notes: "Free text, authored BY THE FAMILY, describing the player's own established preparation and recovery routine (equipment, timing, food preferences, anything they already do). Generators ECHO this into the relevant moment of a schedule. Generators MUST NOT infer, extend, diagnose, or originate any medical, rehabilitation, or dietary protocol from it, and MUST NOT store structured medical data here. If empty, generated guidance stays general."
- recruiting_preferences: "Free text, authored BY THE FAMILY, stating declared preferences and any constraint on what may be said to schools (e.g. which program holds the top-choice card, what language is off the table). Generators ECHO this into calibration. Generators MUST NOT infer, rank, or manufacture a preference the family has not written here. If empty, calibration states that no preference is on record and instructs against manufacturing a ranking."

### Tables: families / users (T1 tenancy — SQL run at the C6 sitting, 2026-08-14; architect-chat SQL, not in supabase/migrations/)

families — one row per tenant family. Family #1 = Almond (00000000-0000-0000-0000-000000000001). Family #2 = Testerson — a TEST family for acceptance probes: born empty except 15 non-custom questions cloned by the create-family runbook (Amendment D).

users — app users bound to a family: id (= auth.users.id), family_id FK → families, display_name, role (Randy = owner, Finn = member). Column-level UPDATE grant: authenticated users may update display_name ONLY (no self-promotion of role or family). AccountMenu renders users.display_name — no hardcoded name.

**T1 family scoping:** all 24 pre-existing family tables carry family_id NOT NULL + FK → families + index, protected by family RLS (see below); the new players table is family-scoped from birth. Renames live since the C6 sitting: camp_finn_status → camp_family_status (composite unique camp_id + family_id), school_message_plan.finn_notes → family_notes, get_voice_references() → get_voice_references(p_family_id uuid). Summary/message-plan upserts target the composite (school_id, family_id) keys; camp-status upserts target (camp_id, family_id). SUPERSEDED TWICE — read the current state, not the history. T2 (2026-08-18) made schools, coaches, camps, camp_school_attendees and camp_coach_attendees FAMILY tables. E1.5 (2026-08-21) then moved camps and camp_school_attendees BACK to CATALOG and dropped camp_coach_attendees entirely. CURRENT: FAMILY tables are schools and coaches (plus camp_family_status, camp_proposal_decisions and the rest of the T1 set). SHARED CATALOG tables are discovery_schools, camps, camp_school_attendees, camp_proposals, catalog_proposals, school_research, coach_changes, cron_runs, not_found_log, families and users. See E1.5 — Camps Are Shared in Section 9.

### RLS (rewritten by T1 — the pre-T1 any-authenticated-user-full-access model is DEAD)
All tables have RLS enabled. Family tables enforce FAMILY RLS: USING + WITH CHECK on (select app.current_family_id()). The helper is SECURITY DEFINER with a pinned search_path and is NOT executable by service_role — so every family_id column DEFAULT (the helper expression) fails LOUD on any service-role insert that forgot explicit scoping. That is a designed tripwire, not a bug.
Server-side service-role access goes ONLY through src/lib/tenant-db.ts (familyAdmin / catalogAdmin / rawService — see the Tenancy Architecture section in 9); constructing a raw service client anywhere else in src/ fails the prebuild fence (scripts/check-tenancy-fence.mjs).
User-facing routes and pages run on the cookie-backed USER client so RLS enforces — src/lib/require-family.ts (getFamilyContext) resolves the session user's family once per request.
Use the **anon key** in the frontend (Next.js client components).

**not_found_log** (migration 065) — 404 logging (log-only, no notification). Columns: id, path, referrer, user_id (nullable — authed user_id distinguishes internal-bug 404s from anonymous noise), user_agent, created_at. RLS on with NO policies: writes come only from the server via the service role (the /api/not-found-log fire-and-forget beacon); anon/authed clients get no access. The daily internal-404 email digest is DEFERRED admin tooling — do not build it into the customer product.
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
- **Auth**: Supabase Auth (Supabase PRO — no free-tier auto-pause)
- **Email**: Resend for outbound app/auth email (custom SMTP, from Throughball noreply@finnsoccer.com, DKIM/SPF verified); SendGrid Inbound Parse for reading coach replies (inbound only — SendGrid outbound is NOT used); ImprovMX forwards inbound personal mail to Gmail
- **Styling**: Tailwind CSS + inline styles (Throughball parchment + Pitch Green vocabulary)
- **Deployment**: Vercel (auto-deploy from main; no Vercel CLI — see CLAUDE.md)
- **Design vocabulary** (Throughball one-accent system — the discipline is the identity; the earlier jewel / four-phase-color ladder was retired by the brand sweep): Parchment base (#F6F1E8), ink (#1A1A1A) = primary text, with muted/faint neutrals. Pitch Green (#1F6B48) is the SINGLE brand accent — it points, it never floods; bold-italic mastheads carry a green trailing period. The weighted-pass-arrow mark + wordmark are the identity. Phases render as numbered acts (01-04) with a ghost-numeral ramp, NOT four hues. Cream (#FBF6EC) renders solid on fills (opacity-blended cream fails AA on lighter fills). DATA-SEMANTIC colors are EXEMPT and unchanged: recency/temperature dots, tier chips, category stripes, freshness bands, and the timeline outreach-send glyph encode data, never brand chrome — Pitch Green stays a SEPARATE token from the tier-A green even though the family is shared. The ink/charcoal weight register (Get In offer cards, Regista pronouncement cards, settled states) is not chrome and stays ink. Brand color, data color, and weight color are distinct roles that must not collide.
- **Public / auth split**: The root route `/` is now a PUBLIC, auth-free marketing page (see the Marketing Front Door section in 9). `/demo` is a public stub. Everything else is auth-gated. Auth is enforced by allowlist in `src/proxy.ts` (Next middleware): only `/`, `/demo`, `/auth/*`, and `/api/*` skip the login redirect — when adding a new public route, add it to that allowlist. (`/design-preview/*` was REMOVED from the allowlist by the 2026-08-13 emergency auth patch — its mockups carry identity data; it is auth-gated like the rest of the app.)
- **Navigation**: Four journey phases + Schools + Settings, plus a nav ACCOUNT MENU (AppNav sidebar footer + a mobile Account item) that holds the app's only sign-out + change-password. Every phase page follows the cascade grammar (masthead = name + green trailing period; pitch chrome; second-person). Brand chrome is Pitch Green across all four — the jewel per-phase colors were retired by the brand sweep.
  - /get-ready — Two zones: The kit (2x2 asset grid + Your Talking Points) and The list (Targets segmented rows + School Discovery, migrations 059 + 062)
  - /get-seen — The calendar (the merged 10-week timeline via the shared MergedTimeline component) + an Every-way-in toolkit (questionnaires, film, outreach, coaches)
  - /get-recruited — The daily surface (queue hero + 4-row board — Awaiting Finn folded into Active with a ring marker); signed-in users also land here from the marketing page and after login
  - /get-in — the endgame (pickEndgameMove hero); offer cards stay ink/charcoal (weight register, not chrome)
  - /schools — top-level, phase-independent. Whole rows are real anchor links to detail (native new-tab); filters trimmed to signal chips + search; a collapsed Bench disclosure surfaces all Nope-tier and Inactive schools (55; search auto-expands and filters it). List/Map toggle retained.
  - /schools/[id] (school detail) — the app's oldest surface, restructured by mental mode into zones: masthead + standing state (charcoal offer cards above the fold, ConversationSummaryCard as the hero), The conversation (contact-log timeline, recent-8 with Show all), The staff (coach cards + call prep), Your tracking (action items + status updates; in-zone +Add with three capture types), The logistics (RQ + camps + details strip). Neutral chrome — the page serves every phase.
  - /questionnaires — the RQ workbench (Get Seen child), reached from Get Seen's questionnaires card. Lifecycle sections (Not started / Needs an update at 180 days / Current) over active schools; the card and the page share the summarizeRq helper.
  - Deleted (housekeeping + /pipeline removal): the orphaned components CampsCalendar, HomeClient and its subtree (StatsStrip, HomeSchoolCard, StrategicSection, PendingCampDecisionsModal), and QuestionsPanel. The old signal deep-link into /schools went with them.
  - Settings — three items: Coach Changes, Camp Proposals, Gmail Settings (Parse Review and Classification Review retired), plus Tools. A Throughball-branded /auth/login and a branded Offside. 404 page front the app.
  - **Deep routes** (renamed to match their labels): Talking Points = /talking-points, The kit = /kit, Calendar = /calendar (+ /calendar/[id]); /questionnaires and /campaigns (+ /campaigns/[id], /campaigns/new) reachable via deep links from phase pages. RETIRED: /pipeline (removed in three passes — editor rehomed to school detail, sign-out to the nav account menu, then deleted), plus /library, /questions, and the /dashboard stub.
- **Key paths**:
  - `src/lib/types.ts` — TypeScript types (School, ContactLogEntry, ActionItem, SchoolOffer, etc.)
  - `src/lib/supabase.ts` — Supabase client initialization
  - `src/lib/school-context.ts` — shared fetchSchoolContext for all LLM-calling routes
  - `src/lib/tenant-db.ts` — T1: the ONLY legal source of a service-role client (familyAdmin / catalogAdmin / rawService)
  - `src/lib/require-family.ts` — getFamilyContext: resolves the session user's family once per request
  - `scripts/check-tenancy-fence.mjs` — prebuild fence: fails the build on raw service-client construction outside the allowlist
  - `supabase/migrations/` — schema migrations (numbered, applied via Supabase dashboard)
  - `supabase/scripts/` — data migrations and one-shot scripts (committed)
  - `scripts/generate-claude-context.ts` — this script

---

## 9. Known Gaps and Limitations

### SCHEMA AHEAD OF CODE (August 2026 — read before trusting the schema)

BOTH INSTANCES BELOW ARE NOW CLOSED. The section stays because the PATTERN recurs every time the architect chat runs SQL ahead of a deploy, and because both instances failed the same silent way: a column or table that exists but nothing reads or writes reads exactly like a feature that works. THE LESSON, stated once: schema landing ahead of code produces nulls and empty sets, and null is indistinguishable from nobody-did-it while an empty set is indistinguishable from nothing-to-do. When you find a migration that has landed, VERIFY THE CODE PATH BEFORE BELIEVING THE FEATURE.

1. CHUNK I — CLOSED 2026-08-19. camp_proposal_decisions exists (195 historical Almond rejections backfilled as family-scoped dismissals) and camp_proposals.status accepts invalid. For a stretch the CODE was untouched, so the camp-discovery ALMOND_FAMILY_ID pin was the only thing preventing one family's rejection from silently suppressing a camp for every other family — a control by accident. Now shipped: shouldSkipProposal takes a REQUIRED familyId (required so the compiler finds every call site; optional would recreate the defect the first time a caller omitted it); status invalid suppresses for EVERYONE while a dismissal suppresses for ONE family; and a shared pending proposal with no decision row for a family CREATES that row rather than treating absence as already-handled. BUILDING IT SURFACED TWO MORE PIECES THAT HAD TO SHIP TOGETHER, because the first alone would have regressed: reject was writing a GLOBAL camp_proposals.status of rejected, and all three read surfaces (the queue page, the sidebar badge, the tools badge) filtered status pending with NO family dimension — so every family saw every proposal and one family's reject removed it from everyone. Reject is now a per-family dismissal that leaves the shared proposal row untouched, and the three surfaces subtract this family's dismissals through one shared helper (src/lib/camp-proposal-queue.ts) so a badge can never disagree with its page. THE PIN IS GONE (2026-08-19): camp-discovery and coach-roster-sync now scan the UNION of families. Because schools and coaches are family tables and no wrapper reads one across families, the union is assembled family by family through scoped clients, so every write lands in the scope that produced it. src/lib/fetch-all.ts pages and asserts rows.length equals count in ONE implementation. Removing the pin immediately exposed a defect it had been hiding: proposals now exist for schools a family does not track, and the review queue filtered only on status, so each family saw the other's proposals — invisible while one family existed. The queue is now scoped to proposals hosted at this family's own schools. STILL PINNED and correctly so: gmail-sync, summary-refresh and the gmail helpers, which are bound to Almond's single Gmail OAuth until per-family OAuth exists.
2. ADMIN AUDIT COLUMNS — CLOSED 2026-08-19, this item is resolved and kept as the pattern. The four columns (inbound_quarantine.resolved_by and resolved_by_email, family_inbound_addresses.minted_by and minted_by_email) had existed since the admin-console sitting with NO write path populating any of them. All four now write: requireAdmin returns email alongside userId (it always called auth.getUser, so the value was in hand — nothing downstream could write an email column because nothing was ever given one); quarantine REPLAY and DISCARD both record the actor, discard included, because deciding a message belongs to nobody is as actor-bearing as filing it; mintInboundAddress takes a REQUIRED POSITIONAL minter argument, positional so the compiler finds every call site and required because minting creates a family's only routing credential. /admin/inbound surfaces both — a column nobody can read is the same decoration in a different place. VERIFIED BY ROWS, not by reading code: a mint and a discard performed through the console wrote user id 4162f9ad and rcalmond@gmail.com to both tables. Rows written before the wiring render as (unrecorded) rather than blank, so the gap stays visible instead of looking like an actorless action. THE GENERAL LESSON: a column that exists is not an audit trail. When schema lands ahead of code, the columns read null and null is indistinguishable from nobody-did-it.


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
- body or summary matches /(camp|clinic|showcase|ID camp|prospect day|elite training)/i

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

Root cause: the model occasionally returns JSON wrapped in markdown fences mid-string (not just at the boundaries), or with brief commentary text alongside the JSON. The previous parser used anchored regexes (^/$) that only matched fences at the absolute start/end of the string, and a greedy `{[sS]*}` fallback that over-matched when commentary contained braces (function bodies in code examples, set notation in math, etc.).

Fix: non-anchored fence stripping (/```jsons*/gi + /```s*/g) plus balanced-brace extraction with explicit string-boundary tracking — track `inString` flag, handle escape sequences so an escaped quote inside a string doesn't flip the flag, only count braces when not inside a string. Surfaces the actual JSON object regardless of where it sits in the response.

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

### Jewel Palette + Full-Surface Rework (August 8, 2026)

**1. Marketing palette v2 — the jewel ladder.** The bold-fill phase cards (first shipped in green/gold/rust/charcoal) exposed two flaws: the four colors accreted semantically rather than being designed as a set, and charcoal collided with the judgment-layer box. After mockup rounds rejecting hue-adjacent earth ramps (mud), the winning principle: continuity through REGISTER, not hue — four distinct jewel tones sharing depth and saturation. Final ladder (Option I): emerald 1E6B4C (Get Ready), petrol 0E5F6B (Get Seen), persimmon D0492E with AA-adjusted C13E24 (Get Recruited), violet 3E2C5E (Get In). Persimmon became the page-level act-accent replacing rust on the marketing page. Supporting fixes: opacity-blended body text fails AA on light fills — bodies render solid FBF6EC (systemic finding); the 2x2 board flipped so Close sits top-right and its chips became 16-24 real discovery-universe schools; phases copy became "Your recruiting roadmap." with second-person voice throughout.

**2. The cascade grammar.** A repeated page formula emerged and was applied to every phase page: masthead = phase name + descriptive subtitle only (status lines die; the full-fill hero card is the single message), single bold-italic section headers (all small-caps eyebrows removed app-wide), second-person voice, and the page's jewel color as chrome while data semantics (category stripes, timeline dot colors, tier chips) stay untouched.

**3. Get Ready (three passes).** Two zones (The kit / The list); 2x2 equal-weight asset grid; message inventory renamed Your Talking Points with real metrics — staleness (6 updates stale at 60d+) and story-coverage (top schools have heard 37 percent — both instantly useful); Targets card rebuilt as four labeled segmented rows (tier, depth, selectivity via the discovery id-bridge with an honest unrated bucket, division) with stepped ramps and counts-in-legend; Discover facets became multi-select checkboxes; migration 062 added discovery_schools.programs text array — engineering backfilled 326/326, six-program vocabulary (engineering, business, nursing, premed_health, computer_science, education) seeded deterministically via the shared supabase/scripts/program-tags.ts module used by both the live pass and the committed seed. Exclusion bug fixed: CO School of Mines vs Colorado School of Mines token gap (working row renamed canonical). KNOWN OPEN: the same-class WashU alias fix (send short_name/aliases through the exclude id-bridge) was recommended but not yet confirmed shipped.

**4. Get Seen.** First in-app jewel migration (petrol). Purpose restructure: The calendar + an Every-way-in 2x2 toolkit — Questionnaires (rq_status: 10 of 10 complete), Film (resurrected the orphaned BatchReelModal, restyled to parchment/petrol; coverage 5 of 6 top schools with the sole gap IIT on the old striker reel), Outreach at scale (campaigns), Coaches on file (32). Timeline bold treatment: events as cards-on-stems, next event as a filled petrol hero with days-out pill, enlarged ring markers vs rust rounded-square send glyphs, 4px rail, black TODAY post, collision-stagger mechanism (dormant at current density). Polish pass: cards edge-clamped inside the container, 1-3 day ranges render as dots (bars only 4+ days), height tightened 340 to 224.

**5. Get Recruited.** Persimmon migration (C13E24 read from marketing components). Masthead status line and offer fragment removed (queue priority carries both). Priority card became a full-fill persimmon hero (edge treatment retired; ghost numerals raised to visible — hero cream 15 percent, secondaries 8.5). Board redesign: the Awaiting Finn row REMOVED on the insight that awaiting is whose-turn, not a temperature — hot schools fold into Active with a 2px persimmon ring marker (legend: ring = awaiting your reply); rows are now a clean Active/Cooling/Cold/Prospecting gradient; marketing zone tints and chip styling pulled through. Display-layer only — classifier, filters, pickDailyPriority untouched.

**6. Get In.** Violet chrome (offer cards stay charcoal — weight register preserved; verified distinct by hue and role). New pickEndgameMove rule engine: unmet open-offer conditions, then near key dates within 21 days, then stage-5+ missing visits, then quiet — tie-break nearest date then newest offer. Live result: Clark "Complete the Clark Common App." with the 40K-floor framing — the same conclusion pickDailyPriority reaches on Get Recruited, two engines agreeing from the same data.

**7. Talking Points page (was Messages).** Lifecycle sections replace the flat list: Needs a look (stale/expired triage with inline Refresh/Retire — opened with all 6 updates, In rotation opened EMPTY, the finding not a bug), In rotation (with per-row heard-counts from one bulk school_message_log query), Your questions, Archived collapsed. Collapsible phase-guidance panel (What coaches need to hear, phase by phase) in the jewel colors, static copy, localStorage-remembered.

**8. The kit (was Assets).** Slot model: The essentials 2x2 (reel/resume/transcript/scores, filled and designed-empty states, freshness banding) + The shelf. Currency rule confirmed shared with DraftModal and Get Ready (is_current newest-first) — the slot shows the file that would attach to an email. Per-type upload guidance lines.

**9. Calendar (was Camps).** The merged timeline extracted to a shared component (src/components/get-seen/MergedTimeline.tsx) rendered identically by Get Seen and Calendar. Structure: timeline hero, one unified chronological Up next list interleaving camps and events with kind-appropriate actions, Past and done collapsed (25-item tail out of the scroll path). The month-grid calendar view and list/calendar toggle KILLED (redundant with the timeline); CampsCalendar.tsx orphaned pending delete. Old-palette buttons and tier colors migrated; dead filter state removed (sections beat filters at this volume).

**Architectural patterns reinforced:**

1. Palette continuity comes from register (shared depth and saturation), not hue adjacency — and act-colors, weight-colors, and data-semantic colors are different roles that must not collide.
2. The cascade grammar: one hero message per page, derived by a small deterministic explainable rule engine; status lines and eyebrows are clutter once the hero exists.
3. Whose-turn is not a temperature — orthogonal states get markers, not axis rows.
4. When two pages render the same visual, extract the component before the second render ships divergence.
5. Structure beats filters at small data volumes; collapsed disclosures beat pagination for long tails.
6. Metrics earn their place by changing behavior: staleness and coverage replaced raw counts and immediately surfaced real chores (6 stale updates, 37 percent coverage, the IIT reel gap).

**Open items (as of August 8, 2026):**

- WashU alias exclusion fix — recommended (send short_name/aliases through the exclude id-bridge so "Washington University" resolves to "Washington University in St. Louis"), NOT yet confirmed shipped. Same class as the Mines fix.
- Route/nav rename consistency pass — user-facing names Talking Points, The kit, Calendar now diverge from routes /messages, /assets, /camps and their nav labels. Pending.
- CampsCalendar.tsx — orphaned after the month-grid removal; safe to delete in a follow-up.
- DraftModal coachId-slot quirk — BatchReelModal passes a schoolId in the coachId slot (pre-existing, unchanged); flagged for a future cleanup.

### Questionnaires, Schools + School Detail Reworks, Notes Retirement (August 9-10, 2026)

**1. Questionnaires workbench.** Get Seen's RQ card previously dumped into /schools; now a dedicated /questionnaires page (petrol, Get Seen child). Audit-first build: the school detail RQ block already carried three fields across three migration eras (rq_status 001, rq_updated_at 028, rq_link 032) — no new schema needed, no parallel fields created. Lifecycle sections (Not started / Needs an update at 180 days / Current) with inline RQ links, an Add-link finder for missing URLs, and Mark completed/updated sharing the school-detail write path. Both the Get Seen card and the page derive from a single summarizeRq helper so they cannot disagree. Live truth at ship: 10 of 10 completed, all dated 2026-07-14, all with links — the page opens as a clean scoreboard and wakes as a triage surface around January when the 180-day clock expires on all ten at once.

**2. Schools page rework.** The row-expand accordion removed — its three panel elements (summary, recommended action, draft button) were fully duplicated by ConversationSummaryCard on detail, so whole rows became real anchor links (native new-tab semantics). The bench: a collapsed disclosure surfacing all Nope-tier and Inactive schools — 55, not the ~17 guessed: the entire set-aside universe including the D1 aspirational era — with muted rows, whole-row navigation, and search auto-expansion (searching Stanford now finds benched Stanford instead of no-matches). Filters trimmed to signal chips + search (zero deep-links pointed at the dropped stage/tier/division params; URL-param reading preserved for bookmarks). Follow-up truth fix: nothing live links into the signal param anymore (StatsStrip and HomeClient both orphaned) — the chips stand on their own rationale and the stale comment was corrected.

**3. School detail rework (three passes in one day).** The app's oldest surface, organized by feature era, restructured by mental mode: Zone 0 masthead + standing state (consolidated header; NET-NEW charcoal offer cards above the fold — offers had never rendered on this page; ConversationSummaryCard as the hero), The conversation (timeline, recent-8 with Show all), The staff (coach cards + call prep), Your tracking (was Your notes), The logistics (RQ + camps + details strip). Neutral chrome — the page serves every phase. Refinement pass: stage/milestone popovers gained standard dismissal (they previously trapped until a choice); Show-alternatives deprecated (finding: the summary generator never produced alternatives — the toggle lazy-loaded message-plan suggestions on click, so no standing token cost existed); Call prep promoted to its own section with purpose copy and a designed empty state; Strategic notes and Notes cards retired from capture (status updates absorbed the role); the masthead +Note button retired in favor of an in-zone add with three types; the timeline Log entry form restyled to the house language.

**4. schools.notes retired end to end.** The legacy content (Clark, Colby) was reviewed and held nothing worth migrating. The grep found MORE generation sites than expected — beyond the three named prompt files, the QA generator, message-plan generator, conversation-summary generator, and campaign-personalize builder all read school.notes — all removed. Strategic-notes input retired from the same school-detail generation sites (live data held zero rows); Communications Plan machinery internals left intact. Call prep Upload entry point removed (generation is the native path; modal + API kept so restoration is one line — deliberate, on-record). Migration 064 dropped the column code-first (deploy verified reading nothing, then the drop; 063 deliberately skipped — a drafted RQ migration obviated by the audit). Button consistency audit normalized the page to the house grammar: filled pill primary, outlined secondary, link tertiary, radius 999 throughout — the drift was mostly radius eras (r4-r7).

**5. Verification came of age.** Two firsts this span: a background fork agent implemented the detail restructure while the main session inventoried (diff-reviewed before ship), and CC drove Chrome against the deployed production build for full browser sweeps — whole-site after the Schools rework (zero console errors site-wide) and targeted sweeps after each detail pass, including live write round-trips (status update 4-5-4 with regen visibly firing, test log entries saved and deleted). The standing auth-gated/no-pixel caveat era is over when the extension is connected; the remaining blind spot is the phone breakpoint (tooling captures at fixed desktop width).

**Architectural patterns reinforced:**

1. Audit-first beats spec-first for old surfaces — the RQ fields existed across three migration eras and the notes grep found four unnamed generation sites; both builds would have created drift without the audit step.
2. Duplication earns deletion: the accordion died because detail already carried everything it showed; the month-grid died the same way. The bench proved set-aside data wants visibility, not deletion.
3. Retire inputs code-first, column-last — and review content before migrating it; sometimes the answer is delete.
4. One derivation, many surfaces: summarizeRq joins the currency rule and pickDailyPriority in the shared-helper family — surfaces that cannot disagree.
5. Popovers need standard dismissal semantics from birth; button grammar drifts by radius before it drifts by color.

**Open items (as of August 10, 2026):**

- CLEARED — schools.notes decision: content reviewed and discarded, retired from every generation and UI site, column dropped via migration 064.
- WashU alias exclusion fix — recommended (send short_name/aliases through the exclude id-bridge), still NOT confirmed shipped. Same class as the Mines fix.
- CLEARED — Route/nav rename consistency pass: /assets to /kit, /messages to /talking-points, /camps to /calendar, all internal links in lockstep (see the Throughball Rebrand + Productization section).
- CLEARED — Orphan deletes: CampsCalendar, StatsStrip, HomeClient and its subtree all deleted.
- CLEARED — the whole auth/email chain (Throughball-branded login, the magic-link redirect fix, Resend SMTP), the full brand sweep, /pipeline removal, and DNS cleanup (see the Throughball Rebrand + Productization section).
- STILL OPEN (productization) — /demo content, signup/trial/billing, multi-tenant data isolation, acquiring the Throughball domain, and the cold-start demo conversation; plus the DEFERRED internal-404 email digest (admin tooling only, never customer-facing).
- DraftModal coachId-slot quirk — BatchReelModal passes a schoolId in the coachId slot (pre-existing, unchanged); flagged.
- Prep-doc upload unreachable by design — the Call prep Upload entry point was removed; UploadPrepDocModal + the upload API are intact but have no UI entry (restoration is one line if wanted).
- Phone-breakpoint verification gap — the Chrome tooling captures at a fixed desktop width, so the mobile breakpoint is verified at the code level only.

### Throughball Rebrand + Productization (August 2026)

The app was rebranded from finnsoccer.com to **Throughball, powered by Regista** as the first step toward productizing it for sale to other recruiting families. The brand doctrine lives in docs/throughball-visual-identity.html (+ .docx) and, live, in the /design-preview/brand route + src/components/brand — there is NO throughball-brand-guidelines.md (a previously documented path that never existed). This section records what was BUILT.

**1. Brand identity + the two-name architecture.** Throughball = the product and place (organization, the record, every surface). Regista = the named judgment engine (reads coach replies, ranks the next move, drafts responses). The test for which name applies: does this require an opinion about a specific coach interaction? No means Throughball or second-person benefit; yes means Regista. Visual system: Pitch Green #1F6B48 as the SINGLE accent (the discipline is the identity — green points, it never floods), ink + parchment neutrals, the weighted-pass-arrow mark, bold-italic mastheads with a green trailing period, phases as numbered acts (01-04) with a ghost-numeral ramp rather than four hues. Competitive positioning: the advisor-as-software / judgment wedge, against full-service incumbents (fear-selling, hidden pricing), passive exposure platforms, and new filing-cabinet CRMs. Complementary to the rails families already have (SportsRecruits, Hudl).

**2. The brand sweep (marketing + every app surface).** Applied as scoped, individually-shipped, verified passes:
- Pass 0 foundations: --tb-* design tokens, the ThroughballMark/Wordmark/Logo components, global self-reference renaming.
- Pass 1 marketing page: mark/wordmark, one-accent color, the Roadmap as numbered acts, the Regista intelligence-moment card, voice sweep, taglines ("The assist for your kid's recruiting" primary; "Get recruited. Without the guesswork." promise).
- Pass 2 Get Ready (the in-app pattern-setter), Pass 3 global nav + Get Seen/Get Recruited/Get In, Pass 4 all deep surfaces (school detail, Schools, Talking Points, The kit, Calendar, Questionnaires, Campaigns, Settings).
- THE DATA-COLOR FIREWALL (critical, still binding): recency/temperature dots, tier chips, and category stripes encode DATA, not brand chrome. They are NEVER recolored to Pitch Green by any brand work. Pitch Green stays a SEPARATE token from the tier-A green even though they are the same family. The ink weight register (offer cards, Regista pronouncement cards, settled states) stays ink/charcoal — it is not chrome and does not go green.

**3. Route renames.** Deep routes aligned with their labels: /assets to /kit, /messages to /talking-points, /camps to /calendar (with nested detail routes). All internal links, nav items, and cross-page deep-links moved in lockstep. No redirects (bookmarks not a concern). DB tables, API paths, and internal type identifiers unchanged. The route audit also surfaced and retired orphaned routes.

**4. /pipeline removal (three passes).** /pipeline was a legacy surface that had quietly become load-bearing three ways: the only school-field editor, the only sign-out, and the post-login landing. Removed via prerequisite-gated passes: (1) rehomed the school editor (SchoolModal) IN PLACE into school detail — the "..." Edit button now opens the modal instead of routing to /pipeline, bringing name/short_name/division/location/conference/last_contact + coach management + delete in-house; (2) rehomed sign-out + change-password to a nav ACCOUNT MENU (AppNav, the only sign-out now) and repointed the 4 auth redirects to /get-recruited; (3) deleted /pipeline + its orphaned components. The vestigial status enum was dropped from the editor UI (stage/milestone superseded it) though the column stays (deriveStage still reads it — a future cleanup).

**5. Housekeeping + the 404 system.** Deleted confirmed-orphan routes and components; retired Parse Review (0 partials ever, data path intact); fixed small nits. Added 404 LOGGING (a not_found_log table capturing path/referrer/user_id/user_agent — authed user_id distinguishes internal-bug 404s from anonymous noise) and a branded "Offside." 404 page. NOTE: the 404 NOTIFICATION (a daily internal-404 email digest to Randy) is DEFERRED to future admin tooling and must stay OUT of the customer-facing product.

**6. Production auth + email.** Login is now Throughball-branded (no Finn-specific content). Auth emails send via custom SMTP through RESEND (free tier) from "Throughball <noreply@finnsoccer.com>" on the authenticated finnsoccer.com domain (DKIM/SPF verified). Branded magic-link email template. KEY FIX: magic-link emailRedirectTo is hardcoded to NEXT_PUBLIC_SITE_URL (or https://finnsoccer.com) then /auth/callback — NOT window.location.origin, which produced a bare-origin redirect_to that dumped users on the marketing page instead of /get-recruited. The Supabase Redirect URLs allowlist must contain /auth/callback + the wildcard. Supabase upgraded to PRO (removes free-tier auto-pause). THREE non-overlapping email tools: ImprovMX (inbound personal mail to Gmail, free), SendGrid inbound Parse (the app reads coach replies via the "in" MX), Resend (outbound app auth email). SendGrid outbound is NOT used.

**Architectural patterns reinforced:**
1. Brand color, data color, and weight color are different roles that must not collide — one accent for chrome, the data taxonomy left intact, ink for weight.
2. Prerequisite-gated removal: when a legacy surface is load-bearing in multiple ways, rehome each capability in its own verified pass and delete only after; never delete-then-discover.
3. Config vs code discipline in auth debugging: diagnose from evidence (the actual sent email's redirect_to was the ground truth), and separate what the user fixes in a dashboard from what changes in code.
4. Deterministic over context-derived: hardcode canonical URLs rather than computing them from browser context (window.location.origin) where an ambiguous runtime context can leak a wrong value.

**Productization prerequisites still OPEN (the path to actually selling):** the /demo page (route exists, content not built); signup/trial/billing (the revenue gate — none exists, app is single-user); multi-tenant data isolation; acquire the Throughball domain (then re-verify Resend + swap NEXT_PUBLIC_SITE_URL); the cold-start demo conversation.

---

### Camp Prep Docs — Current State (August 2026)

The camp prep feature is COMPLETE (commits 99b1815 through 00a31af; the dated Recent Changes rows record the increments). It lives on camp detail (/calendar/[id]) as the Prep doc card. The pipeline:

1. INPUT — three unstructured fields (camp email pasted verbatim, travel/logistics prose, extra notes), persisted verbatim in prep_docs.inputs.
2. EXTRACTION — Sonnet (claude-sonnet-4-6, blocking JSON) structures day-by-day schedule blocks, check-in, playing surface, HARD CONSTRAINTS (the highest-value output: paper-only forms, unsupervised breaks, schedule-runs-late caveats, optional sessions), travel segments, lodging + meal windows, competing commitments (each with a date field — explicit or resolved from relative day-words against a reference date; null when the prose gives none), and the timezone delta from player_profile.home_timezone. Extraction states facts only; absent times stay null, never guessed.
3. CONFIRM — an editable form, hard constraints first; undated commitments are visibly undated (red date field) with a note that they will not be pinned to a day. Confirming persists prep_docs.extracted_schedule. Draft reuse is keyed on camp_id — one draft per camp (useCampPrepDoc); the 14-day reuse rule remains call-prep-only.
4. GENERATION — Opus (claude-opus-4-8), a single call (~18-23k input tokens, ~100s): no research read, no cross-thread digest. Sections: masthead, where_you_stand (coach_touchpoints + advancement + not_yet + verdict), the_mission (+ calibration echoing recruiting_preferences), the_staff (name/role/angle from the CRM thread only — a no-thread coach gets name and role, your_angle omitted), the_plan, before_leaving, footer.
5. VALIDATE-BEFORE-PERSIST — validateCampDoc (src/lib/camp-doc-validate.ts) checks the shape, the plan-date span (earliest of today / first dated commitment through the return-travel day), and every touchpoint's quote evidence. One automatic retry; a second failure is a visible error and the PRIOR content is kept — a malformed run never silently drops a section. finalizeCampDoc then writes the code-computed fields (below) and the doc persists to prep_docs.content.
6. RENDER / PRINT / PDF — CampDocView renders content as read-only HTML on camp detail; an at-media-print stylesheet prints the document only (US Letter, no orphaned day headers, no split session blocks); GET /api/camp-prep/pdf/[id] builds the PDF server-side via camp-doc-pdf.ts (pdfmake; SEPARATE from call-prep-pdf.ts and its per-school accents), uploads to the assets bucket, sets storage_path, and streams — with the generation date in the footer.

COMPUTED IN CODE (the model emits evidence, never the conclusion):
- Plan day labels: the model emits an ISO date + a short descriptor per day, anchored to the camps table dates handed to it (Camp Day N = the Nth camp date). formatPlanLabel computes the human weekday/month/day label in home_timezone. The model never formats a date.
- Touchpoint classification: the model emits preceding_outbound_date + preceding_outbound_quote (the family words that raised the subject, VERBATIM — the validator rejects a quote not found in that outbound's raw_source) or the marker NO_PRIOR_MENTION. finalizeCampDoc derives responsive/unprompted. The model never writes the label.

UI STATES (one control row in CampDocGenerator; one primary per state; destructive actions live ONLY in the overflow menu, whose confirm names what gets deleted):
- Document exists: Download PDF (primary), Print, quiet Regenerate; overflow: Edit inputs, Delete draft & document.
- Draft with confirmed extraction: Generate document (primary), Edit inputs; overflow: Discard draft.
- Mid-flow draft (no confirmed extraction): Edit inputs (primary); overflow: Discard draft.
- No draft: the single Generate prep doc entry in the card header.

DEV HARNESS — scripts/camp-doc-harness.ts: records a school's full generation context from the DB into a fixture (--record), then regenerates DB-free and diffs the document section by section. It mirrors endpoint validation exactly (retry once, then hard-fail without writing output). Fixtures are gitignored (they carry real coach email bodies); re-seed locally with --record.

### Camp Prep Design Rules (August 2026 — binding)

These rules are the stretch's real output; they bind future work on any generated document:

- ECHO OVER DERIVE. The document echoes family-authored fields and CRM data; it does not assert derived external facts. Every defect in the stretch landed in a section asserting facts about the outside world; the echo sections never failed once. THE FIT (attrition/profile-gap) was cut for this reason and returns in v2 only with the guards below.
- EVIDENCE-EMIT-AND-COMPUTE. When model output must satisfy a hard constraint, the model emits EVIDENCE and code computes the conclusion — plan day labels (ISO date + descriptor in, formatted label out) and touchpoint classification (verbatim quote or NO_PRIOR_MENTION in, responsive/unprompted out). Prose classification rules drifted three times (5.1, 5.6, 6.2) before this pattern held.
- FAIL-CLOSED ON ABSENCE. Empty and failed are distinct everywhere: the thread-load guard refuses to generate when the contact_log fetch errors or mismatches, and a failed recruiting_preferences read degrades calibration (no absence assertion, no ranking) while an EMPTY field may honestly state that no preference is on record. A failed lookup never becomes a confident "there is none." THE SHARPEST SHAPE, AND THE ONE TO SCAN FOR: A READ WHOSE EMPTY RESULT MEANS "NO PREFERENCE RECORDED" MUST DISTINGUISH THAT FROM A FAILED READ, BECAUSE THE TWO ARE OPPOSITE CLAIMS. fetchCoachFamilyState discarded its error and returned an empty map — and an empty map means NOBODY IS HIDDEN, so a failed read rendered identically to a family that had hidden no one. It failed in the LEAKING direction: every coach the family had asked not to see reappearing in every recipient picker, silently, with the UI reporting nothing. Sparse per-family tables are the whole risk class, because absence IS their default: camp_family_status, coach_family_state, camp_proposal_decisions and anything like them. The read now THROWS, and the caller leaves the previous lists intact rather than rendering an un-hidden roster — when you cannot tell whether a preference exists, showing the last known answer beats asserting there is none.
- ABSENCE-PROSE RULE. No generator reads entities out of a research prose field that EXPLAINS an absence (not_found_reason and its class) — an explanation is not a data source. Documented on ResearchSnapshot in src/lib/school-research.ts.
- HARNESS GATE. Any change touching the camp-doc prompt runs BOTH fixtures through scripts/camp-doc-harness.ts before ship and must hold the classification gate: Middlebury 1 unprompted of 8 (the 2026-04-08 May-camp invite), Colby 0 of 7.

### Tenancy Architecture — T1 (August 2026, current state)

T1 (deployed 2026-08-14, code at 8a07a04, DB migrated at the C6 architect sitting) turned the single-family app into a family-scoped multi-tenant system. Acceptance PASSED with both families: every family table sealed, three direct-id doc probes returned Doc not found for Testerson, and the Almond regression was exact.

THE LAYERS:

1. DATA — families / users / players plus family_id NOT NULL + FK + index on all 24 pre-existing family tables, with family RLS (Section 4). users carries a column-level UPDATE grant on display_name only.
2. THE HELPER + TRIPWIRE — app.current_family_id() is SECURITY DEFINER, pinned search_path, NOT executable by service_role. Every family_id column DEFAULT is the helper expression, so a service-role insert that forgets explicit family scoping fails LOUD instead of writing an orphan row. Designed tripwire, not a bug.
3. THE WRAPPER — src/lib/tenant-db.ts is the ONLY legal source of a service-role client: familyAdmin(familyId) auto-scopes every family-table verb (family_id filter on reads/updates/deletes, family_id injected on inserts/upserts, a mismatched explicit family_id throws); catalogAdmin() passes catalog tables through and refuses family tables; rawService() is storage/auth/rpc plumbing only (family-table access still refuses). Unclassified tables refuse until added to an allowlist. player_profile and strategic_skips are BLOCKED (frozen since C6, dropped at C7 — nothing new may read them). Enforced twice: runtime refusal in the wrapper + the prebuild fence scripts/check-tenancy-fence.mjs, which fails the build if src/ constructs a raw service client outside the allowlist (the eslint no-restricted-imports rule exists but the repo eslint toolchain is non-functional — the prebuild script is the enforced layer).
4. THE ROUTES — ~25 user-facing routes/pages run on the RLS-enforcing user client via getFamilyContext (src/lib/require-family.ts). SSE/LLM generators, triage routes, bulk-import, and gmail flows keep service role via familyAdmin(familyId). The sendgrid inbound webhook is now PER-FAMILY: it resolves the family from the envelope and runs familyAdmin(familyId). ALL FOUR content crons — camp-discovery, coach-roster-sync, gmail-sync and summary-refresh — run familyAdmin(ALMOND_FAMILY_ID); NONE runs catalogAdmin (an earlier version of this section said roster-sync and camp-discovery did, and that was wrong). Only quarantine-reaper uses rawService. The camp-discovery pin is load-bearing, not leftover — see SCHEMA AHEAD OF CODE at the top of this section. get_voice_references is called with p_family_id via the wrapper's introspectable scope (scopeOf).
5. STORAGE — GRANDFATHERED, no objects moved: 26 legacy objects under five prefixes (resumes, call-prep, other, transcripts, camp-prep) covered by a legacy policy scoped to family #1 via the helper; all NEW writes go to family-prefixed paths ({family_id}/call-prep, {family_id}/camp-prep, {family_id}/resumes, ...).

STILL PENDING, AND WHAT HAS CLEARED:

- C7 has NOT run — player_profile and strategic_skips still exist in the DB, frozen and wrapper-blocked. Nothing reads player_profile post-deploy; do not propose reads of it.
- T2 SHIPPED (2026-08-18, Shape B) and the hard privacy blocker is CLEARED. schools, coaches, camps, camp_school_attendees and camp_coach_attendees became FAMILY tables carrying family_id, which closed the T1 acceptance finding — Testerson's UI had shown the Almond relationship posture (tier, stage/board placement, status, last_contact, admit likelihood, videos_sent + reel title, RQ status, primary-coach flag, active-vs-bench) because those lived as columns on shared tables.
- PER-FAMILY EMAIL ROUTING SHIPPED (see Email Boundary — Current State). What remains Almond-hardcoded is the four content crons; the camp-discovery pin specifically must NOT be removed yet.

### Tenancy Process Rules (August 2026 — permanent, binding)

Forged during T1; they bind every future DB-touching stretch:

- THE CLOSURE IS PASTED BEFORE THE SQL. For every chunk, the Section 15 cascade closure for the tables that chunk touches goes into the sitting BEFORE any DDL is emitted. Section 15 makes it cheap; this step is what makes it happen — E2's blocker analysis was wrong not because the graph was unavailable but because nobody thought to ask it, and a rule that says "consult the catalog" is only as good as the moment it gets consulted. One paste. If Section 15 reports UNAVAILABLE, run the closure by hand against pg_constraint; do NOT substitute a reading of the migration files.
- ONE SOURCE OF SQL TRUTH. The architect chat emits what Randy runs. Claude Code runs NO SQL against the database, ever. Anything emitted that was not confirmed run is superseded state that must not be assumed.
- PRECONDITIONS ARE PROVEN BY COMMAND OUTPUT before any sitting begins — a T1 sitting aborted because a deploy commit existed only as a description. THE RULE BINDS RECON EXACTLY AS HARD AS IT BINDS A SITTING, AND IT INCLUDES CLAIMS ABOUT CODE. A number without its query output beside it is an assertion, not a fact. AN INVENTORY OF CALL SITES IS A PRECONDITION: proven by a mechanical sweep pasted in full, never by a grep read selectively — the E2 recon named 16 of ~40 is_primary sites and missed the entire generator surface, seven prompt-building sites that stamp PRIMARY into a document and would have raised neither a compile error nor a runtime error when they silently stopped. A REPORT THAT MIXES OBSERVED OUTPUT WITH INFERRED STRUCTURE IN ONE VOICE gives the reader no way to tell them apart, so mark every claim with how it was obtained or do not make it. And a schema fact read from a MIGRATION FILE is an inference, not an observation: T1, T2 and E1.5 all ran SQL through the architect chat, so supabase/migrations/ is a PARTIAL RECORD of the database. Ask the live catalog.
- DROPS AND RENAMES TARGET EXACT NAMES discovered from the live catalog — never if-exists, never design-time inference. A ghost policy survived a table rename under its pre-rename name and drop-if-exists silently skipped it.
- SQL AND PROSE SHIP AS CLEANLY SEPARATED BLOCKS; every block parse-verified end-to-end (two truncated emissions last stretch).
- TRUST A REAL ROW-SELECT over PostgREST/schema-cache readings.

### Email Boundary — Current State (August 2026)

The inbound-email subsystem, the final phase of the multitenant story. T1's recon called it the most tenancy-hostile part of the app; T1 and T2 left it Almond-hardcoded behind TODO(email-boundary) markers. It is now per-family, and this section is the current-state record.

THE PIPELINE, end to end:

1. A coach sends. The message reaches the family's own mailbox and is forwarded to their inbound address at in.finnsoccer.com. SendGrid Inbound Parse is configured DOMAIN-WIDE (confirmed from the platform's Edit Host and URL dialog: email sent to ANY address in the receiving domain is processed and POSTed), so a newly minted address receives mail the moment its row exists — no platform configuration per family.
2. ROUTING (src/lib/inbound-routing.ts) resolves the family from the envelope recipient against family_inbound_addresses. Exactly one active match routes; zero, several, retired, or unparseable REFUSE AND QUARANTINE.
3. Gmail forwarding-confirmation capture runs after routing (so the code belongs to a known family) and before the non-SR drop that used to discard it.
4. FamilyIdentity (src/lib/family-identity.ts) loads once per message and is threaded into every parser.
5. INGESTION (src/lib/sr-inbound.ts) runs the SR pipeline: SPF/DKIM, forward unwrap, outbound-CC intercept, SR drops, school and coach matching, family-scoped dedup, insert, then the fire-and-forget cascade (classification, camp extraction, last_contact, conversation summary, stage floor).

THE BINDING PRINCIPLE — ENVELOPE FOR ROUTING, HEADERS FOR IDENTITY:

- envelope.to is the TRUE SMTP recipient and the ONLY routing input.
- The To HEADER names the ORIGINAL mailbox under forwarding and is NEVER a routing input at any layer.
- envelope.from is REWRITTEN by Gmail on forward (the caf_ return path) and is never a sender-identity input.
- The From HEADER survives forwarding intact and is THE sender-identity input — direction detection and the verification sender gate both read it.

Proven on live forwarded mail by the envelope probe (2026-08-19): envelope.to carried finn@in.finnsoccer.com while the To header read finnalmond08@gmail.com. Routing on the header would have mis-filed every forwarded message.

QUARANTINE vs ORPHAN — different states, different homes, do not conflate:

- QUARANTINE = we do not know WHICH FAMILY. Lives in inbound_quarantine with NO family_id, RLS on with zero policies (service-role only, unreadable by any family). Admin-only at /admin/inbound. Writes NO contact_log row. Replay re-runs the IDENTICAL ingestion path including dedup, so a replayed message that also arrived another way collapses instead of duplicating. 30-day retention enforced by a daily reaper.
- ORPHAN = we know the family, not the school. Lives in contact_log with family_id set and school_id null, excluded from every generator read (unattributed content must never reach the judgment layer), and visible to the family at /unmatched with attach or dismiss, plus a Get Recruited banner that appears only when the count is above zero.

REFUSE, NEVER GUESS. There is deliberately no content-based routing fallback. Guessing a family from a matching school name would mis-file precisely on coaches who recruit two families' players — the exact failure the boundary exists to prevent.

AUTO-ADD. A coach reaching out IS engagement: inbound mail naming a school not on the family's list adds it from the catalog at C-tier with provenance (origin inbound_auto, an evidence note, the triggering contact_log id, the discovery linkage). Guarded by HIGH-confidence evidence only (SR's structured school assertion or a catalog domain match — never the subject-word fallback or the loose substring rules), exactly-one-or-refuse catalog resolution, and a five-per-day ceiling. Undo RE-TIERS to the bench, never deletes: under Shape B the schools row IS the relationship and contact_log cascades from it, so deleting would destroy the message that justified the add.

THE FOUR-STEP FAMILY STANDUP. Onboarding a family is exactly four things, and /admin/inbound is where it happens:
1. families row
2. users row (bound to the family)
3. seeded questions (the T1 create-family script, Amendment D)
4. minted inbound address (src/lib/mint-inbound-address.ts — slug plus a SIX-character suffix from a 31-symbol unambiguous alphabet; the address is the ONLY routing credential, so a guessable one would let anyone inject fabricated coach mail)

The family then completes THREE REQUIRED setup steps, surfaced at Settings, Your Inbox: forward mail to the address, return the Gmail confirmation code (captured automatically and displayed the moment it lands), and CC the inbox address on SportsRecruits sends. The third is REQUIRED, not a tip: SportsRecruits only notifies on CC'd messages, so without it a family's own outreach never arrives and every read of the conversation sees one side.

STILL OPEN: per-family OAuth (forwarding is the bridge; Almond's Gmail OAuth path is unchanged); a receipt heartbeat so ingestion health can measure webhook REACHABILITY rather than mail that FILED; per-family school domain and alias knowledge staying unshared (catalog-economics phase); THE FORWARDING PATH IS SR-ONLY — a direct coach email is routed, authenticated and then discarded with NO row of any kind, so the family sees nothing (see Designed But Not Built); and the admin audit columns exist but NO write path populates them (see SCHEMA AHEAD OF CODE).

### Generator Persona — Identity Derivation (August 2026 — binding)

Every builder that writes AS the player takes identity from the family's players row through src/lib/drafting-persona.ts. Nothing about a player is a literal any more. THE INCIDENT: on 2026-08-19 a second family's draft introduced their child as Finn Almond, a 2027 left wingback at Albion SC Boulder County — name, position, grad year and club all belonging to another family's son.

TIER 1 covered the outreach and reply drafts. TIER 2 extended the same derivation to the campaign generator and the personalizer, so both paths build the persona from the family's own players row rather than from prompt literals.

players.club exists and carries a binding contract, quoted from the column comment: the club is family-authored, generators ECHO it, and they MUST NOT infer, abbreviate, or invent a club when it is empty — an empty club means the draft omits the credential entirely. The same conditional-emission rule governs position and grad year: a field that is absent is OMITTED, never guessed. Age is DERIVED from grad_year and never stored.

### Subject Guard and the Persona Coverage Map (August 2026 — binding)

ENFORCE IDENTITY IN CODE, DON'T ASK FOR IT IN PROSE. On 2026-08-19 the draft prompt carried a CORRECTLY templated subject for the family and the model emitted a different family's child anyway, because a dozen persona instructions elsewhere in the same prompt outweighed one example. Prose instructions do not hold a line. Where identity can be enforced structurally, enforce it: src/lib/subject-guard.ts COMPUTES the outreach subject from the family's players row, and the model's proposal is treated as evidence, never as content.

A proposal that does not name this family's player raises identityWarning, which the draft UI renders as a banner naming the SPECIFIC risk — this draft may name the wrong player, the subject was corrected, read the body before sending. Non-blocking by design: the guard can false-positive on a diacritic or a nickname, and a false positive must never lock a family out of their own outreach. A warning that only reaches a server log is the fail-secret pattern again, which is why the banner exists at all.

THE COVERAGE MAP — where the guard reaches and where it does not:

- FRESH INDIVIDUAL DRAFTS: covered. The model proposes a subject, code compares it to the canonical one, and a mismatch surfaces.
- REPLY MODE: NOT covered, correctly. Replies return body-only with no subject, so parsed.subject is undefined and the guard returns early with no warning. This is right behaviour, not a bug — do not read its silence as a gap.
- CAMPAIGN PATH: NOT covered, and this is the HIGHER-risk surface, not the lower one. The campaign subject is code-built and the generator returns body only, so there is NO model-proposed subject to compare against — no signal exists for this detector to work from. Campaigns send to many coaches at once, so one leaked body reaches an entire showcase's staff rather than one person. NAMED DESIGN QUESTION, not yet built: what detector works when there is no proposal to check? The instinct is a body scan for a person-name that is not the family's player, run in code before the draft renders, but that needs real thought about false positives on coach names, school names, and the player's own teammates. Do not build it without that thinking.

### Schema Change Rules (August 2026 — permanent, binding)

- FOREIGN KEYS SILENTLY BREAK POSTGREST EMBEDS. Adding a foreign key between two tables that ALREADY have one makes every PostgREST embed between them AMBIGUOUS — PostgREST refuses the query with PGRST201 rather than choosing. Before any chunk adds an FK, GREP FOR EMBEDS between those two tables (the alias-colon-table-parens form) and either disambiguate them with the explicit constraint name in the same ship (school:schools!contact_log_school_id_fkey) or do not add the FK. Learned 2026-08-19 the hard way: schools.origin_contact_log_id (auto-add provenance, added in the email-boundary Chunk A) created a second contact_log to schools relationship and made the ENTIRE conversation history invisible across the app — the /schools signal column and every school-detail timeline — while all 433 rows sat intact in the database and a service-role query saw them perfectly.
- THE FAILURE MODE IS WHY THE RULE EXISTS, not the ambiguity itself: the broken query lived in code that discarded the error (if not error and data), so a hard HTTP 300 rendered as a designed cold-start empty state. Client-side PostgREST calls go straight to Supabase, so nothing appeared in Vercel logs; the camp-doc harness uses plain selects with no embeds, so it stayed green. NO EXISTING GATE COULD HAVE CAUGHT IT.
- DROP-SAFETY IS ABOUT REFERENCES, NOT ROWS. An empty table can still have readers. camp_coach_attendees held ZERO rows for its entire life, so E1.5 chunk C dropped it rather than migrating it, and the chunk was judged independent and safe to run any time on the strength of that count — but useRealtimeData still SELECTed it on every camps fetch, which would have 404'd the entire camps view the moment the drop landed. A TABLE DROP NEEDS THE SAME CODE SWEEP AS A COLUMN RE-POINT: grep for every reference before dropping, because the type checker has no idea a table is gone and a row count says nothing about who reads it. Same family as the FK-breaks-embeds rule — the schema moved under code that still compiles.
- REVERTING CODE DOES NOT FIX A SCHEMA-CAUSED BREAK. The FK landed with the DB chunk, before the code deploy; the old code contained the identical embed string. When a regression appears right after a deploy, check whether the deploy could actually have caused it before rolling back.

### E1.5 — Camps Are Shared (August 2026, current state)

Camps moved from per-family rows to the shared catalog. A camp, its dates, its host and the schools attending it are FACTS ABOUT THE WORLD; what a family thinks about a camp is not. That split is the whole design.

THE TABLES, verified against the live schema 2026-08-21:

- camps — CATALOG. family_id DROPPED. host_school_id points at discovery_schools; all 75 rows resolve to a catalog id.
- camp_school_attendees — CATALOG. family_id DROPPED. school_id points at discovery_schools; all 43 rows resolve. Carries a UNIQUE index on (camp_id, school_id) — collisions were impossible while camp_id was per-family and are EXPECTED now, so writes upsert with ignoreDuplicates rather than erroring at whoever is second. One row is the correct outcome.
- camp_proposals — CATALOG, and its host_school_id RE-POINTED with camps. All 35 distinct hosts resolve to discovery_schools. Proposals and camps keying on different domains would be the duplicate-generating loop wearing a second hat.
- camp_coach_attendees — DROPPED (PGRST205 confirms). It never held a row, so it was dropped rather than migrated.
- camp_family_status — UNCHANGED, still a FAMILY table with family_id, and it is THE per-family layer. Status, and camp_family_status.notes for a family's own thinking about a camp. There are deliberately NO per-family override fields for dates or cost: two sources of truth for a date is worse than a review queue.

ALL THREE FKs ARE ON DELETE RESTRICT against discovery_schools (run and verified at the architect sitting; not independently checkable from PostgREST). CASCADE would have meant deleting one catalog row silently destroying every family's camps and proposal history for that school.

THE PRE-IMAGE TABLES HOLD THE ONLY COPY OF family_id. Do not drop them casually:

- camps_repoint_preimage — 75 rows (camp_id, old_host_school_id, family_id, captured_at)
- camp_attendee_repoint_preimage — 43 rows (attendee_id, camp_id, old_school_id, family_id, captured_at)
- camps.notes_preimage — a COLUMN, not a table; the rollback for the notes promotion.

Both tables were captured in the SAME SITTING as the re-point, asserting against the live count in the same transaction — camp-discovery runs DAILY and adds camps, so a snapshot taken days ahead would leave the gap with no rollback. Retention: a full week past acceptance, not deleted on green.

CAMPS ARE ADMIN-EDITED. A camp's host, dates and cost are claims about the world, and once camps is shared one family's edit reaches into every other family's planning. CampDetailClient's host editor is behind requireAdmin, resolved server-side. Follows from ACCEPT IS ADMIN-ONLY.

WHAT THE CODE HAD TO LEARN (src/lib/camp-host.ts is the one place that knows):

- READS ARE BIDIRECTIONAL — they accept either id form, so they were correct before and after the re-point without consulting a flag. That is what made the SQL-then-deploy window safe rather than an outage: a read gated on a flag breaks when flag and schema disagree, and during a migration they WILL disagree for the length of a deploy.
- WRITES consult CAMPS_KEYED_ON_CATALOG, now TRUE.
- HOST RESOLUTION FALLS BACK TO THE CATALOG. Family row first (carries posture), catalog second (name only). 73 of 75 camps rendered host Unknown for a family that does not track the host, while the host sat in discovery_schools the whole time.
- CampWithRelations.hostSchool.category IS NULLABLE. It used to default to 'C' for an unresolved host purely so the Nope filter had something to compare — an invented tier claiming a relationship that did not exist. Null now, and the tier badge is simply absent.
- MY CAMPS GATES ON camp_family_status, nothing else. Camps with no status row sit under a separate Other camps we know about browse. Almond: 24 tracked, 0 browse. Testerson: 0 tracked, 75 browse.

VERIFIED THROUGH THE SURFACE, both families, 2026-08-21: Almond's calendar is byte-identical to before the re-point (Up next 7, Past and done 20, real chips, tier badges present, no browse section), and TESTERSON'S VIEW WAS CHECKED IN THE UI BY RANDY — real host names, no fabricated chips, the browse split renders. Do not re-open this as an unverified gap.

### New Binding Rules (August 2026 — permanent, binding)

Each earned this week; the incident that produced it is named.

- A BLOCKER ANALYSIS FOLLOWS CASCADE CHAINS, NOT DIRECT REFERENCES. Deleting a row does not only test the foreign keys pointing AT that table — it tests every foreign key pointing at every table the delete CASCADES INTO, recursively. Enumerating direct references and stopping is the grep rule one level deeper: it tests the hypothesis you thought of. Measured on schools: one direct blocker (campaign_schools.school_id) and TWO transitive ones (campaign_schools.coach_id via the coaches cascade, campaign_schools.contact_log_id via the contact_log cascade), and only the direct-reference sweep found the first. The transitive pair is where the surprise lives, because nothing in the delete statement mentions those tables. THE COROLLARY FOR MIGRATIONS: a chunk that changes an ON DELETE action, drops a cascading FK, or re-points a cascading table CHANGES WHICH BLOCKERS FIRE, in both directions — E2's re-point removes the coaches link, which stops one blocker firing on a school delete while leaving it firing on a coach delete. Compute the closure before the sitting, not during it.
- THE FK GRAPH COMES FROM pg_constraint, NEVER FROM THE MIGRATION FILES. Fourteen of the forty-seven live tables have NO create-table statement in supabase/migrations/ — coach_family_state, prep_docs, players, school_research, catalog_proposals, families, users and the rest all arrived through the architect chat — and the files still describe tables that were renamed (camp_finn_status, call_prep_docs) or dropped (camp_coach_attendees). A cascade closure built from the files is therefore both INCOMPLETE and STALE, and it reads authoritative either way. It is a hypothesis to check against the catalog, never the answer.
- A DISTINCT OVER ROWS ENUMERATES WHAT EXISTS, NEVER WHAT IS PERMITTED, AND THE TWO DIVERGE SILENTLY. Same family as the grep rule, one level down: a grep enumerates the hypothesis rather than the population, and a value distribution enumerates the population rather than the DOMAIN. A select of role from coaches returned five values and was reported as though it were the vocabulary; the CHECK permits six, and the missing one — 'Interim Assistant Coach' — has ZERO ROWS, so no query over data could ever have shown it. The conclusion drawn (that Goalkeeper Coach is absent) happened to be right, reached by the method that had just produced a 16-of-40 inventory. WHEN THE QUESTION IS WHAT IS ALLOWED, ASK THE CONSTRAINT, THE ENUM OR THE TYPE — never the rows. The inverse bites too: a UI's allowed-values list can drift ABOVE the constraint (api/gmail-partials/[id] offers three roles the CHECK rejects), and no row will ever reveal that either.
- A RULING THAT CONTRADICTS A VERIFIED RECON MUST BE RECONCILED BEFORE IT BECOMES SQL. Chunk F1 v1 aborted on a column that did not exist, because a ruling asserted schools.primary_coach_id was already present and set on 30 schools while the recon had verified, with output, that it existed nowhere in the schema or the codebase. The recon was right and had said so precisely; the ruling reached the architect chat anyway. THE ABORT WAS THE GOOD OUTCOME — it failed loudly at the DDL rather than quietly in the data. The reconciliation step is cheap and belongs BEFORE the SQL: when a decision and a verified finding disagree, one of them is wrong, and finding out which costs one query.
- VERIFY THE ASSEMBLED ARTIFACT, NOT THE SOURCE TEXT. A grep tests the pattern you thought of; rendering tests what ships. (call-prep-prompt.ts carried another family's child's transcript past an audit because the literal read LWB, not the spelled-out position the grep looked for.)
- THE UI IS THE ASSEMBLED ARTIFACT OF A ROUTE. Companion to verify-the-assembled-artifact, and earned twice in two days. Acceptance exercises SURFACES, not endpoints: an endpoint test passing says nothing about whether a person can reach the behaviour. The catalog-proposal accept endpoint worked while its form had never been clicked, and the add-a-school entry point was rendering inside a block that only appears after a family clicks Find more — so the one person who needs Can-t-find-your-school, the person who has already failed to find their school, could not see it. Both were found only by driving the UI. A route returning 200 is evidence about the route.
  THE SHARPEST EXAMPLE, and the one to remember: the catalog link control had a STALE-RESPONSE RACE. Typing Wisconsin displayed the results for wi — Baldwin Wallace, Hartwick, Lewis — because every keystroke fires a request, replies do not arrive in send order, and an earlier slow response overwrote a later one. The endpoint answered every query it was given correctly. What shipped was a list that LOOKED AUTHORITATIVE WHILE ANSWERING A SUPERSEDED QUERY, in the one control whose entire job is picking the right school out of near-identical names. Any type-ahead that drives a consequential choice needs a sequence guard, and no endpoint test will ever show you it is missing.
- POSTGREST CAPS AT 1000 SILENTLY. It returns 1000 rows with no error and no exception. Any read that believes it got everything must assert rows.length === count. discovery_schools is the only table over 1000 today (1066; second largest is contact_log at 433) — and that changes with the catalog phase.
- PROPOSE-DON'T-CREATE FOR CORRECTIONS TO SHARED DATA. A family's edit applies to their own layer immediately and raises a proposal for review. A wrong shared coach EMAIL propagates into domain promotion and auto-add and mis-routes other families' mail.
- ACCEPT IS ADMIN-ONLY; DISMISS IS A PER-FAMILY HIDE. Dismissing is a preference; accepting is a claim about the world.
- DOMAINS ARE POPULATED ONLY FROM OBSERVED COACH EMAIL ADDRESSES, never inferred from a website host. Measured on Almond's list: 48 of 55 athletics page hosts DIFFER from the institutional mail domain (gocaltech.com versus caltech.edu, mitathletics.com versus mit.edu). The array is multi-valued by necessity — Rochester's coaches use two.
- A CANDIDATE LIST CAN BE CONFIDENTLY WRONG. Corroborate a proposed match against independent evidence; do not rank it against its siblings. (Washington University's correct answer, Washington U. St. Louis, never appeared among the bridge's candidates at all — so any argument about which candidate was best was doomed before it started.)
- FAIL TOWARD THE RECOVERABLE ERROR. Visible noise in one queue beats invisible suppression across every future family.
- WHENEVER A TABLE IS SHARED, EVERY READ OF IT NEEDS A FAMILY DIMENSION OR AN EXPLICIT REASON IT DOES NOT. Three separate defects in one week were the same shape — a family-blind filter over a shared table, invisible while only one family existed. (1) shouldSkipProposal consulted camp_proposals.status, so one family's rejection suppressed a camp for everyone. (2) camp-discovery skipped a URL if ANY pending proposal existed for it, so one family's queue suppressed another's one layer up. (3) the review queue filtered status pending with no family dimension, so after the first union cron run both families saw all four proposals. An acceptable reason not to carry a family dimension is a real one: discovery_schools is the same catalog for everybody, not_found_log is telemetry, inbound_quarantine exists precisely because the family is not yet known. Scoping by proxy also counts when it is stated — a read keyed on school_id IS family-scoped because schools is a family table — but it must be written down, because the next reader cannot tell a deliberate omission from an oversight.
- A FABRICATED DEFAULT IS A CLAIM. The general rule behind the D3, the Interested chip and the Unknown host. "Unknown" was WRONG because we KNEW — camps are shared now, the host sits in the catalog, and rendering Unknown withheld a fact we held. "Unclassified" is RIGHT because we genuinely DO NOT know a proposed school's division. IF WE HAVE THE FACT, SHOW IT; IF WE DO NOT, RENDER THE ABSENCE HONESTLY AND NEVER INVENT A VALUE TO MAKE A FILTER WORK. The last clause is the trap: camps.ts defaulted an unresolved host to category 'C' purely so the Nope filter had something to compare, and that invented tier then claimed a relationship the family did not have. The clean split is CATALOG FACTS RENDER, FAMILY POSTURE RENDERS ONLY WHEN IT EXISTS — a host's name always shows, its tier badge appears only when the family has a row for that school.
- BEFORE OFFERING TO CREATE, CHECK WHAT THEY ALREADY HAVE. A near-match step is only as good as the set it searches. The add-a-school flow checked the CATALOG for duplicates and not the FAMILY'S OWN LIST, so a family holding Trinity College (CT) from their intake starting list typed Trinity, was shown catalog candidates, said none matched, and got a SECOND row on the same catalog school. The unique index on (family_id, discovery_school_id) could not be created until it was undone. Every path that can create or link a relationship row checks the family's list first, and the answer when it hits is not create but here-it-is.
- READ WHAT THE QUERY RETURNS PER FAMILY, NOT THE RUN SUMMARY. All three of the above were found the same way, and none was visible in a status line: the union cron reported 20 pairs, 4 proposals, 0 errors, which was entirely accurate and entirely beside the point. A CORRECT SUMMARY OVER A WRONG QUERY IS THE SHAPE TO EXPECT, because the summary counts what the query returned, not what it should have returned. Run the read once per family and compare.

### Designed But Not Built (August 2026 — decisions, not plans)

Recorded so a future session does not rediscover them. These are DECISIONS already made and designs already settled; only the code is missing.

- CATALOG ECONOMICS. The direction is a shared catalog for schools, coaches and camps, staged as I then E1 then E1.5 then E2. Agreed splits: is_active and archived state are SHARED, hidden_at is PER-FAMILY, primary_coach_id lives on schools. Chunk I ships FIRST and alone, before any camp work and before any union-of-families scan set (see SCHEMA AHEAD OF CODE).
- E1 ASSERTED-DIVISION QUESTION — CLOSED 2026-08-21, and the answer is clean. schools.division was NOT NULL with a CHECK until 08-20, so every school ever added had to be given one of five values whether or not anyone knew it — which is why the old off-universe add fabricated a D3. Evidence collected free during E1's linkage pass: across ALL 65 of Almond's schools, now every one linked to a catalog row, the stored division matches the catalog's in EVERY case. ZERO disagreements, including the five colloquial rows (DU, Berkeley, VA Tech, Cal Poly SLO, Wisconsin Madison) whose divisions had never been checked against anything. The invented-division risk did not materialise in real data.
- E1 LINKAGE STATE — COMPLETE. Almond is 65 of 65 linked (was 33), injectivity clean, enforced from 2026-08-21 by uq_schools_family_discovery. The last five colloquial rows went through the general link control, which is the mechanism that replaces one-off SQL: unlinked schools recur by design, from auto-add, family proposals, imports, and rejected proposals that stay on the list. The nameKey bridge splits Almond's remaining 32 into 19 auto, 2 ambiguous, 11 unmatched. SJSU is verified GENUINELY ABSENT from the catalog (full paginated 1066-row scan, diacritic-folded — the catalog contains no accented characters at all), so it stays unlinked with a recorded reason rather than getting an invented row. Washington University resolves to Washington U. St. Louis on CAMP-NAME evidence, not on name matching.
- CATALOG COMPLETENESS IS OPEN, NOT CLOSED. Verified division counts: D3 394, D1 207, NAIA 178, D2 174, JUCO 113. Gaps concentrate in D2, NAIA and JUCO, and SJSU missing from a near-complete D1 set implies SOURCE HOLES rather than a short tail. An audit against a reference list of NCAA/NAIA/JUCO men's soccer programs is a BLOCKER on E2, not a question for it — a family whose child targets D2 or JUCO hits this in their first minute.
- THE FORWARDING PATH IS SR-ONLY. A direct coach email — sent straight to the family's mailbox and forwarded, rather than routed through SportsRecruits — is routed, authenticated, and then DISCARDED with no row of any kind: no contact_log row, no orphan, no quarantine. It is a fourth state with no name, and its log label ([orphan-drop]) is misleading because nothing is stored as an orphan. What the family sees is NOTHING. The sender-resolution branch that fixes it rides with E4.
- CAMP-DISCOVERY RESUMABILITY — RESOLVED 2026-08-20, kept here for the lesson. THE HISTORY: the cron looped flat over (family, school) pairs inside a 300s function and was killed on 13 of its first 16 scheduled runs — every Saturday from 2026-05-09 to 08-01 — while a killed function never reaches its completion write, so each death left a row reading running forever in a table nobody opens. The failure was not that it was slow; it was that it could make no progress across a kill and could not say it had stopped. THE FIX, in three parts. FAIRNESS: interleave round-robin across families so an interrupted run costs every family proportionally rather than starving whoever sorts last (measured on the real 7/13 split, a halfway kill went from A 7 of 7 and B 3 of 13 to A 5 and B 5). RESUMABILITY: order by a least-recently-scanned bookmark and run inside a time budget of 240s, stopping cleanly before the ceiling and stamping each unit only AFTER it completes, so a unit cut off keeps its old bookmark and leads the next run. VISIBILITY: three outcomes are now distinguishable — success means the whole set was covered, partial means we stopped on budget and records pairs_remaining, and a run killed anyway stays running and is reaped to failed by the next run's startRun sweep. That sweep corrected 25 rows that had misreported for months. THE BOOKMARK GRAIN IS DELIBERATELY TEMPORARY. It lives on schools.camp_scan_last_at, so the unit is a (family, school) PAIR and the cost scales with FAMILIES rather than with the world — two families tracking Middlebury run two identical searches. When camps move to the catalog (E1.5/E2) the unit becomes the DISTINCT SCHOOL and the bookmark migrates to discovery_schools.camp_scan_last_at. Everything in src/lib/scan-budget.ts is grain-indifferent for exactly that reason: a unit is an opaque item plus read-bookmark and stamp callbacks, so the migration is a change at the call site and nowhere else. DO NOT add pair-specific machinery to that file. THE DUPLICATION SERIES is now recorded on every run as duplicated_work (pairs minus distinct schools). Today it is 1 of 20 and says nothing; at ten families it is the number that says how much moving camps to the catalog buys, and the series has to exist before the answer is needed. STILL TRUE AND STILL THE CEILING: cost is roughly 16 seconds per pair, so a 240s budget covers about 15. At 50 families the daily budget will not cover the set and the answer is NOT a bigger budget — it is not doing the same work N times.
- CAMPS UI CLEANUP, PARKED — three known items, deliberately deferred rather than forgotten. (1) CAMPS ARE HARD TO FIND: they live under Calendar, and they belong on Get Seen, which is where a family goes to think about being seen. (2) CAMP DATES DO NOT SHOW THE YEAR — fine when every camp was this season, misleading now that the shared catalog spans multiple years (the current set runs 2026 into 2027). (3) THE BROWSE LIST HAS NO PAST/FUTURE BREAK the way the tracked view does, so a family browsing Other camps we know about sees expired camps mixed with upcoming ones. None is a correctness defect; all three are worth one pass together rather than piecemeal.
- THE LIVE CATALOG IS THE SOURCE OF TRUTH; THE REPO REGENERATES FROM IT — DECIDED 2026-08-22, do not relitigate. T1, T2, the email boundary, E1.5 and every E2 chunk ran through the architect chat, so 14 of the 47 live tables have NO create-table statement in supabase/migrations/ (coach_family_state, prep_docs, players, school_research, catalog_proposals, camp_family_status, camp_proposal_decisions, families, users, the routing tables, both repoint preimages), and the files still name tables that were renamed (camp_finn_status, call_prep_docs) or dropped (camp_coach_attendees). THE CONSEQUENCE IS NOT UNTIDINESS: a schema question cannot be answered from the repo, and worse, it can be answered WRONGLY with full confidence — which is exactly how E2's blocker analysis missed campaign_schools.contact_log_id. THE REJECTED OPTION was backfilling the missing DDL as squashed migrations: it buys accurate HISTORY at real cost, and history is not what failed. What failed was answering a PRESENT-TENSE question from a stale artefact, and a backfilled repo would look authoritative and drift again at the very next sitting, because the architect chat emitting schema is the house model and is not changing. SO THE REPO IS MADE HONEST ABOUT WHAT IT IS: a code repo whose schema knowledge is REGENERATED, not authored. Section 15 (the FK graph) is the first instance. THE DIRECTION, when it is cheap: extend the same mechanism to full table definitions — columns, types, nullability, defaults, constraints, indexes, policies — regenerated into the doc from the catalog. NOT NOW, NOT IN E2.
- SUPABASE/MIGRATIONS/ IS NOT A ROLLBACK MECHANISM AND NEVER WAS. Stated plainly because the alternative is someone believing it during an incident: a third of the live schema is absent from it, so replaying or reverse-engineering those files reconstructs a database that has never existed. Rollback comes from what a chunk captures FOR ITSELF — the pre-image tables, the retention window, the assertion in the same transaction — which is why E1.5 and E2 both build their own and keep them a week past acceptance. The files are a partial changelog, useful for reading intent; they are not a restore path.
- ROLE_SOURCE AND ENDOWED_TITLE — two columns the scraper should write and does not. normalizeRole is LOSSY: the page says something, the normalised value is stored, and the original string is DISCARDED. coach_added.details carries name/role/email/phone where role is ALREADY normalised, so when the vocabulary widened, 7 of the 8 'Other' rows could not be classified from stored data at all — the evidence had been thrown away at extraction. THE FIX IS ECHO OVER DERIVE APPLIED TO OUR OWN PIPELINE: coaches.role_source holds what the page actually said, coaches.role holds the normalised value, and the next vocabulary change is not blind. A COLUMN, NOT A DETAILS FIELD — details is a log of a proposal, the column is a durable fact on the row and survives the catalog re-point. coaches.endowed_title rides with it: the extractor already models it as a first-class field, correctly reading "Bobby Clark Head Coach of Men's Soccer" as role='Head Coach' plus endowed_title='Bobby Clark', and applyChanges then drops it because there is no column to write to. BOTH LAND IN CHUNK F, in the SAME COMMIT as the scraper code that writes them — a column nothing writes is the null-is-indistinguishable-from-nobody-did-it hazard, which this project has already paid for twice.
- RECLASSIFYING THE SEVEN 'OTHER' COACHES — targeted scrape, AFTER the re-point, never a hand-mapping. They sit at Nope-tier schools so nothing depends on them and none is in the scan set; six carry a live coach_page_url (Notre Dame is the SPA). Running it post-re-point means the answers land on CATALOG rows where every family gets them, and routing it through the review queue treats it as what it is — a scraper finding, not a migration tidy-up. Guessing a role from a coach's name would be inventing a fact.
- INTERIM AS A MODIFIER, NOT A ROLE — decided against, for now, deliberately. The coach vocabulary multiplies seniority by interim-ness, which is why 'Interim Head Coach' exists with 2 rows while 'Interim Assistant Coach' exists with ZERO and was dropped. The better shape is a role plus an is_interim boolean: it stops the vocabulary growing combinatorially, and it makes "the program is between head coaches" — which is a real fact about a family's odds — queryable rather than buried in a string. NOT DONE NOW because it is a schema change with a data migration riding on a vocabulary change that is already touching eight definition points, and stacking the two is how a chunk stops being revertible. THE FLAT LIST IS WHAT SHIPS. Recorded so this is a decision we made rather than one we missed.
- ENDOWED TITLES HAVE NO HOME, and the private layer is the wrong one. coach-scraper's extraction schema already models endowed_title as a first-class field, separate from role — it correctly reads "Bobby Clark Head Coach of Men's Soccer" as role='Head Coach' plus endowed_title='Bobby Clark', and 2 of the 170 coach_added proposals carry one. But applyChanges NEVER PERSISTS IT: the insert has no column to write it to, so it is extracted, logged into coach_changes.details, and dropped. The one "Endowed: McFarland Family Head Coach of Men's Soccer" string in the database was typed by hand onto Notre Dame's Chad Riley (the SPA school, seeded manually). It sits in coach_family_state.notes, which is the WRONG SIDE OF THE SPLIT — an endowed chair is a fact about the world, not family posture, so it belongs on the shared coach row as coaches.endowed_title. Not built: it is one column plus one line in applyChanges, and it should ride with a coach chunk rather than alone.
- UNLINKING A SCHOOL FROM THE CATALOG IS UNBUILT, DELIBERATELY. The link control can attach an unlinked school; there is no way to detach one. Skipped because it does not fall out free and nothing currently produces a wrong link needing undoing — every path takes a human confirmation against division and state, and uq_schools_family_discovery blocks the duplicate case. THE QUESTION IT OPENS DESERVES ITS OWN DESIGN: linking CARRIES FACTS ACROSS (division, conference, location are copied from the catalog row), so unlinking has to decide what happens to them. Reverting them means knowing what they were before, which nothing records; keeping them means a school with no catalog linkage silently retains catalog-derived facts, which is the invented-division problem in a new costume. Do not add unlink as a rider on something else.
- CONTACT_LOG READ PATTERNS. Three unbounded family-wide reads exist — the no-argument useContactLog, feeding DashboardClient, GetRecruitedClient and SchoolsClient. Because they order sent_at DESC, truncation drops the OLDEST rows, so a long-tail school reads as NEVER CONTACTED and the app would advise first contact with a school already emailed. The fix is a school_contact_stats aggregate (last contact and last inbound per school), NOT pagination — these surfaces never needed the log, only the derived facts. Note that a view does not emit postgres_changes, so realtime invalidation changes with it. Per-school reads and the doc generators are SAFE: the worst case today is 30 rows for a single school.

### Productization Running List (August 2026)

The single consolidated list (supersedes scattered mentions in earlier dated sections; the Rebrand section's open-prerequisites paragraph stands as history).

CUSTOMER-BLOCKING before any signup:
- CLEARED BY T2 (2026-08-18): the catalog split shipped as Shape B — schools/coaches/camps/camp_school_attendees/camp_coach_attendees became family tables, so relationship posture no longer leaks cross-family.
- players has no edit UI — name and the camp-prep fields (home_timezone, position, grad_year, preparation_notes, recruiting_preferences) are set only via SQL or the resume parser.
- CLEARED (2026-08-19): per-family inbound routing shipped — the sendgrid webhook resolves the family from the envelope. STILL Almond-hardcoded: all four content crons (camp-discovery, coach-roster-sync, gmail-sync, summary-refresh).
- CLEARED BY T1 (2026-08-14): prep-doc ownership (user client + family RLS — direct-id probes return Doc not found cross-family); storage scoping (family-prefixed new writes + a legacy policy pinning the 26 grandfathered objects to family #1); the single-player-named columns (renamed camp_family_status / family_notes); the hardcoded player-name literal (replaced by players-by-family reads).

NON-BLOCKING:
- Storage cleanup on delete: deleting a prep_docs row leaves its PDF in the assets bucket.
- CLEARED (2026-08-13 emergency auth patch): the call-prep 14-day reuse query now filters doc_type='call' — a camp doc no longer satisfies the call-prep reuse check.
- Call-prep PDF still uses per-school accent colors (pre-brand; deliberately untouched by the camp renderer).
- The prep-doc upload route has no UI entry point (removal was deliberate; restoration is one line).
- The camp extractor resolves relative day-words ("today"/"tomorrow") against the PASTE date, not the date the notes were written — a family pasting old notes gets shifted commitment dates (the confirm screen's editable date field is the current guard).
- THE FIT v2 — the research pipeline stays warm for it; on return it must read entities from STRUCTURED research fields only.

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

## 11. Live Pipeline — Generated August 22, 2026

**Active schools: 7** | Overdue actions: 25
(Category Nope and status Inactive excluded)

### Tier A — Highest Priority (5 schools)

SCHOOL: Clark
  Status: Intro Sent
  Division: D3 — NEWMAC
  Location: Worcester, MA
  Admit Likelihood: Likely
  Coach: Samuel Matteson — Head Coach <smatteson@clarku.edu> [primary]
  Coach: Matthews Lima — Assistant Coach <malima@clarku.edu>
  Coach: Maitoe Suppasuesanguan — Assistant Coach <msuppasuesanguan@clarku.edu>
  Coach: Nur Adhikarie — Assistant Coach <nadhikarie@clarku.edu>
  Coach: TEST — Associate Head Coach
  Last Contact: 2026-08-10
  RQ Status: Completed
  Videos Sent: Yes
  Next Action: Pre Crimson camp email (Finn) — due 2026-07-15
  Also: Send post camp and meeting update (Finn) — due 2026-08-03
  Contact Log (3 shown):
    [2026-08-10] Outbound via Email — Samuel Matteson:
      Coach Matteson,
      
      Thanks again for having me on campus on July 31 and for watching me at the
      Crimson Camp that weekend. Getting to walk around Clark with you, and then
      having you see me play the next day, made the whole trip really valuable.
      
      I also appreciated you getting the pre-read process sta...
    [2026-08-06] Inbound via Email — Clark University:
      Dear Finn,
      
      
                                      On behalf of the Admissions Office of Clark University, I would like to inform you that after reviewing your preliminary admissions materials and transcript, you look like a strong candidate for admission into the Class of 2031!
      
                            ...
    [2026-08-03] Outbound via Phone:
      Hi Coach, I’m all set for our call, let me know when your set in your end

SCHOOL: Colby
  Status: Ongoing Conversation
  Division: D3 — NESCAC
  Location: Waterville, ME
  Admit Likelihood: Reach
  Coach: Sean Elvert — Head Coach <selvert@colby.edu>
  Coach: Ben Manoogian — Assistant Coach <bmanoogi@colby.edu> [primary]
  Coach: Yuri Nascimento — Assistant Coach <ynascime@colby.edu>
  Coach: Karl Schroeder — Assistant Coach
  Last Contact: 2026-08-22
  RQ Status: Completed
  Videos Sent: Yes
  Next Action: decide which ID camp to go to (Finn) — due 2026-07-01
  Also: Email follow up from Camp (Finn) — due 2026-08-03
  Contact Log (3 shown):
    [2026-08-22] Inbound via Email — Sean Elvert:
      Finn,
      
      Thanks for your patience - we enjoyed working with you during the event! I thought you did well in both portions of the day and were confident with your defending abilities along with your comfort level pushing possession forward into the attacking half.
      
      We are still looking to fill the L...
    [2026-08-10] Outbound via Email — Ben Manoogian:
      Coach Elvert and Coach Manoogian,
      
      Thanks again for having me at the ID camp on Sunday. I came in wanting to
      show more on the attacking side and in 1v1 situations, and I hope some of
      that came through on the day. I felt good getting forward and taking guys
      on as well as staying defensively sound....
    [2026-08-03] Outbound via Sports Recruits — Ben Manoogian; Sean Elvert:
      Coach Manoogian,
      
      Thanks again for the time and feedback at the Crimson Clinic. Hearing that I'm sound defensively but need to get more into the attacking third and take on defenders 1v1 was really useful.
      
      I decided to sign up for the Colby ID camp on August 9. I wanted to come because I'd like ...

SCHOOL: Illinois Institute of Technology (Illinois Tech)
  Status: Ongoing Conversation
  Division: D3 — Northern Athletics Collegiate Conference (NACC)
  Location: Chicago, IL (Bronzeville, near downtown)
  Admit Likelihood: Likely
  Coach: Marlon McKenzie — Head Coach <mmckenzie1@illinoistech.edu>
  Coach: Aziz Tahir — Assistant Coach <atahir2@illinoistech.edu>
  Coach: Julian Soto — Assistant Coach
  Coach: Mateo Sanchez — Assistant Coach
  Coach: Dylan Milkent — Head Coach <dmilkent@illinoistech.edu> [primary]
  Coach: Marlon McKenzie — Head Coach
  Last Contact: 2026-08-10
  RQ Status: Completed
  Videos Sent: Yes
  Next Action: Complete Financial pre-read docs (Randy) — due 2026-08-07
  Also: Get back to Coach re: scheduling a visit (Finn) — due 2026-08-12
  Contact Log (3 shown):
    [2026-08-10] Inbound via Phone:
      Ok no problem! Really - the visit is up to you. I like to have weekdays because if gives you a chance to see what a weekday looks like. If you wanted to make a “weekend” out of it, typically that could be a Friday and then watching a game on Saturday. Which you could look at our schedule for what...
    [2026-08-10] Outbound via Email — Dylan Milkent:
      Hey Coach,
      
      I finished the financial pre-read on Friday, so that's in.
      
      For the visit, a weekday with a Saturday game sounds ideal. I'm still
      waiting on my high school soccer and golf schedules to get locked in, but
      those should be finalized by the end of next week. Once I have those in
      hand I'll...
    [2026-07-27] Outbound via Text:
      Hi Coach, the financial pre-read sounds great. Send that over and I can get that started. Unfortunately the 20th doesn’t work for me because I start school that day.  In terms of getting out to Illinois, there is still a lot with High school soccer and golf scheduling that’s still up in the air t...

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
  Last Contact: 2026-07-08
  RQ Status: Completed
  Videos Sent: Yes
  Next Action: decide about the camp on 8/15 - 8/16 (Finn) — due 2026-07-12
  Also: Follow up email after camp (Finn) — due 2026-08-18
  Also: Test item (Randy) — due 2026-08-21
  Contact Log (3 shown):
    [2026-07-08] Inbound via Sports Recruits — Tim Peng:
      Thanks Finn!
      
      Fitness, impact, toughness, athleticism and whatever your best traits are!
      
      Tim Peng
      Assistant Men’s Soccer Coach
      
      Middlebury College
    [2026-07-08] Outbound via Sports Recruits — Tim Peng:
      Coach Peng,
      
      Quick update. I'm registered for the August 15-16 clinic in Middlebury and looking forward to getting on campus and training with your staff.
      
      AP scores also came back: 5 in Calc AB, 3 in Chem, 4 in APUSH. Next year I've got Calc BC, AP Physics, and AP Stats lined up, still pointed a...
    [2026-06-10] Inbound via Sports Recruits — Tim Peng:
      Excellent boss
      
      Tim Peng
      Assistant Men’s Soccer Coach
      
      Middlebury College

SCHOOL: WPI
  Status: Intro Sent
  Division: D3 — NEWMAC
  Location: Worcester, MA
  Admit Likelihood: Likely
  Coach: Brian Kelley — Head Coach <bkelley@wpi.edu> [primary]
  Coach: Alex Wolfel — Assistant Coach <arwolfel@wpi.edu>
  Coach: Taskin Guven — Assistant Coach
  Coach: Riley Doherty — Assistant Coach <rjdoherty@wpi.edu>
  Coach: Gabe Ramos — Assistant Coach <gramos@wpi.edu>
  Last Contact: 2026-08-10
  RQ Status: Completed
  Videos Sent: Yes
  Next Action: Decide whether this ID camp works or the crimson (Finn) — due 2026-07-01
  Contact Log (3 shown):
    [2026-08-10] Inbound via Email — Brian Kelley:
      Hi Finn,
      
      Good to hear from you again. I enjoyed meeting you and your family on campus.
      The Crimson camp was a good level to see you play.
      
      Good luck with the SAQ work and your 1v1 defending!  Enjoy your upcoming season!!
      
      Coach Kelley
      
      From: Finn Almond <finnalmond08@gmail.com>
      Sent: Monday, Aug...
    [2026-08-10] Outbound via Email — Brian Kelley:
      Coach Kelley,
      
      Thanks again for making the time on July 31 and then for coming out to
      watch me at the Crimson Camp. It meant a lot that you drove over to see a
      game in person.
      
      I also really appreciated the honest feedback on my first step. That's
      exactly the kind of thing I want to hear. I'm add...
    [2026-08-07] Inbound via In Person — Brian Kelley:
      At the Harvard Camp Coach Kelly said he liked Finn's defense, a physicality and left foot, but felt he was a bit slow on the first step.  He recommended Finn do SAQ specific training to improve his quickness.

### Tier C — Exploratory (2 schools)

SCHOOL: Bowdoin
  Status: Ongoing Conversation
  Division: D3 — NESCAC
  Location: Brunswick, ME
  Admit Likelihood: Far Reach
  Coach: Scott Wiercinski — Head Coach <swiercin@bowdoin.edu> [primary]
  Coach: Andrew Banadda — Assistant Coach <a.banadda@bowdoin.edu>
  Coach: Elayna Girardin — Assistant Coach
  Last Contact: 2026-08-10
  RQ Status: Completed
  Videos Sent: Yes
  Next Action: Pre Crimson camp email (Finn) — due 2026-07-26
  Also: Send post camp follow up note (Finn) — due 2026-08-03
  Contact Log (3 shown):
    [2026-08-10] Outbound via Sports Recruits — Scott Wiercinski:
      Coach Wiercinski,
      
      Thank you for the honest note. I know coaches don't always take the time to lay it out that clearly, and I appreciate you being straight with me about where I stand and what to work on.
      
      The feedback on efficiency, range of pass, and organizing the group right after we lose the...
    [2026-08-04] Inbound via Sports Recruits — Scott Wiercinski:
      Thanks for the note.  It was great to work with you at the Crimson Soccer Clinic to add more specifics to our evaluation of your ability and potential.  We enjoyed working with you and hope you benefitted from your time on the field and your exploration of
       Bowdoin College.
      
      Your initiative to at...
    [2026-08-03] Outbound via Sports Recruits — Scott Wiercinski:
      Coach Wiercinski,
      
      Thanks again for having me in your office on July 30. Getting to sit down and talk through recruiting and the program was really helpful, and Bowdoin felt even stronger in person than I expected.
      
      I really enjoyed getting to work with you over the weekend during the Crimson Cam...

SCHOOL: University of Rochester
  Status: Ongoing Conversation
  Division: D3 — UAA
  Location: Rochester, NY
  Admit Likelihood: Reach
  Coach: Ben Cross — Head Coach <bc006j@sports.rochester.edu>
  Coach: Sean Streb — Assistant Coach <sstreb3@ur.rochester.edu> [primary]
  Coach: Andrew Crawford — Assistant Coach <acrawf10@sports.rochester.edu>
  Last Contact: 2026-07-08
  RQ Status: Completed
  Videos Sent: Yes
  Next Action: TEST (Randy) — due 2026-08-20
  Contact Log (3 shown):
    [2026-07-08] Outbound via Sports Recruits — Sean Streb:
      Coach Streb,
      
      Thanks again for the detailed clinic feedback. The notes on quickness and aerial duels are things I've been working on, and it helps to have specific things to focus on.
      
      Quick summer update. I played the USL Academy Mountain Division season with Flatirons FC USL-A alongside my Albi...
    [2026-06-29] Inbound via Sports Recruits — Sean Streb:
      Finn,
      
      Thanks again for coming to the clinic! It was great to meet you, have you on campus, and I'm glad you enjoyed your time. You are a strong defender. You were confident in 1v1s with proper timing of tackles and using your body to win the ball. You showed great
       awareness by tracking players ...
    [2026-06-21] Outbound via Sports Recruits — Sean Streb:
      Coach Streb,
      
      Thanks again for having me out yesterday. The campus was really beautiful, and I enjoyed getting to meet you, Coach Cross, and Coach Crawford. It was also great to meet the current players, they were welcoming and gave me a good feel for the group.
      
      I liked the coaching style a lot....

---

## 12. Recent Changes

> **How to use this section:** When you make a meaningful change — new feature, schema update,
> tech stack addition, recruiting strategy shift — add a one-line entry here with the date.
> Most recent at the top. This is the fastest way for Claude Code and Claude.ai to catch up
> on what's changed since they last saw the repo.

| Date | What changed | Type |
|---|---|---|
| 2026-08-21 | DELETE REFUSES OUT LOUD — a silent no-op on two thirds of a real family's list. deleteSchool was a bare .delete().eq('id') whose error BOTH call sites discarded: DashboardClient closed the modal and SchoolDetailClient navigated to /schools, so a delete that the database had refused looked exactly like one that succeeded, and the school was still on the list when you got there. THREE FOREIGN KEYS ENFORCE THE REFUSAL and they are all campaign_schools: school_id directly, coach_id and contact_log_id one level down the CASCADE (coaches and contact_log both cascade from schools). Measured: 43 blocked directly, 42 via the coach chain, 26 via the contact_log chain — AND THE DIRECT SET IS A SUPERSET of both, proved by Case Western at direct 1 / coach 0 / contact_log 1. So the true reason is always the same, whichever FK Postgres trips first: this school appears in a campaign. TWO CONSEQUENCES. (1) THE REASON IS QUERIED, NOT PARSED out of the 23503 — the error says a delete failed, the campaign_schools count says why, and it is correct on every path, whereas parsing a constraint name would tie user-facing copy to whichever FK the planner happened to hit. (2) E2's re-point changes which schools can be deleted by ZERO: it removes the coach chain, which is redundant against the direct constraint, so delete behaviour needs NO verification step at the re-point sitting. THE COPY DOES THREE THINGS, and the third is the one that matters: names what blocks it, says why the block is right, and points at the affordance that actually solves the problem — "This school is in 2 campaigns, so it can't be removed — campaign history would lose track of who was contacted. Set its tier to Nope to take it off your board." 43 of Almond's 65 schools are in campaigns, so delete is unavailable for two thirds of a real list permanently and BY DESIGN; without the last clause a correct refusal reads as a broken button. The unknown-blocker path says so honestly rather than naming a table, because 14 of the 47 live tables have no create-table statement in supabase/migrations/ and the derivable blocker set is incomplete by construction. onDelete's type changed from Promise<void> to Promise<DeleteSchoolResult> so the COMPILER found both call sites — tsc stayed green while they were free to ignore a return value, which is precisely how the defect survived. | Bug fix |
| 2026-08-21 | E2 CHUNK 5a — ONE DEFINITION OF A COACH ROLE, and the gmail-partials bug closes for free. The vocabulary lived in EIGHT places: the CHECK constraint, a CoachRole union in types.ts, a SECOND independent union in coach-scraper.ts, VALID_ROLES, the extraction prompt as prose literals, normalizeRole's mapping, SchoolModal's picker list, and api/gmail-partials/[id]'s own VALID_ROLES — plus a NINTH in scripts/backfill-coaches.ts with its own normalizeRole. Two independent unions meant the compiler could not catch a divergence between the scraper and the app; prose literals in the prompt meant it could not catch one between the app and the model. THAT IS WHY gmail-partials OFFERED THREE VALUES THE CHECK REJECTS — Volunteer Assistant, Director of Operations, Goalkeeper Coach — while omitting two it permits, for months, failing on the constraint at every insert. New src/lib/coach-roles.ts owns COACH_ROLES, the derived CoachRole type, isCoachRole and normalizeRole; the extraction prompt's role list is now GENERATED from it and verified byte-identical to the literal it replaced. gmail-partials guards with isCoachRole, which fixes the illegal-values bug WITH NO SQL — the fix is removing options that never worked. NO NEW VALUES SHIP HERE, deliberately: widening the picker before the CHECK widens is the same bug in a new costume, so the order is CHECK FIRST, then one edit to COACH_ROLES. scripts/backfill-coaches.ts is NOT converted and is named in the file: it is a one-shot backfill that already ran, its normalizeRole has a different signature, and scripts/ is excluded from tsconfig so any edit there is unverifiable — it belongs to the scripts-into-tsconfig chunk. FOUND BY EXERCISING THE FUNCTION rather than reading it: normalizeRole maps "Assoc. Head Coach" and "Assoc Head Coach" to HEAD COACH, because the test is includes('associate') and the abbreviation does not contain it — and role === 'Head Coach' is what promotes a coach to the family's designated contact, so an abbreviated roster listing can hand the primary designation to the wrong person. "Asst. Coach" and "Asst Coach" fall through to Other for the same reason. Reported, not fixed — abbreviation handling rides with the vocabulary widening. | Refactor |
| 2026-08-21 | E2 CHUNK 4 — THE 18 INVISIBLE COACHES ARE VISIBLE. Rows with is_active=false and archived_at null rendered in NEITHER list: useCoaches fetched active as is_active AND archived_at IS NULL, and archived as archived_at IS NOT NULL, so 18 coaches were unreachable through the UI entirely. TWO OF THEM ARE SOMEBODY'S DESIGNATED CONTACT (Penn's Brian Breen, Wentworth's Matt O'Toole), which means a family whose replies had stopped got no explanation anywhere on the page. THREE STATES, THREE GROUPS: the active roster, "Hidden by you (n)", and "No longer at this program (n)", the last two collapsed. Departed reads from is_active ALONE — deliberately not from archived_at, whose conflation of departure-with-preference is exactly what the private layer retires. PRECEDENCE IS DELIBERATE: a coach the family explicitly hid reads as hidden even when they have also left the program, because that was the family's own decision about them. The hook now issues ONE query and partitions three ways in JS rather than two SQL-filtered queries — hidden can never be a SQL filter here (it lives in another table) and a roster is a handful of rows. Departed rows are labelled with "conversation history kept" and, where applicable, "was your designated contact"; there is no un-depart action, because departure is roster truth and un-departing it is the scraper's job, not the family's. | Bug fix |
| 2026-08-21 | E2 CHUNK 3 — THE PRIVATE LAYER IS READ. coach_family_state (created by F1, 2 rows) is now wired, and the split it encodes is the point: coaches.is_active is ROSTER TRUTH (the scraper says this person left the program, shared, same for every family) while coach_family_state.hidden_at is a FAMILY PREFERENCE that says nothing about the world. They were indistinguishable before — both were expressed by writing coaches.archived_at — which is why 18 rows sit is_active=false with archived_at null and render in NEITHER the active roster NOR the archived drawer: invisible and unreachable through the UI. HIDDEN MEANS, per the rulings: excluded from recipient pickers and the primary rotation; INCLUDED in generators and school-context, carrying the flag, because a hidden coach is still a fact about the roster and call prep should know the GK coach exists even if the family will never email him; and shown COLLAPSED as "Hidden by you (n)" on school detail, because rendering the family's own choice is honest while silent absence would be the fabricated-default rule running in reverse. All eight generator sites now stamp a HIDDEN marker beside PRIMARY with an explicit do-not-propose-contacting instruction — including hidden coaches without marking them would be worse than excluding them. HIDING THE DESIGNATED CONTACT CLEARS primary_coach_id IN THE SAME CALL, and the confirm copy says so: a pointer aimed at someone the family has said they do not want to see is not a contact. READS ACCEPT BOTH DOMAINS (hidden_at OR the legacy archived_at) with no flag. WRITES GO ONLY TO hidden_at, and this deliberately breaks symmetry with setPrimary's dual-write — the two differ in DIRECTION. primary_coach_id and is_primary are both per-family now and the pointer stays per-family afterwards, so writing both is safe; archived_at and is_active become CATALOG state at the re-point, so a family-hide that also wrote them would be putting one family's preference into everyone's truth. Rolling this code back merely makes hidden coaches reappear — visible and recoverable rather than silent. coach_family_state was NOT in tenant-db's table lists, so every server-side read would have thrown until it was registered as a FAMILY table — the designed tripwire working. Writes use insert-or-update rather than upsert-with-onConflict, matching camps.ts: family_id is never supplied, so it comes from the column DEFAULT (the app.current_family_id() helper), and naming a composite conflict target whose second column is DEFAULT-filled would route around that tripwire. FOUND WHILE WIRING: coaches.notes is WRITTEN (gmail-partials stores a signature title there) and SELECTED but RENDERED NOWHERE — no read surface exists, so the migrated rows were inert; notes is now composed private-layer-first and available, and no display was invented for it. The camp-doc fixture guard was extended to require hidden as well as isPrimary. THE ROLE VOCABULARY IS DEFINED IN SIX PLACES and they disagree — coach-scraper.ts carries its own second copy of the CoachRole union, and api/gmail-partials/[id] offers three values the CHECK rejects while omitting two it permits. Held for one vocabulary decision. Gates: tsc 0 errors, tenancy fence pass, 12 embeds verified, build exit 0. | Feature |
| 2026-08-21 | E2 CHUNK 2 — READS ACCEPT BOTH PRIMARY DOMAINS. Chunk F1 created schools.primary_coach_id (new column, backfilled 65/65 from coaches.is_primary) and coach_family_state; this is the CODE half. New src/lib/coach-primary.ts is the one place that knows: the pointer wins wherever it is set, coaches.is_primary fills in where it is null, and NO MIGRATION FLAG IS CONSULTED — the E1.5 property, because a read gated on a flag breaks for the length of every deploy window. Resolution is scoped to the list the caller passes, so Penn and Wentworth (whose pointers both name a departed coach) return null over an active-only list and fall through to the head-coach chain exactly as before. WRITES SET BOTH, and must: setPrimary writes the POINTER FIRST so a partial failure leaves the new answer winning, and a write that touched only is_primary would have left the pointer on the previous coach with reads preferring it — a regression manufactured by the read change. The three insert paths now ask schoolHasPrimary across both domains before promoting a scraped Head Coach, which also closes a real defect: a family that had designated an assistant would have had that choice overwritten by the next roster scrape. updateCoach no longer accepts is_primary at all. THE INVENTORY WAS REBUILT MECHANICALLY AND THE RENAME DID THE ENUMERATING: the composed field is isPrimary, not is_primary (a DB ROW keeps is_primary, a COMPOSED VIEW carries isPrimary), so editing the six view interfaces first turned every consumer into a compile error — ten of them on the first run, naming the seven generator PRIMARY-tag sites the earlier grep-built inventory had missed entirely. The ~40 sites resolve to 12 READ BOUNDARIES, each traced rather than assumed, which surfaced a SECOND coach boundary: prep-for-call/generate fetches the target coach in its own single-row query, so composing only at fetchSchoolContext would have left call-prep's "Is primary contact:" line answering from the legacy column with no compile or runtime error. THREE THINGS FOUND WHILE BUILDING. (1) The camp-doc fixtures are GITIGNORED (they hold real coach email bodies), so "regenerate in the same commit" was not executable, and JSON.parse(...) as CampDocFixture is an unchecked cast that tsc cannot defend — the harness would have replayed with c.isPrimary undefined, dropped [PRIMARY on file] from every coach, and REPORTED GREEN. assertFixtureShape now refuses a stale fixture by name; a guard that travels beats a regeneration that cannot be committed. (2) scripts/ IS EXCLUDED FROM tsconfig — proven with a deliberate type-error probe that produced zero errors — so the compiler-enumeration mechanism covers src/ only and ten sites including a WRITER (scripts/backfill-coaches.ts) remain grep-dependent. Its own tooling chunk, independently revertible. (3) api/gmail-partials/[id] VALID_ROLES offers three roles the CHECK rejects (Volunteer Assistant, Director of Operations, Goalkeeper Coach) — the UI and the constraint disagreeing about what a role IS, to be resolved as one vocabulary decision rather than GK bolted on. SECTION 9 gains three rules: PRECONDITIONS ARE PROVEN BY COMMAND OUTPUT (extended to call-site inventories and to migration files as partial record), A DISTINCT OVER ROWS ENUMERATES WHAT EXISTS NEVER WHAT IS PERMITTED, and A RULING THAT CONTRADICTS A VERIFIED RECON MUST BE RECONCILED BEFORE IT BECOMES SQL. Gates: tsc 0 errors, tenancy fence pass, 12 embeds verified, build exit 0, UI pass clean on Almond. | Feature |
| 2026-08-21 | E1.5 — CAMPS ARE SHARED. camps and camp_school_attendees moved to the CATALOG keyed on discovery_schools, family_id dropped, camp_proposals re-pointed with them, camp_coach_attendees dropped, all three FKs ON DELETE RESTRICT. camp_family_status is untouched and is THE per-family layer. Pre-image tables camps_repoint_preimage (75) and camp_attendee_repoint_preimage (43) hold the ONLY copy of family_id and were captured in the same sitting as the re-point, asserting against the live count in the same transaction — camp-discovery runs daily, so a snapshot taken days ahead would leave the gap with no rollback. THE SQL WAS THE EASY HALF: one line of DDL with a thirty-site blast radius, almost none of it failing loudly. P0 and P0.5 shipped first and were proven no-ops while camps was still family-scoped. Reads were made BIDIRECTIONAL — accepting either id form so they are correct on both sides without a flag, which is what made the SQL-then-deploy window safe rather than an outage; writes consult one switch. THE FULL INVENTORY MATTERED: P0 fixed the sites found by grepping for the failure modes already named, which found the failure modes already named, and missed eight more — including a wrong-domain write into action_items.school_id one file away from the identical prep_docs bug I had just fixed, and camp-proposal-queue, whose family-id filter would have silently emptied EVERY family's proposal queue. CHUNK G reclassified both tables, flipped the switch, and made attendee writes absorb the now-expected (camp_id, school_id) collision — one row is correct, attendance is a fact about the world. It also removed a SELECT of camp_coach_attendees that chunk C had dropped, which would have 404'd every camps fetch. THEN THREE RENDER DEFECTS, all one root cause and all fixed before anyone opened the calendar on shared camps: 73 of 75 camps rendered host Unknown for a family not tracking the host, while the host sat in the catalog; hostSchool.category defaulted to 'C' for an unresolved host purely so the Nope filter had something to compare; and the chip read Interested on all 75 for a family that had said nothing. Now: catalog fallback for the host name, nullable category with the tier badge simply absent, Not tracked instead of a fabricated chip, and my-camps gating on camp_family_status with everything else behind a distinct browse. Almond 24 tracked / 0 browse and byte-identical to before; Testerson 0 tracked / 75 browse with zero Unknown hosts. SECTION 9 gains E1.5 — Camps Are Shared as current state, plus two rules: DROP-SAFETY IS ABOUT REFERENCES NOT ROWS, and A FABRICATED DEFAULT IS A CLAIM (Unknown was wrong because we KNEW; Unclassified is right because we DO NOT; never invent a value to make a filter work). | Feature |
| 2026-08-21 | E1 COMPLETE — ALMOND IS 65 OF 65 LINKED, and the general link control is the mechanism that got the last five there. Unlinked schools recur BY DESIGN (auto-add, family proposals, imports, rejected proposals that stay on the list), so SQL would have fixed five rows and left the mechanism missing for the sixth. An affordance on any unlinked school opens a free-text catalog search and confirms with DIVISION, STATE and CITY visible — the discriminators a name alone cannot separate. It carries the same family-list guard as the other two doors, and now sits over uq_schools_family_discovery: THE DB REFUSES, THE UI SAYS WHY, with 23505 caught and translated so nobody meets a raw constraint code. Every link writes provenance to origin_note, because a link with no explanation is the state E1 existed to clean up. THE DIVISION QUESTION IS CLOSED: zero disagreements across all 65, including the five colloquial rows whose stored divisions had never been checked against anything. TWO BUGS FOUND BY DRIVING THE UI, per the rule this same day earned. The Can-t-find-your-school entry point was rendering inside a block that only appears after clicking Find more, so the person who needs it could not see it. And the catalog search had a STALE-RESPONSE RACE: typing Wisconsin displayed the results for wi (Baldwin Wallace, Hartwick, Lewis), because every keystroke fires a request and replies do not arrive in send order — a list that looked authoritative while answering a superseded question, in a control whose whole job is picking the right school. A sequence counter now discards superseded replies. Both endpoints were returning correctly the entire time. | Feature |
| 2026-08-20 | DUPLICATE LINKAGE CLOSED ON THREE DOORS. The unique index on (family_id, discovery_school_id) refused to create: Testerson held Trinity College (CT) from their intake starting list on 08-19, and the add-a-school acceptance run merged a Trinity proposal onto the same catalog row a day later. The near-match step had been searching the wrong set — it checked the CATALOG for duplicates and never the FAMILY'S OWN LIST, so the one place the typed name would have been found was the one place nobody looked. FIXED ON EVERY PATH, because the general link control will be a third door into the same collision: /api/catalog-match now matches the family's own schools FIRST using the same matcher pointed at their rows (a family school carries the fields the matcher needs, so no second implementation), and flags catalog candidates the family already holds as Already yours rather than offering them as fresh adds; the flow shows the on-list answer before candidates and before create and suppresses both when it hits; /api/catalog-proposals refuses with 409 naming the existing school, because a client check is a courtesy and not a control; and MERGE refuses when the family already holds a row linked to the target, which is the likeliest source of this defect since the reviewer is looking at the catalog and cannot see the family's list. The index enforces all of it at write time, but a constraint violation is a terrible way to learn it, so every path explains and the index stays the backstop rather than the interface. ALSO FOUND BY TRYING TO USE IT: the Can-t-find-your-school entry point was rendering INSIDE the Regista suggestions block, so it only appeared after a family clicked Find more — the one person who needs it is the person who has already failed to find their school. It now sits with the results and the no-matches empty state. Verified live: typing MIT, a school Almond already holds, returns You already have this on your list with an Open it link and no create path. | Bug fix |
| 2026-08-20 | E1 LINKAGE PASS RUN, and the add-a-school path proved it feeds it. The shared matcher ran over Almond's 32 unlinked schools and applied every unambiguous result: 24 links, not the 23 forecast, because SAN JOSE STATE now resolves — it entered the catalog through the add-a-school flow built hours earlier, so the add path demonstrably feeds the linkage path. Washington University linked to WashU St. Louis on the camp-name evidence, which the matcher correctly refuses to produce. ALMOND IS NOW 58 OF 65 LINKED, injectivity clean across all 58 (no catalog row claimed twice). THE ASSERTED-DIVISION QUESTION IS ANSWERED: across all 58 linked rows the stored division matches the catalog's in every case — ZERO disagreements — so the invented-division risk the fabricated D3 implied did not materialise in real data. The 7 unresolved rows carry unchecked divisions, which is the honest limit of that finding. SEVEN JUDGMENT ROWS REMAIN: DU, Berkeley, VA Tech, Cal Poly SLO (matcher returns nothing — colloquial or place-name forms it deliberately refuses), and U of Washington, University of Rochester (genuinely ambiguous, two candidates each differing only by division and state). THE REVIEWER MERGE SEARCH SHIPPED and closed the loop the descriptor guard opened: the guard refuses false positives by handing the remainder to a human, but the review screen had offered merge only into rows the matcher itself found, so exactly the handed-over cases were unresolvable. A plain substring search now finds any catalog row; University of Wisconsin Madison was merged into Wisconsin through it, recorded as found by reviewer search. ACCEPT FORM EXERCISED BY REAL CLICKS, closing the one step of the earlier acceptance that had run on the endpoint rather than the UI: the create button is disabled until division and state are supplied and enables on entry, the created row is a proper stub (domains and programs empty, conference null, region derived from state), and the family row is linked with division and location carried across. Probe rows removed afterwards; catalog back to 1067, zero pending proposals. | Feature |
| 2026-08-20 | CAMP-DISCOVERY IS RESUMABLE — the live production bug is closed. It had been killed on 13 of its first 16 scheduled runs (every Saturday 2026-05-09 to 08-01) and, because a killed function never reaches its completion write, each death left a row reading running forever in a table nobody opens. FAIRNESS (shipped first, separately): interleave round-robin across families so an interrupted run costs every family proportionally instead of starving whoever sorts last — on the real 7/13 split a halfway kill went from A 7 of 7, B 3 of 13 to A 5, B 5. RESUMABILITY: src/lib/scan-budget.ts orders by a least-recently-scanned bookmark (schools.camp_scan_last_at, nulls first) and runs inside a 240s budget against the 300s ceiling, stopping cleanly rather than being killed. A unit is stamped only AFTER it completes, so a unit cut off mid-flight keeps its old bookmark and leads the next run's queue. Three outcomes are now distinguishable: success covered everything, partial stopped on budget and records pairs_remaining, and a run killed anyway stays running until the next startRun reaps it to failed. THE BOOKMARK GRAIN IS DELIBERATELY TEMPORARY and the budget layer is grain-indifferent for that reason — a unit is an opaque item plus read-bookmark and stamp callbacks, so when camps move to the catalog (E1.5/E2) the unit becomes the distinct SCHOOL and the bookmark migrates to discovery_schools with a call-site change and nothing else. Do not add pair-specific machinery to scan-budget.ts. DUPLICATION SERIES now recorded every run as duplicated_work (pairs minus distinct schools) on both discovery crons: today 1 of 20, which says nothing, which is the point — the series has to exist before the answer is needed. ACCEPTANCE ON BEHAVIOUR: a run killed at pair 6 left none of its completed pairs leading the next queue; a budget-stopped run recorded partial with processed 4 and remaining 16; three consecutive budget-limited runs covered 20 of 20 pairs with none missed (bookmarks snapshotted and restored so the harness left no false marks). Then end to end against the real cron: run one stopped cleanly at 241s having done 15 of 20 and recorded partial with pairs_remaining 5 and mean_seconds_per_pair 16; run two picked up those 5 first and completed all 20 with stoppedEarly false and status success. STILL THE CEILING: about 16s per pair, so 240s covers about 15. At 50 families the fix is not a bigger budget — it is not doing the same work N times. | Bug fix |
| 2026-08-19 | THE ALMOND PIN IS GONE — camp-discovery and coach-roster-sync scan the UNION of families. Both ran familyAdmin(ALMOND_FAMILY_ID), so a school only another family tracked was never looked at and nobody saw an error, because a cron doing less work than it should still reports success. The previous two commits made removal safe: a dismissal now suppresses for ONE family. SHAPE: schools and coaches are FAMILY tables and no wrapper reads one across families — that is the boundary working, not an obstacle, since the scraper WRITES coaches and a coach row has to belong to somebody. So the union is assembled family by family through scoped clients and every write lands in the scope that produced it; cron_runs is catalog so run records go on catalogAdmin. src/lib/fetch-all.ts pages and asserts rows.length equals count in ONE implementation and THROWS rather than returning short, because per-call-site pagination is correct only until somebody adds the next call site. THE SAME DEFECT WAS FOUND ONE LAYER UP AND FIXED: camp-discovery skipped a URL if ANY pending proposal existed for it, letting one family's queue suppress another's; it now enqueues the proposal for the undecided family directly rather than paying Haiku to rediscover a proposal that already exists. REMOVING THE PIN IMMEDIATELY EXPOSED A DEFECT IT HAD BEEN HIDING: proposals now exist for schools a family does not track, and the review queue filtered only on status pending, so after the first union run BOTH families saw all four proposals including the other family's. Caught during acceptance by reading what each queue actually returned rather than trusting the run summary. The queue is now scoped to proposals hosted at this family's own schools. ACCEPTANCE BY RUNNING BOTH CRONS against the production database: coach-roster-sync processed 7 pairs with 0 errors; camp-discovery processed 20 (family, school) pairs across 2 families and inserted 4 proposals, of which TWO — W&L and Trinity CT — are at schools ONLY TESTERSON TRACKS and could not have existed under the pin. Schools no family tracks (Stanford, UCLA, Duke, Georgetown) stayed out of the scan set. SCALE FINDING, and it is not the row cap: the union is (family x school) PAIRS, and the 20-pair run took 371 SECONDS — already over the 300s function ceiling, so on Vercel it would have been killed mid-run. Wall clock is these jobs' binding constraint. The per-family reads are each scoped to one family and nowhere near 1000 rows, so the cap protection matters at listFamilies scale or for one enormous family, not for the union itself. Chunking or queueing these jobs is now a prerequisite for real family counts. | Feature |
| 2026-08-19 | CHUNK I CODE SIDE — the per-family proposal decision, and the last thing standing between us and a multi-family cron. shouldSkipProposal now takes a REQUIRED familyId (required, not optional: optional recreates the defect the first time a caller omits it, and a required positional is what makes the compiler find every call site — it found both). THE CHECKS: status invalid suppresses for EVERY family (a bad extraction is never a real camp); a dismissal suppresses for ONE family only; and a shared PENDING proposal with no decision row for a family CREATES that row so the proposal enters their queue, because treating absence of a decision as already-handled is the original bug wearing a new schema. Both dedup reads FAIL CLOSED — a read that errors returns skip rather than being mistaken for nothing-found, which would duplicate proposals. The familyId is checked against the client's own scope and throws on disagreement, so a Testerson id on an Almond-scoped client cannot read one family's decisions while writing another's. TWO PIECES HAD TO SHIP WITH IT OR THE FIRST WOULD HAVE REGRESSED: reject was setting a GLOBAL camp_proposals.status of rejected, and the queue page, sidebar badge and tools badge all filtered status pending with NO family dimension — so every family saw every proposal and one family's reject removed it from all of them. Had only shouldSkipProposal changed, a rejected proposal would no longer suppress, the cron would re-propose it, and the rejecting family would get it back forever. Reject is now a per-family dismissal leaving the shared proposal untouched; the three surfaces subtract this family's dismissals through one helper (src/lib/camp-proposal-queue.ts), whose decision lookup is bounded BY the pending set so it cannot meet the silent 1000-row cap. camp_proposal_decisions added to FAMILY_TABLES — the wrapper caught the test harness reaching for it through rawService, which is the fence working. ACCEPTANCE ON BEHAVIOUR, NOT CODE READING: for a signature Almond rejected (Amherst, start 2026-07-10) shouldSkipProposal returned skip true reason dismissed-by-this-family for Almond and skip false for Testerson; a probe pending proposal with no decision row for Testerson produced exactly one new decision row with decision pending and inserted NO duplicate proposal. Probe rows removed afterwards, tables verified back to 259 proposals and 195 decisions. THE ALMOND_FAMILY_ID PIN IS NOW SAFE TO REMOVE AND WAS DELIBERATELY LEFT IN — removing it is the union-of-families change and comes after acceptance. | Feature |
| 2026-08-19 | ADMIN AUDIT TRAIL WIRED — the four audit columns stop being decoration. They had existed since the admin-console sitting with NOT ONE of the four write paths populating them, which is the schema-ahead-of-code failure in its purest form: the columns read null, and null is indistinguishable from nobody-did-it. FIXED ALL FOUR: requireAdmin now returns email alongside userId (it already called auth.getUser, so the value was in hand the whole time — no path could write an email column because no path had ever been given one); quarantine REPLAY and DISCARD both write resolved_by and resolved_by_email, discard included because deciding a message belongs to nobody is exactly as actor-bearing as filing it; mintInboundAddress takes a REQUIRED POSITIONAL minter argument and writes minted_by and minted_by_email — positional and required rather than an optional field on MintOptions, because minting creates a family's only routing credential and which-admin-did-this must never be silently omittable, and because a signature change is what makes the compiler find the call sites (tsc found the one that existed). /admin/inbound surfaces the actor on both surfaces — minted-by per address, resolved-by per resolved quarantine row — since a column nobody can read is the same decoration in a different place; rows predating the wiring render as (unrecorded) rather than blank so the gap stays visible. ACCEPTANCE BY ROWS, NOT BY CODE READING: a mint and a discard performed through the live console as the signed-in admin wrote user id 4162f9ad and rcalmond@gmail.com into family_inbound_addresses and inbound_quarantine respectively, and both render in the UI. The deploy-not-live state was caught by the same surface — existing addresses still showed no minted-by line until the build landed, which made the UI its own deploy check. ONE LOOSE END: acceptance minted a SECOND active address for the Testerson test family (testerson-64yabr@) because every family already had one, and there is no retire control in the UI — so it needs retiring by the architect chat, per the one-source-of-SQL-truth rule. | Feature |
| 2026-08-19 | CONTEXT CONSOLIDATION — schema-ahead-of-code, the new binding rules, and the design corpus. SCHEMA AHEAD OF CODE (new, at the top of Section 9, because reading the schema and assuming the code matches would reopen a closed defect): chunk I's camp_proposal_decisions exists with all 195 historical Almond rejections backfilled as family-scoped dismissals and camp_proposals.status accepting invalid, but shouldSkipProposal still has its OLD signature, the table has ZERO code references, and the pending-decision rule is unimplemented — so the camp-discovery ALMOND_FAMILY_ID pin remains the only thing preventing one family's rejection from silently suppressing a camp for everyone, and it must not be removed. The four admin audit columns (inbound_quarantine.resolved_by/resolved_by_email, family_inbound_addresses.minted_by/minted_by_email) all exist and NONE of the four write paths populates them — verified path by path: requireAdmin returns no email at all, the quarantine replay and discard branches write neither resolved_by field, and mintInboundAddress takes no minter argument. They are decoration until wired. NEW BINDING RULES, permanent: verify the assembled artifact not the source text (the LWB grep miss); PostgREST caps at 1000 SILENTLY so any read that believes it got everything asserts rows.length === count; propose-don't-create for corrections to shared data; accept is admin-only while dismiss is a per-family hide; domains come only from OBSERVED coach email addresses, never a website host (measured: 48 of 55 athletics hosts differ from the institutional mail domain); a candidate list can be confidently wrong, so corroborate against independent evidence rather than ranking siblings; fail toward the recoverable error. DESIGNED BUT NOT BUILT, recorded as decisions: catalog economics (shared schools/coaches/camps, staged I then E1 then E1.5 then E2, with is_active/archived shared, hidden_at per-family, primary_coach_id on schools); E1 linkage state (Almond 65 with 33 linked, bridge splits 19 auto / 2 ambiguous / 11 unmatched, SJSU verified genuinely absent from the catalog, Washington University resolving to WashU St. Louis on camp-name evidence); catalog completeness as an E2 BLOCKER with verified division counts D3 394 / D1 207 / NAIA 178 / D2 174 / JUCO 113; the forwarding path being SR-only so a direct coach email is discarded with no row of any kind and the family sees nothing; and contact_log read patterns, where three unbounded family-wide reads truncate OLDEST-first so a long-tail school reads as never-contacted, fixed by a school_contact_stats aggregate rather than pagination. CORRECTIONS TO THE DOC ITSELF: Section 4 still called schools/coaches/camps/attendees shared catalog tables (T2 made them family tables on 2026-08-18); Tenancy Architecture claimed roster-sync and camp-discovery run on catalogAdmin (all four content crons run familyAdmin(ALMOND_FAMILY_ID); only quarantine-reaper uses rawService) and still listed T2 and per-family email routing as pending when both shipped. Also added: Generator Persona — Identity Derivation, recording that Tier 1 and Tier 2 both derive from the players row and that players.club is echoed, never inferred. | Docs |
| 2026-08-19 | GENERATOR PERSONA — TIER 2 + THE IDENTITY BANNER (two commits). BANNER: the subject guard's identityWarning was reaching the HTTP response and the server log but NOT the person about to email a coach — DraftModal read only subject, body and closingQuestion and dropped it, which rebuilt the fail-secret pattern in a new place four hours after the sweep meant to end it (its fifth appearance). The draft review stage now renders it, naming the SPECIFIC risk (this draft may name the wrong player; the subject was corrected automatically; the body may still carry another player's name, position, grad year or club) rather than a generic review-before-sending that trains people to click past. Non-blocking: a diacritic or nickname false positive must never lock a family out of their own outreach. TIER 2: the five generators that reason ABOUT the player now take identity from the family's players row — conversation-summary, message-plan, plan-QA, call-prep-prompt, and the classify-inbound few-shots (whose sample coach emails now use a clearly generic placeholder name, preserving exactly what they teach). The message-coverage detector's example was genericized too. Position-change biography is derived from what the family's own profile records, or omitted. A LEAK THE FIRST AUDIT MISSED, caught by verifying the BUILT PROMPT for both families rather than trusting a grep: call-prep-prompt hardcoded Almond's actual season stats, GPA, SAT, AP courses, honors, summer team and high school — none of which matched the audit regex because the literal said LWB rather than left wingback. Testerson's call-prep prompt was carrying another family's child's transcript. Those lines are gone; the block now echoes the family's own current_stats, academic_summary and highlights, and states plainly when there are none. The hardcoded academic block ALSO contradicted Almond's own profile (asserting Chemistry as his primary major while his academic_summary says mechanical/aerospace engineering), so removing it fixed a stale contradiction as well as a tenancy leak. VERIFIED live for both families: Testerson's call-prep prompt reads Test McT, 2029 defensive mid, no club line, academics none-on-record, ZERO Almond-specific data; Almond's is unchanged and correct. Both harness fixtures pass (Middlebury 1 of 8, Colby 0 of 7); build, tenancy fence and embed contracts green. Section 9 gains Subject Guard and the Persona Coverage Map recording where the guard reaches and where it does not — reply mode is body-only and silent by correct design, and the CAMPAIGN path has no tripwire at all because there is no model-proposed subject to compare, which is the higher-risk surface since one leaked body reaches an entire staff. That detector is a named design question, deliberately not built. | Feature |
| 2026-08-19 | GENERATOR PERSONA — TIER 1: the builders that write AS the player now take identity from the family's players row. THE BUG THIS CLOSES: a second family's draft introduced their child to a college coach as Finn Almond, a 2027 left wingback at Albion SC Boulder County — name, position, grad year and club all belonging to another family's son, with Finn's sign-off. NEW src/lib/drafting-persona.ts is the single source (buildDraftingPersona, personaIdentityLine, personaCredentialRule, personaVoiceDescriptor), shaped after camp-doc.ts rather than inventing a second pattern: a typed profile, conditional emission, honest fallback. THE CLUB CONTRACT is honoured from the column comment — an empty club OMITS the credential entirely and is never inferred, abbreviated, or invented; Testerson has no club and its draft simply does not mention one. AGE IS DERIVED from grad_year (schoolYearFromGradYear, rolling in August) and never stored. CONVERTED: buildEmailDraftPrompt, buildTopicSuggestPrompt (which also had to start selecting identity columns — it previously fetched only stats), buildPrepSystemPrompt and buildPrepPrompt, CAMPAIGN_PERSONALIZE_SYSTEM_PROMPT (const to buildCampaignPersonalizeSystemPrompt), and campaign-email-generator's SYSTEM_PROMPT plus its CONTEXT ABOUT block; routes were wired to read the family's player and pass it. ENFORCE, DON'T ASK — the lesson that shaped the build: a correctly templated subject was OVERRIDDEN by contradicting persona instructions, so the subject is now COMPUTED in code (new src/lib/subject-guard.ts) and the model's version is only evidence; a proposed subject that does not name this family's player is surfaced as an identityWarning because it means the persona leaked and the body is suspect. THE TWO TRAPS: voice references now read as this family's own writing with an honest degradation when a family has no corpus (never seed one family's drafts from another's), and the striker-to-wingback transition — asserted as fact in three places — is now derived from what the family's own profile records, or omitted. THE TOKEN is read-both/write-one: both strip regexes and every fill instruction accept legacy [Finn: AND neutral [PLAYER:, only [PLAYER: is emitted, verified live on a body carrying both forms (the legacy bracket routed correctly to the TODO rule, the neutral one filled from real profile data). Also neutralized: the shared RECRUITING_JUDGMENT block, which is embedded IN the Tier-1 system prompt and named Finn four times — contradicting instructions are exactly what defeated the templated subject — plus nine live prompt strings in conditional branches (status updates, coverage items, topic suggestions, call-prep output) that a first Testerson run did not trigger. ACCEPTANCE: Testerson generates Test McT, sophomore defensive mid graduating 2029, club omitted, ZERO forbidden tokens in the body and ZERO persona leaks in the assembled prompt; Almond regenerates substantively unchanged with correct name, position, grad year, club, reel link and sign-off. Both harness fixtures pass (Middlebury 1 of 8, Colby 0 of 7). TIER 2 REMAINS AND IS NEXT: the summary, message-plan, QA, call-prep-research and classify generators still reason ABOUT the player with Finn literals — wrong, but not sent to a coach. | Feature |
| 2026-08-19 | EMAIL BOUNDARY CLOSEOUT — acceptance passed, queue cleared (four separate commits). ACCEPTANCE: identical SR-shaped bytes sent to Almond's finn@ and Testerson's minted testerson-tc2puq@ produced two correctly-scoped rows; Testerson auto-added Suffolk at C-tier with its evidence note and a working Undo on /unmatched, filed under the SR channel with no coaching contacts and stage 1; the Awaiting-Test chip confirmed identity derivation for a second family. Worth recording: Regista READ the synthetic message and REFUSED TO ACT ON IT (no real correspondence; a synthetic test message was routed from Suffolk; no action needed) — ECHO OVER DERIVE holding under a condition it was never specifically designed for. (1) FAIL-SECRET SWEEP: the hooks file predates the fail-closed-on-absence rule and discarded every read error, which is how a hard PostgREST 300 rendered as Send-the-first-email — the pattern's FOURTH appearance (degrading intake, length-as-loaded hangs, zero-match filter revert, now this). A reportFetchError helper now logs every failed read loudly as a FAILED READ rather than an empty result; the six primary hooks (schools, contact_log, action_items, assets, questions, coaches) expose error alongside loading; the remaining fetches and the swallowed camps read are instrumented; and school detail's conversation zone now renders an explicit we-couldn't-load-this state (nothing has been lost, the messages are still stored) instead of the cold-start copy, with the intro-email CTA suppressed. Mutations were audited and are NOT part of the class — they return their error to callers. (2) EMBED CONTRACT CHECK: scripts/check-embed-contracts.mjs extracts every PostgREST embed from src/ and issues each against the live schema with the anon key, failing the build on PGRST200 (relationship missing) or PGRST201 (ambiguous). It runs in prebuild beside the tenancy fence, verifies 14 embeds in about two seconds, needs no session and reads no data (RLS returning zero rows is fine — it asserts the query can be PLANNED). Validated by reintroducing the exact outage and watching it fail, then pass when restored. Its first run also caught a flaw in its own extractor (a from-without-select borrowing the next query's select) which was fixed before shipping. NOTHING IN THE PRIOR GATES COULD HAVE CAUGHT THE OUTAGE: client-side PostgREST calls never reach Vercel logs, the harness uses plain selects with no embeds, and the query is a valid TypeScript string. (3) ROUTING LOGS NAME THE FAMILY: routed messages log family and matched address, and both orphan-drop lines carry the family — so plain non-SR test mail is now usable routing evidence, which it was not during acceptance. (4) COPY: the unmatched banner's missing space (JSX ate the newline between expression and text) is fixed; the ingestion-health SendGrid check was rewritten because it measured mail that FILED while claiming the webhook may be broken — it was firing that false alarm on 2026-08-19 while test sends proved the webhook healthy. It now says what it knows, never escalates to critical on a quiet stretch (14-day bar, since post-camp lulls are normal), and carries TODO(receipt-heartbeat) for the schema addition true reachability would need — deliberately not smuggled into a copy fix. Section 9 gains Email Boundary — Current State (the pipeline, the envelope-for-routing/headers-for-identity principle, the quarantine-versus-orphan distinction, auto-add with its guardrails, and the four-step family standup) alongside the Schema Change Rules added with the hotfix. | Feature + Docs |
| 2026-08-19 | HOTFIX — conversation history invisible app-wide (acceptance test 1 blocker; DIAGNOSED BEFORE ANY CHANGE). Symptom: the /schools SIGNAL column read dash for all 7 schools and every school-detail conversation rendered the cold-start empty state (Send the first email to get started) while Regista's cached Read on the same page still described the Aug 10 thread — the cached summary being the evidence that the rows existed and the READ was what broke. CAUSE, reproduced live against production: schools.origin_contact_log_id (the auto-add provenance column from the email-boundary Chunk A) created a SECOND foreign key between contact_log and schools, so the bare embed school:schools(...) in useContactLog became AMBIGUOUS and PostgREST refused it with HTTP 300 PGRST201 (candidates schools_origin_contact_log_id_fkey and contact_log_school_id_fkey). useRealtimeData.ts discards the error (if not error and data), so a hard 300 rendered as a designed empty state — empty and failed were indistinguishable to every consumer. NOT A CODE REGRESSION: useRealtimeData.ts is not in the deploy diff at all, the FK landed with the DB chunk BEFORE the code deployed, and the old code held the identical embed string — so reverting would have fixed nothing. Blast radius measured by testing every embed shape in the codebase against the live schema: ONLY the three contact_log-to-schools embeds broke (useContactLog fetch plus insertEntry and insertEntries); action_items, school_offers, camp_school_attendees, campaign_schools, batch_reel_sends and school_message_log all returned 200. The INBOUND WRITE PATH WAS NEVER AFFECTED — sr-inbound selects id only and school-context.ts reads plain columns with no embed, which is also why the harness gates stayed green. FIX: the three embeds name their constraint explicitly (school:schools!contact_log_school_id_fkey), verified 200 against production, with a comment at the hook explaining why the constraint name is pinned so nobody simplifies it back. The drop-the-FK alternative was REJECTED — the provenance pointer's integrity is worth more than three lines, and auto-add's undo path depends on it. Standing rule added to Section 9 (Schema Change Rules): adding an FK between two tables that already have one silently breaks every PostgREST embed between them, so grep for embeds before any future chunk adds an FK and disambiguate in the same ship. | Bug fix |
| 2026-08-19 | EMAIL BOUNDARY — THE ROUTING BUILD (branch email-boundary-routing; DB chunks A/B/C already run). ENVELOPE-ONLY ROUTING at the serviceClient cut: src/lib/inbound-routing.ts parses SendGrid's envelope, normalizes recipients, resolves family_inbound_addresses, and routes ONLY on exactly one distinct family; zero, multiple, retired, or unparseable REFUSE AND QUARANTINE with the stated reason and write NO contact_log row. The To header is never a routing input — proven necessary by the probe, which showed envelope.to carrying finn@in.finnsoccer.com while the To header echoed the original Gmail mailbox. There is deliberately no content fallback: guessing a family from a matching school would mis-file precisely on coaches who recruit two families' players. The rule ENVELOPE FOR ROUTING, HEADERS FOR IDENTITY is stated at the top of the routing module: envelope.from is rewritten by Gmail on forward (the caf_ return path) so it is never a sender-identity input, and the Gmail verification gate reads the From header with envelope.from as corroboration only. THE INGESTION PATH WAS EXTRACTED to src/lib/sr-inbound.ts so the live webhook and quarantine replay run the same function including the family-scoped dedup check — a replayed message that also arrived another way collapses instead of duplicating. FamilyIdentity (src/lib/family-identity.ts) loads once per message after routing and carries player name, home timezone, and the family's sending and inbound address sets; every identity literal from the design's section 6 now derives from it — the SR subject and body regexes, the quoted-reply detector, the profile end-marker, gmail-parser's direction detection (FINN_EMAILS is gone), and the paste parser's timezone. FAIL CLOSED ON AN EMPTY SENDING SET: gmail-sync and gmail-backfill refuse the run rather than defaulting direction, because an incomplete set files a family's own outbound as inbound-from-a-coach and inverts touchpoint classification, awaiting-reply, stage floors, and summaries. QUARANTINE + ADMIN: inbound_quarantine rows carry the raw payload for replay; /admin/inbound (env allowlist ADMIN_USER_IDS, fail-closed when unset) lists them with reason, shows envelope.to beside the never-routed-on To header, and offers assign-and-replay or discard; a daily quarantine-reaper cron enforces 30-day retention because those payloads hold coach email bodies belonging to people who are not customers. ORPHANS ARE NOW VISIBLE: /unmatched lets a family attach an unmatched message to a school (firing the same summary and stage-floor cascade) or mark it not-a-coach via the existing non_coach status, with a conditional Get Recruited banner that renders only when the count is above zero — mail that arrived and didn't match must never be indistinguishable from mail that never arrived. AUTO-ADD: a coach reaching out IS engagement, so inbound mail naming a school not on the family's list adds it from the catalog at C-tier with provenance (origin inbound_auto, a human-readable evidence note, the triggering contact_log id, and the discovery linkage), guarded by HIGH-confidence evidence only (SR's structured school assertion or a catalog domain match, never the subject-word fallback or the loose substring rules), exactly-one-or-refuse catalog resolution, and a five-per-day ceiling; undo re-tiers to the bench rather than deleting, because the schools row IS the relationship and contact_log cascades from it. DOMAIN PROMOTION writes a discovered school domain back to discovery_schools.domains where the discovery linkage exists — a school's email domain is a fact about the school, and only 7 catalog rows carried domains at build time. GMAIL VERIFICATION CAPTURE recognizes Google's forwarding confirmation, stores the code on the receiving address row, and seeds the family's sending set from the confirming mailbox; Settings gains Your Inbox showing the address, the code the moment it lands, and the three REQUIRED setup steps including CC your inbox address on SportsRecruits sends, which is required rather than a tip because without it a family's own outreach never arrives. AMENDMENT 1 FIX: the DraftModal CC address now derives from the sending family's registered inbound address (new useInboundAddress hook) and renders NO CC line when a family has none — the literal finn@in.finnsoccer.com would have routed a second family's outbound into Almond's thread by envelope, a well-formed invisible cross-family mis-file. The dead Zapier route /api/email-inbound is DELETED with its INBOUND_SECRET references, and the stale comment describing the sr-notifications path is corrected to the verified finn@ flow. The concierge paste backfill needed no rebuild — /bulk-import already exists and is already tenancy-correct; it had merely lost its entry point when /pipeline was deleted, so it is relinked under Settings. The envelope probe STAYS DEPLOYED through the sitting: it is the only instrument that will catch the next genuine SportsRecruits notification, the one direct sighting still outstanding. ADDRESS MINTING (added after the gate review — the eleven-item commission never listed it, so the first build shipped with no way for any new family to be onboarded): src/lib/mint-inbound-address.ts generates slug-suffix@in.finnsoccer.com, where the slug is the ASCII-folded lowercased family name capped at 24 chars and the suffix is SIX characters from a 31-symbol unambiguous alphabet (no 0/O/1/l/i) — about 888 million combinations, because the address is the ONLY routing credential and anyone who guesses it can inject fabricated coach mail that would be indistinguishable from the real thing once filed; four characters would be brute-forceable against a guessable slug. Generate then insert then on unique violation regenerate and retry, bounded at 8 attempts — never check-then-insert, since that races and the global unique index on lower(address) is the real enforcement. Minting REFUSES for a family that already holds an active address unless explicitly asked to add a second, because silently minting duplicates makes which-address-is-mine ambiguous later and ambiguity in a routing credential is the last thing wanted. Exposed as an admin-gated action on /admin/inbound (mint for family, add another, plus a per-family address roster showing who has none) that returns the full address for copying — deliberately NOT a family-facing onboarding flow, which has not been designed. SendGrid Parse is configured DOMAIN-WIDE, confirmed from the platform's own Edit Host and URL dialog rather than inferred (email sent to ANY address in the receiving domain is processed and POSTed), so a freshly minted local part receives mail the moment the row exists with zero platform configuration. Together with the T1 create-family script this is the onboarding core — family row, user row, seeded questions, minted inbound address — and /admin/inbound is where standing up a family now happens. | Feature |
| 2026-08-19 | EMAIL-BOUNDARY ENVELOPE PROBE (observation only — design Amendment 2; NO routing, NO behaviour change). The approved per-family inbound routing design rests on one external-platform assumption: that SendGrid Inbound Parse posts an envelope field carrying the TRUE SMTP recipient, intact through Gmail auto-forwarding, while the to HEADER names the ORIGINAL mailbox and would mis-file if routed on. That assumption was held from documentation, not from this pipeline's own evidence, so it gets proven before anything depends on it. The sendgrid-inbound webhook now logs both fields side by side for every inbound message under the greppable prefix envelope-probe: envelope presence, JSON parse success, envelope.to, envelope.from, the To and From headers, subject, and the first 200 chars of the raw envelope. The block reads no database, routes nothing, and is wrapped so a probe failure can never cost a message — ingestion behaves identically whatever it observes. Query via Vercel runtime logs searching envelope-probe; the block is removed or folded into the router at the routing cutover. Also recorded from the Amendment 1 sweep (fix lands in the routing build, not here): the hardcoded CC address finn@in.finnsoccer.com — Almond's inbound address — appears in exactly two customer-facing places, both inside DraftModal's CC-reminder block (the clipboard write and the displayed code element), plus one dev fixture in scripts/test-outbound-cc.ts; no campaign sender, draft builder, or setup-copy site names an inbound address. Left unfixed here deliberately: a second family CC-ing Almond's address would route by envelope to Almond and file THEIR outbound into ALMOND's thread — a well-formed, invisible, cross-family mis-file — so the CC address must derive from the sending family's registered inbound address, with no CC line at all when a family has none. | Bug fix |
| 2026-08-19 | INTAKE v3 — narrowing UX (six live-acceptance findings plus exclusion hardening; pipeline, ranking, disclosure and isolation were already passing). MULTI-SELECT NARROWING: each question's options are now multi-select toggles with union semantics inside a dimension and AND across dimensions; the match count and every option count update LIVE as options toggle, with each dimension's own counts computed against the other dimensions only (standard faceted behaviour, so a family sees what adding a value would give). ORDINAL OPTIONS RENDER IN ORDINAL ORDER: impurity still decides WHICH question is asked but never how its options are listed — selectivity and enrollment both render ASCENDING on their own scale (Accessible to Most selective; Under 2k to Over 15k, one convention across both), division renders on the D1-to-JUCO ladder, region alphabetically; nothing renders by count. NO PREFERENCE IS A REAL STATE: it is the empty selection — it fills like any other chip when the group is empty, selecting it clears the group, and selecting any option unfills it. HONEST COUNTS: the button says what it does (Show the 10 best of 46, or Show 8 schools when everything fits), a live line reads N programs match your picks, zero matches disables the button with a clear-a-filter line instead of silently reverting to the full set, and the results screen keeps the rest-are-in-Find-Schools line; the route now counts with count exact against a 400-row ceiling and sends the whole ranked set so narrowing counts are the real ones. PAGE SUBHEAD rewritten to house voice: the name and details that appear on your emails, documents, and screens. SKIP IS RECOVERABLE: a permanent Find your schools section on the profile prefills the stored intake_notes in an editable box and re-runs the starting list (saving any rewrite back to the non-canonical column), so skipping or exhausting a run is never a dead end; the confirmation banner distinguishes a first setup from a later re-run. EXCLUDE SCHOOLS ALREADY ON THE LIST: the DiscoverSection exclude-bridge was extracted to src/lib/school-name-key.ts (nameKey plus buildOnListIndex plus isRowOnList) and is now the ONE matcher shared by the on-your-list badge and intake suggestions — exclusion resolves by recorded discovery id OR any name form (name, short_name, aliases), so a retry after adding ten never re-offers those ten and every downstream count is post-exclusion. ACCEPTANCE SMOKE-VERIFIED against the live catalog with the real libs imported: the business query offers 63, options render in natural order (2k-5k 17, 5k-15k 24, Over 15k 22; Accessible 20, Selective 30, Highly selective 11, Most selective 2), multi-selecting Over 15k plus 5k-15k grows 22 to 46 with the button reading Show the 10 best of 46, the selectivity counts move live (Accessible 20 to 15, Selective 30 to 18) while the size question's own counts correctly ignore its own picks, No preference equals the unfiltered 63; a simulated second run after adding ten offers 53 with zero re-offers, and the name-form bridge excludes a school listed only by short_name while correctly still offering the genuinely different Cal Poly Pomona; the original engineering smoke still returns exactly its 4 with no narrowing step. | UX |
| 2026-08-19 | INTAKE v2 — ranking, the 10-cap, narrowing, and the honest limitation (result-quality commission on the aspiration intake; the test query previously returned 30-plus alphabetical results with Accessible-band schools beside Cal Poly). THE HONEST LIMITATION, option (a) shipped: discovery_schools has NO program-quality data (programs is a binary offered-tag), so when the family asks for strong programs the parse emits program_quality_requested as QUERY EVIDENCE and code uses the academic-selectivity ordinal as a RANKING stand-in — never a hard filter (filtering would silently evict schools matching every stated criterion) and never model knowledge — with the results screen disclosing it plainly (the catalog doesn't rate individual programs; academic selectivity stands in). Chosen over making it a narrowing question because the family already answered in their own words and the narrowing step exists separately. ANNOTATION DISCIPLINE: the why-prompt is rewritten to restate ONLY the row's facet fields with an explicit no-quality-adjectives rule, AND a code-side guard (the drop-unsourced-claims pattern) drops any why carrying an unbackable adjective (strong/excellent/top/renowned/elite and kin) — dropped lines are logged as annotation-dropped. RANKING, deterministic, in code: the parse additionally emits a PRIORITY ordering of the family's stated criteria (evidence about the query — it may not rank schools); code scores each row by exact facet matches weighted by that priority plus the quality ordinal when proxying, tie-break academic ordinal then name (name is last resort, never the ordering — the alphabetical fallback is dead). CAP AT 10 WITH NARROWING: at 10 or fewer the ranked list ships annotated; above 10 a narrowing step runs first — 1-2 tappable questions picked by Gini-impurity discriminating power over ONLY the dimensions the family did not state (pure math in src/lib/intake-narrow.ts, unit-testable, component stays presentational for the demo-funnel seam), options carry live counts plus No preference, re-filter preserves rank order, then the top 10 show with whys fetched fail-soft via a new annotate mode on the same route (whys are never spent on rows that won't render); still over 10 after narrowing shows the 10 best and says so plainly. Framing everywhere: a starting list — add more anytime in Find Schools; never implied exhaustive. Preselection stays all-checked (re-justified: with a 10-cap the one-click list is the moment; C-tier exploratory, reversible). Fail-soft rules from Amendment B unchanged. ACCEPTANCE SMOKE-VERIFIED (read-only plus real parse calls, real intake-narrow lib imported): the test query (D1 or D2 west/mountain-west/Texas strong business) parses to divisions D1+D2, regions West+Southwest, programs business, quality_requested true, priority divisions-regions-programs-quality → 63 matches, quality proxy active, Santa Clara and Stanford (most_selective) top at 5.00 while Accessible-band UT Tyler/Utah Tech/West Texas A&M sit at 3.20 bottom; narrowing offers campus size (24/22/17 split) and selectivity (30/20/11/2), tapping 5k-15k gives 24 rows then top 10. The original smoke (small engineering northeast strong academics D3) still returns exactly the 4 (Coast Guard, Trinity CT, Union, WPI) with narrowing correctly skipped — zero available questions, all dimensions stated. | Feature |
| 2026-08-19 | INTAKE FAIL-SOFT HARDENING + ROOT CAUSE (the acceptance blocker on Profile v2's aspiration intake). DIAGNOSED, named from the platform, not guessed: Testerson's TypeError Load failed came from the DOMAIN TOPOLOGY, not the route — the apex host finnsoccer.com 307-redirects EVERY request to www.finnsoccer.com at the Vercel edge (curl-proven on POST and GET; edge redirects never appear in runtime logs, which is why /api/discover/intake-suggest showed ZERO trace across 97 request paths while the route itself, tested live under a real session on www, returned 200 in 6.4s with correct facets and 4 catalog rows). A JSON POST from an apex-origin context crosses hosts on that 307 and the browser kills it at the network layer — Safari's literal message for that death is TypeError: Load failed; it never reaches a function. Blank-intake create succeeds because it never fetches (the players insert goes direct to supabase.co). ENVIRONMENTAL follow-ups for Randy (dashboard, not code): confirm when the primary-domain redirect was configured (how a tab held an apex origin), and align NEXT_PUBLIC_SITE_URL to the primary host www so auth callbacks stop crossing the redirect. HARDENING SHIPPED: the route gains maxDuration 60 and NAMED soft-fail logs (no-facets / zero-matches-after-relaxation / annotation-failed / hard-error) so how-often-the-wow-degrades is answerable from runtime logs by querying intake-suggest; the client intake catch logs observably before landing on the normal flow (covers deaths the route never sees); and the create-flow players insert is wrapped against supabase-js network-level REJECTIONS (they throw, not return error) so a genuine connection failure surfaces as a clean try-again message, never an unhandled TypeError. Amendment B section 4 semantics unchanged — every failure lands the family on the standard empty state with the player created. ALSO CONFIRMED for the sport-constraint alignment: the women's literal the radio writes is exactly Women's soccer with an ASCII apostrophe U+0027, from SPORTS in src/lib/positions.ts (the radio maps the array values verbatim); standing rule adopted — shared enum literals get ONE stated source (the commission names the strings, or the live constraint is read before constants are written). | Bug fix |
| 2026-08-18 | PROFILE v2 — staged collection, sport, grouped positions, the aspiration intake (Amendments A + B folded in; players.sport / secondary_position / intake_notes columns pre-run via the architect chat). CREATE SLIMS TO 30 SECONDS: name, sport radio (Men's soccer preselected — the label is the stored value), grouped position select, grad year, defaulted timezone; the two echo textareas LEFT the create form; slim paused-drafting callout. SETTINGS = THE FULL RECORD, STAGED: The basics on top; The written record below as a clearly-optional section framed by when it matters (used when documents are generated — add anytime) carrying the echo helper text and the field anchors. AMENDMENT A: positions are a grouped controlled select (Goalkeeper / Defense / Midfield / Attack, thirteen labels, labels are stored values, existing rows conform) in create and settings, plus an optional secondary_position select in settings; identity derivation shows primary only. AMENDMENT B — THE ASPIRATION INTAKE: one optional free-text prompt in create (what kind of schools is NAME aiming for) saved to players.intake_notes — NON-CANONICAL, read by NO generator ever. On submit with text, EVIDENCE-EMIT-AND-COMPUTE strictly: /api/discover/intake-suggest parses the words into browse facets ONLY (divisions, regions, academic bands, size bands, programs — enum-sanitized in code; the model never names a school), CODE filters discovery_schools on the facets with progressive relaxation (size then academics; division/region/programs never relaxed) and deterministic ranking, and a second optional call annotates the top 12 with one-line whys grounded only in each row's facet data (annotation failure ships without whys). Results render as Here's a starting list — checkbox cards preselected ON (the one-click wow; every row is C-tier exploratory and reversible; justified in-code), one button adds the checked rows through the shared add-from-catalog path (toSchoolInsert extracted to src/lib/discovery-add.ts, used by Find Schools AND the intake adoption; user-client inserts, helper default stamps family_id, discovery_school_id recorded). FAIL SOFT EVERYWHERE: empty intake skips straight through; no facets, zero matches, model error, or timeout all land on the normal empty state with a browse-Find-Schools pointer — signup never blocks on a model call and never shows an error where a family expected magic. IntakeSuggest is presentational-only with the adoption write in the parent — TODO(demo-funnel) marks the auth-and-adopt seam for the future unauthenticated demo (not built). JUST-IN-TIME PROMPTS (one per surface per session via sessionStorage, dismissible, NEVER blocking — the fail-safe empty behavior is the fallback): camp-prep input step nudges an empty preparation_notes (add the routine or generate general guidance); camp-doc Generate and call-prep setup nudge an empty recruiting_preferences (state them or proceed with no preference on record); links land field-anchored on the profile. SPORT ROUTES NOTHING: the Find Schools browse copy derives mens/womens soccer from the player's sport (null reads as men's) and TODO(womens-catalog) sits at the two catalog-selection points (browse query + intake-suggest); discovery_schools remains the only catalog. Also en route: the Who-is-Finn-calling literal in PrepForCallModal became player-name-driven (identity grep 179 to 178; the generator-persona and owner-enum findings stand unchanged). Smoke-verified read-only: the acceptance phrase (small engineering schools in the northeast, strong academics, D3) extracts exact facets and code-filters to 4 real catalog rows — Trinity CT, Union, Coast Guard, WPI. | Feature |
| 2026-08-18 | PLAYER PROFILE — create + edit + the identity sweep. New Settings surface at /settings/player (nav item Player Profile): a ZERO-PLAYER create flow (Add your player — name/position/grad_year required, IANA home-timezone select defaulting America/Denver, the two echo fields optional) and a ONE-PLAYER edit-in-place for all six fields. USER CLIENT throughout — RLS scopes reads and writes and the family_id helper default stamps the create; no service role on the surface. The echo fields carry their contract as plain-words helper text (written by the family, echoed into documents, never used to infer or prescribe). Schema supports multiple players; the UI is single-player for alpha and every read takes the family's first player by created_at with TODO(multi-player) markers. IDENTITY DERIVATION: new src/lib/player-identity.ts (getPlayerIdentity + buildOutreachSubject + initialsFrom) is the ONE source — the account footer initials and Class-of subtitle derive from the players row through the app layout (AccountMenu's hardcoded FA badge and Class of 27 LWB subtitle are gone; no player row means display-name initials and NO subtitle — the fallback invents nothing); the DraftModal campaign subject and the fresh-draft output-format subject example (prompts.ts) both derive via buildOutreachSubject; the campaigns/generate-draft server subject builder derives from a players read and FAILS CLOSED (400) with no player. DRAFTING IS GATED: with no players row every DraftModal mode renders an add-your-player-first panel linking to the profile page — an outreach email without the player's real name is unsendable. New usePlayer hook (loading resolves unconditionally — the zero-rows lesson). Also fixed en route: root metadata description was Finn's identity line (now brand copy); reel-share TASK CONTEXT prompt strings genericized; Finn-naming user copy on camp proposals, camp detail status header, and the camp-prep travel placeholder. THE IDENTITY GREP GATE (Finn / Almond / Left Wingback / Class of 2027 over src/) went 187 to 179 with every DISPLAY and SUBJECT surface now derived; the survivors are five justified classes — email-boundary parsers (webhook/gmail regexes matching Finn's real inbound mail, the TODO(email-boundary) constants), code comments and doc examples, labeled form examples, PLUS TWO REPORTED FINDINGS the gate surfaced that need schema-level work: (1) the GENERATOR PERSONA LAYER — roughly 90 hits across prompts.ts, campaign-email-generator, summary/message-plan/QA/call-prep/classify generators hardcode the drafting persona (name, position, club Albion SC, age, sign-off) inside LLM system prompts; ending it needs a club profile field (schema, architect chat) plus player threading through three prompt builders and the Finn-bracket placeholder wire-format rename — commissioned as its own build; (2) the ActionOwner enum (Finn or Randy) is DATA in action_items.owner rows — retirement is an owner-model migration, not a code sweep. Until (1) lands, a second family's draft BODIES still carry the Finn persona — the DraftModal gate plus derived subjects contain the blast radius but do not close it. | Feature |
| 2026-08-18 | T2 SHAPE B DEPLOY (ships at the T2 sitting; targets the post-B1/B2 database — family_id + Almond backfill live on schools/coaches/camps/camp_school_attendees/camp_coach_attendees, family RLS swapped in; the family_id default flip from the Almond literal to the helper rides the sitting runsheet AFTER this deploy is live, because old-code familyAdmin treated the five as catalog and did not inject family_id on inserts). WRAPPER: the five Shape-B tables reclassified CATALOG to FAMILY in tenant-db — familyAdmin now auto-scopes them, catalogAdmin/rawService refuse; the only three call sites that constructed the wrong client moved to familyAdmin(ALMOND) with TODO(catalog-economics) markers (coach-roster-sync, camp-discovery, coach-changes accept). Discovery adds record schools.discovery_school_id (the preserved re-key path to the discovery_schools catalog; off-universe and manual adds record null); School/Coach/Camp/attendee types carry family_id. Raw-service scripts scope explicitly since service role bypasses RLS: generate-claude-context filters family #1 on its four reads; camp-doc-harness records through familyAdmin. ZERO-SCHOOL EMPTY STATES (acceptance-blocking finding — a latent bug EXPOSED by the seal, not caused by it; Testerson was the first zero-school viewer in the app's history): useCamps gated its initial fetch on schools rows EXISTING, so campsLoading never resolved for a zero-school family and Get Recruited, Calendar, and camp detail hung at Loading forever — the hook now fetches once the schools source has SETTLED (resolved-empty counts; zero-state-capable callers pass their schools-loading flag, legacy callers keep the first-rows trigger); Get Seen computed loaded as schools.length greater than zero over server-complete props, pinning the questionnaires card at Loading — gate removed, zero renders as 0 of 0. Zero-rows audit across surfaces: pickDailyPriority, pickEndgameMove, getNextMove, camp composition (Unknown-host fallback), the max-sort .single() inserts, reduces and percentage divisions all verified guarded. The Awaiting-Finn signal chip is player-name-driven (Awaiting plus the family player's first name, fallback Awaiting reply; /schools reads the players row under RLS). Harness gates re-verified through the family-scoped read path: Middlebury 1 unprompted of 8 (the 2026-04-08 invite), Colby 0 of 7 — fixtures re-recorded via familyAdmin then frozen to the 2026-08-13 scenario date (the Aug 15-16 camp is past; the span validator correctly fail-closes on a post-camp reference date, a fail-closed win observed live). | Feature |
| 2026-08-18 | T1 TENANCY — COMPLETE, DEPLOYED, ACCEPTED (consolidated; the 2026-08-14 row records the code deploy and stands as history; DB SQL ran at the C6 architect sitting, code at 8a07a04). DB SIDE: families / users / players exist — family #1 Almond (00000000-0000-0000-0000-000000000001; Randy owner, Finn member, one players row), family #2 Testerson (TEST family, born empty except 15 non-custom questions cloned by the create-family runbook, Amendment D). All 24 pre-existing family tables carry family_id NOT NULL + FK + index with family RLS (USING + WITH CHECK on select app.current_family_id()); the helper is SECURITY DEFINER, pinned search_path, NOT executable by service_role — so every family_id column default fails LOUD on an unscoped service-role insert (designed tripwire, not a bug). users has a column-level UPDATE grant on display_name only (no self-promotion). Renames live: camp_finn_status to camp_family_status (composite unique camp_id + family_id), school_message_plan.finn_notes to family_notes, get_voice_references() to get_voice_references(p_family_id uuid). Storage GRANDFATHERED, no objects moved: 26 legacy objects under five prefixes (resumes, call-prep, other, transcripts, camp-prep) covered by a legacy policy scoped to family #1; new writes go to family-prefixed paths. ACCEPTANCE PASSED with both families: every family table sealed, three direct-id doc probes returned Doc not found for Testerson, Almond regression exact — with ONE FINDING: relationship posture still leaks via columns ON the shared schools/coaches catalog tables (tier, stage/board placement, status, last_contact, admit likelihood, videos_sent + reel title, RQ status, primary-coach flag, active-vs-bench). T2 splits those into per-family relationship rows and is the hard privacy blocker before any real alpha family. STILL PENDING: C7 has NOT run — player_profile and strategic_skips still exist, frozen and wrapper-blocked; nothing reads player_profile post-deploy and nothing may propose reads of it. CONSOLIDATED THIS PASS into the context doc: Section 4 (families/users/players, family scoping + renames, the RLS rewrite), Section 9 Tenancy Architecture + the permanent binding Tenancy Process Rules (one source of SQL truth — the architect chat emits, Randy runs, Claude Code runs no SQL ever; preconditions proven by command output; drops/renames target exact live-catalog names, never if-exists; SQL and prose as separated parse-verified blocks; trust a row-select over schema-cache readings), and the Productization Running List refresh. | Feature + Docs |
| 2026-08-14 | T1 TENANCY DEPLOY (ships at the C6 sitting; this code targets the POST-rename database — camp_family_status, family_notes, get_voice_references(family_id) — and must never deploy before the sitting's rename block re-applies). New tenant boundary in code: src/lib/tenant-db.ts is the ONLY legal source of a service-role client (familyAdmin auto-scopes every family-table query to one family and injects family_id on writes; catalogAdmin passes through catalog tables and refuses family tables; rawService is storage/auth plumbing only; player_profile and strategic_skips are BLOCKED — frozen until the C7 drops), enforced two ways: a runtime refusal in the wrapper and a prebuild fence (scripts/check-tenancy-fence.mjs) that fails the build if src/ constructs a raw service client outside the allowlist (the eslint no-restricted-imports rule exists but the repo eslint toolchain is non-functional, so the prebuild script is the enforced layer). src/lib/require-family.ts resolves the session user's family once per request. User-facing CRUD routes and RSC pages moved OFF the service client onto the user client so RLS enforces (campaigns cluster, camp-prep extract/save/pdf, assets and call-prep-docs rows, offers/extract, schools/[id] plan rows, settings and campaigns pages, layout); SSE/LLM generators, triage routes, bulk-import, and gmail flows keep service role via familyAdmin(familyId); webhooks and the gmail/summary crons are pinned to family #1 with TODO(email-boundary) markers; roster-sync and camp-discovery run on catalogAdmin. All nine player_profile singleton reads became players-by-family reads (prompt builders read the players row and the hardcoded player name literal left the camp generate route and harness with them); the resume parser takes familyId and updates the family's player, skipping (with a warning) if a family has no player row. get_voice_references is called with p_family_id via the wrapper's introspectable scope. New storage writes go to family-prefixed paths ({family_id}/call-prep|camp-prep|resumes|...); legacy objects stay grandfathered at their old paths. Camp-status and school-summary/message-plan upserts target the composite (school_id,family_id)/(camp_id,family_id) keys. AccountMenu shows users.display_name instead of a hardcoded name. The bulk-import bearer path resolves the caller's family before writing. | Feature |
| 2026-08-13 | EMERGENCY AUTH PATCH — closed the unauthenticated surface found by tenancy recon, before any tenancy work. (1) /api/offers/extract had NO auth check and returned any school's full inbound conversation to the unauthenticated internet — standard auth gate added. (2) /api/discover/similar same — gate added. (3) /design-preview/* removed from the proxy allowlist — its mockups carry identity data; now auth-gated like the rest of the app. (4) /api/gmail/manual-sync no longer lets any authenticated user trigger the global Gmail sync — it is gated on CRON_SECRET only (the Settings sync button now gets 401; proper admin tooling later). (5) ALL FOUR cron routes now REFUSE (503) when CRON_SECRET is unset instead of falling open — recon flagged gmail-sync and coach-roster-sync (open in dev when unset); camp-discovery and summary-refresh were worse, falling open even in production when unset. (6) The call-prep 14-day reuse query now filters doc_type='call' so a camp doc no longer satisfies the call-prep reuse check. No tenancy changes, no refactors. | Bug fix |
| 2026-08-13 | CAMP PREP STRETCH — CONSOLIDATED (commits 99b1815 through 00a31af; the fourteen dated rows below record the increments and stand as history). Feature complete: prep_docs generalized from call_prep_docs (doc_type, camp_id + name/dates snapshots, storage_path nullable), the school_research pipeline (consumed by school detail only), player_profile camp fields including the family-authored preparation_notes and recruiting_preferences echo fields; the camp prep pipeline runs input -> Sonnet extraction -> editable confirm -> Opus generation -> validate-before-persist (one retry, visible failure, prior content kept) -> in-app render -> print stylesheet -> PDF with generation date. Mid-stretch SCOPE CUT (5.5): every derived-fact section was removed (THE FIT deferred to v2, staff credentials dropped, research and the cross-thread digest taken off the document's critical path) — the document now echoes only family-authored fields, CRM data, and the confirmed extraction. Day labels and touchpoint classifications are computed in code from model-emitted evidence. Current-state documentation added this pass: Section 4 tables (prep_docs, school_research, player_profile camp fields), and Section 9's Camp Prep Docs — Current State, Camp Prep Design Rules, and Productization Running List. | Feature |
| 2026-08-13 | Camp-prep UI tighten — the Prep doc card's controls restructured by state (presentation only, no logic changes). Previously two rows (Discard/Resume in the header plus Regenerate/Download PDF/Print in the generator row) put five buttons on a card whose job is showing the document. Now one control row owned by CampDocGenerator: DOCUMENT EXISTS — primary Download PDF, secondaries Print and a quieter borderless Regenerate, with Edit inputs and Delete draft & document tucked into a small overflow menu (the delete confirm names that it removes the confirmed draft AND the generated document); DRAFT WITH CONFIRMED EXTRACTION — primary Generate document, secondary Edit inputs, overflow Discard draft; MID-FLOW DRAFT (no confirmed extraction) — primary Edit inputs, overflow Discard draft; NO DRAFT — unchanged single Generate prep doc entry in the header. Rules enforced: one primary per state, max two visible secondaries, destructive actions live only in the overflow (never adjacent to the primary) and confirm by naming what gets deleted. Resume relabeled Edit inputs everywhere in camp prep (post-generation it reopens the confirmed extraction, not an unfinished process); the mid-flow draft subheader now reads draft-in-progress instead of pointing at a Generate button that is not there. Data-color firewall unchanged — buttons are chrome. | Feature |
| 2026-08-13 | Camp-prep Phase 6.2 — computed touchpoint classification (third drift; the judgment moved into code, same playbook as day labels). A regeneration classified the 2025-11-28 Elias reply-to-cold-intro as unprompted by reasoning around the prose rule (third instance after 5.1 and 5.6), so the model no longer writes the label at all: for each inbound coach message it emits EVIDENCE — preceding_outbound_date plus preceding_outbound_quote (the family words that raised the subject, copied verbatim from that outbound's raw source) or the marker NO_PRIOR_MENTION — and finalizeCampDoc derives classification in code after validation, before persist: quote present = responsive, NO_PRIOR_MENTION = unprompted. The validator (validate-before-persist path) rejects a touchpoint missing both fields and rejects a preceding_outbound_quote that does not appear verbatim in that date's outbound source (buildOutboundQuoteCorpus; same failure class as a fabricated coach quote); outbound raw sources are now included in the prompt so quotes are copyable and checkable. The evidence instruction carries a SUBJECT TEST both ways: a coach introducing a concrete offer the family never raised is NO_PRIOR_MENTION even though an outbound exists (a tangential general-interest quote cannot launder a new camp invite into responsive), while answering-plus-a-push is still an answer (a reply pointing at the form/ID clinic answers a process question; the push goes in prose, never in the label). Downstream consistency: the read, advancement, verdict, and masthead framing must derive from the computed labels — coach-initiated count is exactly the NO_PRIOR_MENTION count, and initiative claims cite those dates. Gate re-verified on both fixtures: Middlebury 1 unprompted of 8 (the 2026-04-08 May-camp invite; Nov-28 back to responsive with the intro question as evidence), Colby 0 of 7. The harness now mirrors the endpoint (retry once on validation failure, then hard-fail without writing output — it caught a live flatten recurrence). Also: the PDF footer now carries the generation date next to the page number, and a DATED competing commitment never silently disappears — before the first plan day it is acknowledged as accumulated load in the first day's guidance (Murphy Creek 2026-08-12 now appears as yesterday's-round load context; West Woods sits on its actual date). Note: docs generated before 6.2 lack the evidence fields and will fail the PDF route's validation until regenerated once. | Schema |
| 2026-08-13 | Camp-prep copy cleanup — removed stale pre-generation strings left from Phases 3-4 (generation shipped in Phase 5). The post-save modal no longer says 'Document generation is the next step (coming soon)'; it now says the confirmed schedule is stored and Generate document is available on the camp page. The Prep doc section subheader no longer says 'Document generation is the next step' — when a document exists it describes the document (generated date, plan-day count, coach-touchpoint count); a saved-but-ungenerated draft points at Generate document below. No logic, generation, validation, or schema changes. | Copy |
| 2026-08-13 | Camp-prep Phase 6.1 — plan day labels, fixed structurally. The plan's day-header labels had regressed to +1-day-shifted dates with mismatched weekdays, and one leaked the model's own reasoning into a user-facing string ('Friday, Aug 15 (day before? no — travel day)'). Root cause: the model was formatting the date string itself. Now each plan day emits ONLY a date (ISO YYYY-MM-DD) plus a short descriptor ('pre-travel', 'travel day', 'Camp Day 1', ...); the human label (weekday, month, day) is computed in code from that date in the player's home_timezone via finalizeCampDoc, so the model never writes a weekday or formats a date and a descriptor field has nowhere to put deliberation. Plan dates are anchored to the camp's calendar dates (fetched from the camps table) and the reference date: Camp Day N is the Nth camp date, the travel-to day is the day before the first camp date, return travel is the day after the last, and prep/load days fall on-or-after today. The Phase 6 validate-before-persist path now also rejects a plan day whose date is missing/unparseable or outside the span (earliest of today / first dated commitment … return-travel day), and an over-long descriptor — a bad label fails, it does not save; no regex strips reasoning, the shape removes the class. Renderers compute nothing — they read the code-written label (fallback to date + descriptor). Middlebury ramp now reads Thursday Aug 13 (pre-travel) / Friday Aug 14 (travel) / Saturday Aug 15 (Camp Day 1) / Sunday Aug 16 (Camp Day 2) / Monday Aug 17 (return), verified in the HTML render and the PDF. | Schema |
| 2026-08-13 | Camp-prep Phase 6 — render, print, PDF (presentation only; content frozen at 813861a, no schema/prompt/generation changes). SHAPE VALIDATION: a new validateCampDoc (src/lib/camp-doc-validate.ts) checks the generated JSON against the schema BEFORE persisting; on mismatch the generate endpoint does one automatic retry, and a second failure is a reported error with what was wrong — the document is NOT saved and previous content is left intact (a malformed run, e.g. the where_you_stand flatten, must look like a failure, not a silently dropped section). IN-APP RENDER: CampDocView (src/components/CampDocView.tsx) renders prep_docs.content as read-only HTML on camp detail, replacing the raw JSON viewer; tolerates null content and any absent optional section. PRINT: an @media print stylesheet on the same markup (US Letter, doc-only — no nav/buttons, no orphaned day headers, no session block split across a page break). PDF: server-side via a separate camp renderer (src/lib/camp-doc-pdf.ts, pdfmake) at GET /api/camp-prep/pdf/[id] — builds from content, writes to the assets bucket, sets prep_docs.storage_path, streams as attachment; the call-prep PDF renderer and its per-school accent colors are untouched. BRAND: masthead bold italic with a green trailing period; The Plan carries the numbered-act ghost-numeral ramp (Pitch Green as chrome); Where You Stand and The Mission carry a Regista attribution and stay in the ink/charcoal register (never accented green); DATA-COLOR FIREWALL held — classifications are text labels, no chips/dots/stripes. Middlebury PDF renders to 8 pages; blocks are unbreakable so none split across a page boundary and no day header is orphaned. CONTENT FINDING (reported, not fixed — content is frozen): the plan day labels carry wrong dates/weekdays and leaked reasoning text, e.g. 'Friday, Aug 15 (day before? no — travel day) — travel to Burlington' (Aug 15 2026 is a Saturday; the travel day is Fri Aug 14 and the whole ramp is shifted +1 day). | Feature |
| 2026-08-13 | Camp-prep Phase 5.6 — final content pass (four fixes from reading the post-cut Middlebury doc). (1) COMPETING COMMITMENTS NOW CARRY A DATE. The extraction schema stored a competing commitment as text + time with no date, so the generator guessed a day and put a golf round on the same morning as the departure flight — impossible. CampCommitment gained a date field: the extractor resolves a relative day-word (yesterday/today/tomorrow) against a new REFERENCE DATE (today, home tz) or takes an explicit date, else null; the confirm screen shows date as an editable field, visibly red when undated. Generation rule: a commitment with a null date may NOT be placed on a specific plan day — it is mentioned in the pre-travel/load framing and never inferred onto a day from tee-time ordering or proximity. (2) CLASSIFICATION IS NOW STRICTLY MECHANICAL. The 2026-05-30 'Come to the August one' had drifted to UNPROMPTED on tone; it is RESPONSIVE (the preceding May 19 outbound raised the topic). Tightened §1 so the label turns ONLY on whether the immediately preceding outbound raised the topic — tone, warmth, and directiveness never flip it — while allowing the prose to still characterize a responsive message as an active pull. Regression gate holds: Middlebury (1 unprompted, coach reaching back) and Colby (0 unprompted, every touchpoint family-initiated) produce opposite §1 reads. (3) rubric_quote.when is now populated from the source-message date. (4) A coach with no thread relationship now OMITS your_angle entirely instead of emitting an empty string, so Phase 6 renders nothing rather than an empty block. Also hardened the return-JSON instruction to preserve object nesting (a run had hoisted where_you_stand's fields to the top level). New DB-free fixture harness gained a thread-only stub fallback so a school with no camp draft (e.g. Colby) can still run the verdict gate. | Schema |
| 2026-08-13 | Camp-prep Phase 5.5 — scope cut: the document no longer depends on derived facts. Every defect in this build landed in a section that ASSERTED facts about the outside world; the echo sections (the plan, nutrition from preparation_notes, before-leaving) never failed, so the derived sections were cut and the echo sections kept. Removed §4 THE FIT entirely (attrition, profile gap, honest context, unsourced, plus the anti-hype paragraph that only existed to caveat it) — deferred to v2, and when it returns it must derive entities from STRUCTURED research fields only, never from research prose. §3 THE STAFF keeps name / role / your_angle / primary_relationship (all sourced from the CRM thread) and drops the research-derived credentials field; a coach with no thread relationship now gets name and role only, no manufactured angle. The document no longer reads school_research at all: removed the research read, the staleness gate, and the refresh-before-generate confirmation from the camp-doc flow, and stopped setting prep_docs.research_id (column left in place). The research pipeline, its endpoint, the validator, the URL ledger, and the school-detail Research section ALL stay — simply off this document's critical path. Calibration now ECHOES a new family-authored player_profile.recruiting_preferences field (Migration 7) instead of the ~39k-token cross-thread declared-facts digest, which is removed: the family writes the constraint, the generator echoes and respects it, may reference whole-list tier/stage/offer metadata freely, and never infers a ranking from thread content. Fail-closed carried from 5.3: an EMPTY preferences field may state no preference is on record; a FAILED profile read must NOT assert absence or imply a ranking and surfaces in the response; status logged every generation. The 5ee9dec thread-load guard (§1/§2 refuse-to-generate on a contact_log fetch error or count/load mismatch) is preserved intact. Also added: a hard rule that no generator may read entities out of a research prose field explaining an absence (not_found_reason and the like), documented on ResearchSnapshot; and a travel-time rule — the plan may never state a time for a travel segment that has no time in the confirmed extraction. New DB-free fixture harness (scripts/camp-doc-harness.ts) records a school's context to disk, regenerates, and diffs the document section by section — no auth, no UI, no DB writes. Generation dropped one model round-trip and about 39k input tokens per run. | Schema |
| 2026-08-13 | Camp-prep Phase 5.3 — fail-closed on absence (structural, third instance of the pattern after roster-vintage and initiative). The declared-facts extractor's truncated parse had returned an empty array that calibration turned into a confident "no top choice declared anywhere" — a positive verdict from a lookup that never ran. extractDeclaredFacts now returns a discriminated result (status ok | empty | failed): empty (lookup ran, nothing declared) and failed (parse error, max_tokens, API/DB error) are never represented the same downstream. Calibration follows status exactly — ok cites/respects declarations; empty may state plainly no preference is on record; FAILED must NOT assert absence or imply a ranking either way, and degrades (surfaced in the generation response). Status is logged on every generation. Absence audit across the document: FIXED §1/§2 — fetchSchoolContext swallows a contact_log query error (an empty thread reads identically to a failed fetch), so the generate endpoint now guards with an error-surfacing thread count and refuses to generate if the thread errored or a >0 count mismatches an empty load, so a cold-relationship / nothing-yet / no-rubric verdict can never be built on a failed fetch. AUDITED SAFE: the research consumer (a failed research run never becomes is_current, so getCurrentResearch returns a real snapshot or null = honestly absent, and the_staff/the_fit go null with an explicit research-not-available note) and §4 published-commits / unsourced (research-internal, already source-validated in Phase 2.1). | Bug fix |
| 2026-08-13 | Camp-prep Phase 5.2 — cross-thread calibration + date fix. Item 1: document-displayed message dates now derive from sent_at converted to the player's home timezone (a shared localDate helper) instead of the raw date column — a 9:20pm-MT message stored as a 3:20am-UTC sent_at now shows as its local calendar day, so a cited date always matches the message (the diagnostic's 04-09 was UTC; the doc's 04-08 via the date column was already the correct local date). Item 2: calibration was spec'd to use the whole list but only saw the host school's thread, so Middlebury confidently said no top choice was declared while the Colby thread held one. New extractDeclaredFacts builds a BOUNDED cross-thread digest — keyword-filters all outbound family messages to declaration candidates, then a Sonnet pass extracts genuine family-declared facts (preferences, commitments, pre-reads, offers acknowledged) with verbatim raw_source quotes, EXPLICITLY excluding first-contact intro flattery (a recruit who calls five schools a top choice in intros has ranked none). Only the small digest reaches calibration (no full threads); ~39k extraction input tokens, bounded and reported. Calibration now respects a preference declared to ANOTHER school (cites school + date + quote, no contradicting #1 language), states plainly when none is on record anywhere, and never invents a ranking; §1 stays host-thread-scoped. Acceptance: Middlebury cites the Colby 2026-08-10 top-choice declaration and protects it (no Middlebury-as-#1 language, warm and true); Colby correctly allows top-choice language because it is the declared school. First attempt returned 0 facts (max_tokens 2000 truncated the JSON); raised to 4000 and tightened the flattery exclusion. | Bug fix |
| 2026-08-13 | Camp-prep Phase 5.1 corrective — §1 discrimination + quote integrity. FIX 1 (fabrication risk): fetchSchoolContext now selects contact_log.raw_source (the raw email body — additive, call-prep behaviour unchanged), and the camp-doc thread emits it for INBOUND messages only, whitespace-collapsed and capped to 2500 chars (the coach's new text sits at the top; a 60k-char Dartmouth outlier is windowed to ~600 tokens/inbound). Coach quotes MUST come from raw_source; if a message has no raw_source the model may paraphrase but not quote. FIX 2: Where You Stand rebuilt to DISCRIMINATE — every inbound coach message is classified unprompted vs responsive against the immediately preceding outbound, split across two axes (who opened the relationship = low information vs who drove advancement = the finding), every asymmetry claim must cite a specific dated + quoted message, and the blanket every-touchpoint-you-reaching-out is banned unless zero inbound messages are unprompted; generalized across §1/§2 (comparative claims are evidence-anchored or not made). Regression gate, both schools generated: Middlebury credits Peng's unprompted 2026-04-08 May-camp invite and reads the August exchange as player-raised-coach-pulled; Colby reaches the opposite (no unprompted inbound, every touchpoint player-driven), citing the neutral reply. | Bug fix |
| 2026-08-13 | Camp-prep Phase 5 — document generation (the judgment stage; Opus claude-opus-4-8). New /api/camp-prep/generate (SSE, 300s) consumes a confirmed extraction draft plus the full CRM thread (fetchSchoolContext), current school_research (getCurrentResearch), the player profile, and the whole active-list calibration context, then writes the structured CampDoc to prep_docs.content (research_id set, storage_path stays null). Fixed section spine: masthead, Where You Stand + The Mission (Regista, from the thread only — verbatim quotes, asymmetry, rubric hunt, calibration without inventing a ranking), conditional Staff/Fit gated on research, day-by-day Plan carrying the nutrition/sleep/load domain on every day with each extracted hard constraint placed at its moment (deduped), Before Leaving, footer. The research staleness gate is client-side in CampDocGenerator (Refresh and generate / Use existing) and never nests a research run inside generation. Raw JSON viewer on camp detail — Phase 5 judges content, not looks (no render/print/PDF yet). Middlebury acceptance: correctly reads from the thread alone that the PLAYER initiated every touchpoint (entry 1 is his cold intro — the opposite of the assumed ground truth; that gap is in the data/assumption, not the doc or prompt), quotes Peng's rubric verbatim, calibrates via tiers/stages/offers, lands every constraint at the right block, and gets the Mountain-to-Eastern sleep math right. | Feature |
| 2026-08-13 | Camp-prep build Phases 3-4 (input + extract + confirm; does NOT generate the document — that is Phase 5). CampDetailClient gains a Prep doc section: Generate prep doc, or Resume/Discard a draft, keyed on camp_id (not elapsed days — the 14-day reuse rule stays call-prep-only). CampPrepModal takes three unstructured fields (paste the camp email, travel/timing prose, extra notes). /api/camp-prep/extract runs a single Sonnet (claude-sonnet-4-6) pass that extracts day-by-day blocks, venue/surface/per-day check-in, an open-ended HARD-CONSTRAINTS checklist, travel segments/lodging/meals/commitments/who, and a timezone delta computed from player_profile.home_timezone (never hardcoded); absent times stay null, never guessed. The confirm step renders the whole extraction fully editable (constraints first) before /api/camp-prep/save persists it to prep_docs as a doc_type=camp draft (content + storage_path null, source generated, camp_name/dates snapshots taken at insert). Null-tolerance audit: useCallPrepDocs now filters doc_type=call so camp drafts never reach CallPrepSection; new useCampPrepDoc hook; the download route already 404s on null storage_path. prep_docs.coach_name_snapshot is NOT NULL and meaningless for a camp doc — set to the camp name as a placeholder (future nullable-migration candidate). Throughball chrome, no Regista. | Feature |
| 2026-08-13 | Camp-prep Phase 2.1 — research grounding corrective. Fixed attrition anchoring: it now derives the two in-scope cycles from the recruit grad_year (arrival fall Y means cohorts graduating spring Y and spring Y-1) via CLASS STANDING on the CURRENT roster, never off a stale roster page. The loop establishes the current roster season FIRST and records roster_summary.roster_season; every roster-derived source carries a season, and the validator now drops any roster-derived claim not tied to the current season (season-mismatch, logged) on top of the existing unsourced-claim drop. Geographic claims must cite the roster URL and now survive. Research fenced to PUBLIC facts only — no primary-contact or who-runs-recruiting lookups (that lives in contact_log). Middlebury retest: complete, 0 drops, attrition = spring 2026 + spring 2027 only (1 D 2026, 3 D + a keeper 2027), all sourced to the current 2025 roster. | Bug fix |
| 2026-08-13 | Camp-prep build Phase 2 — school research pipeline. New /api/school-research/generate (SSE, nodejs 300s, Sonnet claude-sonnet-4-6, agentic Tavily web_search/web_fetch loop, 20-iteration cap) populates the school_research asset (staff, program results, roster shape, position-attrition, geography, class commits). Shared machinery extracted to src/lib/agentic-research.ts (tools + runAgenticLoop + a server-side fetched-URL ledger); call-prep-research.ts refactored to reuse it with behaviour unchanged. GROUNDING: a validator drops any snapshot claim whose source URL is not in the fetch ledger (each drop logged, run marked partial), never persists an unsourced claim, and treats not-found as a valid result. Concurrency guard via a pending row; the is_current flip is ONE atomic statement in a set_current_research SQL function (must be run separately — see the endpoint); a failed refresh never overwrites existing research. School-detail ResearchSection: status, researched-N-days-ago, staleness past 30 days, live SSE regenerate, and an expandable sources trust surface — Throughball chrome, no data-color introduced. getCurrentResearch accessor exposed for call prep to adopt later (running-list #10 stands — call prep still uses its literal). Acceptance vs Middlebury: partial, 21 tool calls, 8 staff, an 8-entry position-attrition set incl. a 4-defender 2025 cohort sourced to the official roster, commits honestly not-found. | Feature |
| 2026-08-12 | Migration 0 code sweep (production unblock): the DB rename table call_prep_docs to prep_docs and column docx_storage_path to storage_path had been applied to the live database but not the code, 500ing the entire call-prep surface. Swept the 5 runtime files — generate route, download route, upload route, the useCallPrepDocs hook, and the CallPrepDoc type. The API route path /api/call-prep-docs and the CallPrepSection component are intentionally unchanged (URL/UI names stay). Immutable migration files (049/050) and dated-history prose keep the old name as historical record. Part of the camp-prep-docs build (Phase 1 schema landed via Migrations 0-4). | Bug fix |
| 2026-08-12 | Context doc: added the Throughball Rebrand + Productization narrative to Section 9 (brand identity + the two-name architecture, the brand sweep + the data-color firewall, route renames, /pipeline removal, housekeeping + the 404 system, production auth/email via Resend, and four reinforced patterns) and refreshed the current-state sections — product identity (Throughball powered by Regista), design vocabulary (one-accent Pitch Green, jewel ladder retired), page inventory (current routes, nav account menu, branded login + Offside 404, /pipeline and orphans removed), and schema notes (not_found_log; status enum vestigial). Dual-edited the live file + the generator fallback constants. | Docs |
| 2026-08-12 | Magic-link redirect_to fix: the sent email carried redirect_to as the bare root (https://finnsoccer.com) instead of /auth/callback, so magic links landed on marketing and the code-exchange never ran. The in-repo string was already /auth/callback — the bare-origin value came from window.location.origin resolving to an unexpected context — so emailRedirectTo is now pinned to an explicit canonical URL (process.env.NEXT_PUBLIC_SITE_URL or https://finnsoccer.com) + /auth/callback, removing window.location.origin as a variable. Set NEXT_PUBLIC_SITE_URL to override for preview/local and the future Throughball domain. Password login (no redirect_to) was never affected. | Bug fix |
| 2026-08-12 | Marketing CTA restructure: the three journeys given distinct labels/links — nav "Sign in" (signed-out) → /auth/login, hero + closing primaries "See it in action →" → /demo, hero secondary "How it works" → smooth-scroll to the Roadmap section (anchor was already wired). Removed the ambiguous shared "Try it now" label (0 remaining). The /demo route already exists, so those links resolve. | UX |
| 2026-08-12 | Auth front-door branding + magic-link diagnosis: /auth/login rebranded to Throughball (parchment ground, warm-white card, ThroughballLogo lockup, house tabs, Pitch Green Sign in) and de-personalized — the Finn-specific subtitle replaced with a product-generic tagline, all old blue/gray removed. Vestigial status pill also removed from SchoolModal header (matching the Pass-2 masthead removal; status column + deriveStage untouched). Magic-link email delivered as paste-ready Supabase-template content (dashboard-controlled). The magic-link otp_expired / wrong-domain (finn-recruiting-crm.vercel.app) failure diagnosed as a Supabase Site URL + Redirect URL misconfig plus an origin-dependent emailRedirectTo — dashboard fix is Randy's; the one candidate code change (pin emailRedirectTo to a canonical NEXT_PUBLIC_SITE_URL) is HELD pending confirmation, no auth-mechanism code changed. | Brand + Refactor |
| 2026-08-12 | Pipeline removal Pass 2 (auth rehome): the 4 auth redirects repointed from /pipeline to /get-recruited (proxy, login, callback default, post-password-change); sign-out and change-password rehomed into a shared AccountMenu opened from the nav (desktop sidebar footer + a compact Account item on the mobile bottom nav) — the only sign-out now lives on-brand in the nav rather than only on /pipeline. Layout now passes the signed-in user email to AppNav. Vestigial status pill removed from the school detail masthead (display-only; the status DB column, deriveStage, the details-table Status row, and the SchoolModal prep-for-call gate all untouched). /pipeline still live as a fallback pending Pass 3 deletion (its BulkImport link and its own duplicate sign-out remain until then). | Refactor + Brand |
| 2026-08-12 | Pipeline removal Pass 1 (editor rehome): school detail's Edit button now opens SchoolModal in place instead of routing to /pipeline — bringing the 6 unique editable fields (name, short_name, division, location, conference, last_contact), coach add/edit/delete, and delete-school in-house. The vestigial status field dropped from the editor (stage/milestone superseded it; new schools still get a default status on insert, existing status left untouched on save; the only remaining status-edit path is the /pipeline inline dropdown, which dies in Pass 3, and deriveStage still reads the column). SchoolModal brand-swept to Pitch Green (teal chrome retired, softer ink, green-period headers, pitch primaries; destructive red moved off the legacy crimson; data-semantic tier/admit/status pills untouched). School detail no longer depends on /pipeline for editing. | Refactor + Brand |
| 2026-08-12 | Housekeeping pass: deleted orphaned routes (/library, /questions, and the /dashboard redirect stub — its four auth-flow targets repointed straight to /pipeline) and dead components (CampsCalendar plus the unrouted HomeClient subtree: StatsStrip, HomeSchoolCard, StrategicSection, PendingCampDecisionsModal; the shelved ClassificationReviewClient + GmailPartialsClient). Retired the Parse Review settings UI the way Classification Review was (0 partials ever recorded; the webhook parse-failure data path and /api/gmail-partials backend stay) — settings nav now three items (Coach Changes, Camp Proposals, Gmail Settings). Fixed the (1 schools) singular-pluralization nit in the pipeline generator, removed the dead throttleDays post from new-campaign create, and documented the DraftModal coachId type-lie at its two call sites. Added log-only 404 tracking (not_found_log via migration 065 + a fire-and-forget /api/not-found-log beacon; no notification — a daily internal-404 digest stays deferred to future admin tooling) and a branded Offside. 404 page in the Throughball house style. | Cleanup + Feature |
| 2026-08-12 | Route rename pass: deep routes aligned with their labels — /assets→/kit, /messages→/talking-points, /camps→/calendar (with nested detail routes) — and every internal link, nav item, and cross-page deep-link updated in lockstep (7 + 2 + 23 references). No redirects (bookmarks not a concern). DB tables, API paths (incl. /api/assets), the @/lib/camps module, the SportsRecruits messages/thread URL regex, and internal type identifiers unchanged. Stale /library + /questions routes surfaced for a separate cleanup decision. | Cleanup |
| 2026-08-12 | Brand sweep Pass 4E (Campaigns + Settings): the shared CampaignChrome + SettingsChrome repointed their teal chrome (the four-step stepper, the Ready-to-review state pill, the designed empty-state check, the accent pill) to --tb-pitch; softer ink; masthead green periods. Regista named at the composition moment — the campaign copy now says Regista writes/personalizes each draft (New/Detail + DraftModal). DECISION: the Gmail sync-health dot stays a standard green/amber/gray health-status indicator (data-semantic status, not brand chrome). Completes the app brand system. | Brand |
| 2026-08-12 | Brand sweep Pass 4D (Calendar + Questionnaires): both Get Seen children migrated their old petrol accent to the shared --tb-pitch (masthead + section-header periods, softer ink). Calendar's shared MergedTimeline already pitch from 3B — its data dots stay; the camp tier/finn-status/event-kind badges are data. Questionnaires' tier chips + staleness banding are data, untouched. Organization — no Regista naming. | Brand |
| 2026-08-12 | Brand sweep Pass 4C (Talking Points + The kit): chrome → Pitch Green (masthead + section-header periods, softer ink). Talking Points' phase-guidance panel dropped its four jewel phase-colors for the shared ghost-numeral ramp (02→04, pitch eyebrows) so the app has ONE phase-color story matching the marketing Roadmap. The kit's slot glyphs → pitch, but the asset freshness ramp (green/amber/rust staleness) is data and left untouched; message-type dots are data too. Both surfaces are organization — no Regista naming needed. | Brand |
| 2026-08-12 | Brand sweep Pass 4B (Schools list + bench): neutral-chrome page — softer ink and green trailing periods on Schools. and The bench. The signal filter chips are wholly a data display (each shows its recency color — hot red / active teal / cooling amber — in both states), so they stay untouched; tier badges, recency dots, and struck-through declined rows are data too. No jewel accent existed and no judgment copy — organization is Throughball. | Brand |
| 2026-08-12 | Brand sweep Pass 4A (School Detail): chrome accents migrated to Pitch Green — teal inline-actions/links, the primary Draft-reply action, the + Add affordances, and section-header periods; softer ink. The conversation-summary card is now explicitly Regista's, marked with a Regista's-read eyebrow (the flagship judgment moment on the page). The charcoal offer cards, the benched Set-aside cards, and all data colors (recency chip, tier/milestone badges, action-category badges, inbound-message + Email/In-Person channel + timeline styling) are untouched. | Brand |
| 2026-08-12 | Brand sweep Pass 3D (Get In): page chrome migrated to Pitch Green (old violet act-accent → --tb-pitch, the endgame hero is now a full-fill pitch card with cream text, softer ink, green periods). The charcoal offer cards stay ink-weight (the §5 weight register, unchanged). The endgame move is attributed to Regista; offers/admissions data stays Throughball. Data-semantic colors untouched. This completes the four-phase brand system. | Brand |
| 2026-08-12 | Brand sweep Pass 3C (Get Recruited): page chrome migrated to Pitch Green — the priority hero is now a full-fill pitch card (cream text, ghost numeral), the board's awaiting ring (the your-move signal) migrated persimmon → pitch, softer ink, green periods. The next-move eyebrow and page subtitle attribute the judgment to Regista. The board's tile/recency/tier/temperature colors and the category stripes are untouched. | Brand |
| 2026-08-12 | Brand sweep Pass 3B (Get Seen): page + shared-timeline chrome migrated to the one-accent Pitch Green system (old petrol jewel accent → --tb-pitch, softer ink, green periods, solid cream on fills). The timeline data dots (camp green / showcase blue / outreach rust) and the toolkit metrics are untouched. | Brand |
| 2026-08-12 | Brand sweep Pass 3A (global nav): AppNav active-item, settings-pill, and mobile-badge states migrated from crimson to Pitch Green — app-wide nav chrome now on-brand. | Brand |
| 2026-08-12 | Brand sweep Pass 2 (Get Ready): page chrome migrated to the one-accent Pitch Green system (old emerald phase color → shared --tb-pitch token, softer brand ink, parchment grounds), self-reference naming swept to Throughball/Regista per catalog (discovery reasoning attributed to Regista), nav wordmark confirmed. Data-semantic colors (Targets bars, tier chips) untouched. | Brand |
| 2026-08-12 | Marketing CTA copy: primary CTAs changed from "Start free" to "Try it now →" (nav, hero, closing) — the trial/signup model isn't built yet, so "Start free" overpromised; /demo target and Pitch Green pill unchanged. | Copy |
| 2026-08-12 | Brand sweep Pass 1 (marketing page): Throughball mark + wordmark in nav and hero (old F-tile retired), color collapsed to the one-accent Pitch Green system (softer brand ink, parchment grounds), the four phases presented as the numbered Throughball Roadmap with the ghost-numeral ramp (no more four-hue phase colors), Regista surfaced as the named judgment engine with an intelligence moment, and full voice sweep to the brand register with the signature taglines. Data-semantic colors untouched. | Brand |
| 2026-08-11 | Brand sweep Pass 0 (foundations): Throughball design tokens established (Pitch Green + neutrals, kept separate from the untouched data-semantic taxonomy), reusable mark + wordmark components built (weighted pass-arrow, accented-period wordmark), and global self-reference strings renamed to Throughball/Regista (page-body copy cataloged for later per-page passes). Plumbing only — no page redesigns; visually inert except the brand component. | Brand |
| 2026-08-11 | Campaigns flow rework for new-user clarity: concept stated up front (one message, many coaches, personalized each), creation restructured into an explicit four-step stepper (Who / What / Review / Send) with disable-with-reason picking, talking-points integration at the message step, per-coach review before anything is sendable, and explicit send mechanics + confirm. Campaign list states legible; designed empty state; full house-language pass. Machinery unchanged — presentation, sequence, and copy. | UX |
| 2026-08-11 | Settings refresh: Classification Review retired (classifier outgrew human review; component shelved unimported and route unrouted, low-confidence handling verified end to end — queue empty at 0 pending, no human review action ever recorded, and low-confidence classifications already flow live because downstream surfacing keys on intent not confidence, so nothing was stranded), remaining four surfaces brought to the house language (masthead cascade, tightened rows, pill grammar, designed empty states that read an empty queue as a good state) with small functional fixes (Coach Changes and Camp Proposals rows deep-link to the school, proposal updates link to the camp, Gmail Settings surfaces sync health from last-sync freshness). Settings nav at four items. | Cleanup + UX |
| 2026-08-11 | Benched-school summary cards render a closed state (Set aside header + bench rationale from status updates; no recommendation, no regen) — Nope-tier schools no longer show frozen active-era recommendations. Colby seen-live milestone corrected to two viewings (Harvard camp Aug 3, Colby ID Aug 9). | UX fix + Data |
| 2026-08-10 | Board ring semantics fixed: the persimmon ring now requires both recency (awaiting Finn) and a non-wait recommendation — ring means your move, not merely your turn (the same judgment gate the queue's wait-exclusion applies). Wait-status actives (Middlebury, WPI) no longer ring; legend updated. | UX fix |
| 2026-08-09 | schools.notes retired end to end (content reviewed and discarded; removed from all generation prompts, UI, and via migration 064 the schema); strategic-notes generation input retired (live data empty; message-plan machinery untouched); Call prep upload entry point removed (generation is the section's action); school detail button audit — every action normalized to the house primary/filled, secondary/outlined, tertiary/link grammar with consistent radius and type. | Cleanup + Schema + UX |
| 2026-08-09 | School detail refinement: stage/milestone popovers gain standard dismissal (click-out, Esc, X); Show-alternatives deprecated from the summary card; Call prep promoted to its own section with purpose copy, doc list, and empty state; notes consolidated — Strategic notes and Notes cards retired (status updates carry the role), masthead +Note replaced by an in-zone add with three capture types, legacy content preserved read-only; timeline Log entry form restyled to the house language. | UX |
| 2026-08-09 | School detail rework: reorganized from feature-era accretion into four mental-mode zones — masthead + standing state (consolidated header block; charcoal offer cards surfaced above the fold; ConversationSummaryCard as the page hero), The conversation (timeline, recent-8 with show-all), The staff (coaches + call prep), Your notes (the four capture panels consolidated into one review area) — with camps + RQ as a compact logistics strip. Neutral chrome (page serves every phase), de-eyebrowed, tightened rows, no logic changes. | UX |
| 2026-08-09 | Schools page rework: row-expand accordion removed — whole row navigates to school detail (real link semantics); new collapsed Bench section surfaces Nope/Inactive schools (a bench, not a graveyard — muted rows, live count, same navigation); house-language review pass (masthead cascade, row tightening, palette stragglers, filter set reviewed). | UX |
| 2026-08-09 | Questionnaires page: dedicated RQ workbench at /questionnaires (Get Seen child, petrol) — lifecycle sections (Not started / Needs an update / Current, 180-day staleness) over active schools with inline RQ links, Add-link + search finder for missing URLs, and Mark completed/updated actions sharing the school detail write path. Built on the existing RQ fields (audit-first, no parallel schema). Get Seen card re-pointed and metric enriched via a shared helper. | Feature + UX |
| 2026-08-09 | Camps page rework: retitled Calendar (route unchanged; consistency list grows), restructured — merged 10-week timeline as the hero (shared component with Get Seen), one unified chronological Up next list interleaving camps and events with kind-appropriate actions, long tail collapsed into Past & done. House styling pass (petrol chrome, house pills, tightened rows); functionality review of the status flow, event modal, and legacy view toggle. | UX |
| 2026-08-09 | Assets page rework: retitled The kit (route unchanged; consistency pass now covers /messages + /assets), purpose copy added, restructured from a flat list into slot-based sections — The essentials (2x2 canonical slots with filled/empty states, designed empty invitations, freshness banding, matching the Get Ready grid) and The shelf (everything else, tightened). Per-type upload guidance lines. | UX |
| 2026-08-09 | Messages page rework: retitled Talking points (route unchanged), restructured from a flat list into lifecycle sections — Needs a look (stale/expired triage with inline Refresh/Retire), In rotation, Your questions, Archived (collapsed) — with tightened row treatment. New collapsible phase-guidance panel (What coaches need to hear, phase by phase) in the jewel colors, static copy. Second-person sweep, de-eyebrowed. | UX |
| 2026-08-09 | Get In cascade: violet migration (page chrome; offer cards keep their charcoal weight register), masthead subtitle added, new full-fill violet hero card driven by pickEndgameMove (unmet offer conditions > near key dates > missing visits > quiet state — Clark CommonApp leads today), OFFERS/ENDGAME eyebrows removed per the de-eyebrow precedent (Advanced schools → The short list). | UX |
| 2026-08-09 | Get Recruited: removed the QUEUE and PIPELINE section eyebrows per the de-eyebrow precedent (Get Ready pass 2); each section keeps only its bold-italic header (Up next. / The board.), spacing adjusted. Display-only. | UX |
| 2026-08-09 | Get Recruited rework: masthead cascade (descriptive subtitle added; status line + offer fragment removed — queue priority carries both), persimmon migration from the marketing ladder (page chrome + board accents; category stripes untouched), priority card rebuilt as a full-fill persimmon hero with visible ghost numerals, and the board redesigned — Awaiting Finn row removed (awaiting is whose-turn, not a temperature; those schools fold into Active with a persimmon ring marker), rows now a clean Active-to-Prospecting gradient, marketing zone tints and chip styling pulled through. | UX |
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

HISTORICAL: the app once had a "Copy for Claude" button on the /pipeline page (DashboardClient) that
copied a formatted plaintext pipeline summary to the clipboard for Claude.ai strategy sessions. That
button was removed when /pipeline was deleted (see the Throughball Rebrand + Productization section in
9). Its role is now served directly by this file — Section 11 (Live Pipeline) is regenerated from the
DB by npm run export-context. The legacy per-school format was:
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

---

---

---

---

## 15. Foreign Key Graph — Generated August 22, 2026

<!-- GENERATED — do not hand-edit; regenerate with `npm run export-context` -->

Read from the LIVE CATALOG via `public.fk_graph()`, never from `supabase/migrations/`.
**Before any chunk's SQL, paste the closure below for the tables that chunk touches into the sitting.**
That step is what turns this from available into consulted; it costs one paste.

> **UNAVAILABLE this regeneration.** `public.fk_graph()` did not answer:
> `Could not find the function public.fk_graph without parameters in the schema cache`
>
> Do NOT substitute a reading of `supabase/migrations/` — it is a partial record
> and answers this question wrongly with full confidence. Run the closure by hand
> against the catalog for the tables a chunk touches until the RPC is restored.

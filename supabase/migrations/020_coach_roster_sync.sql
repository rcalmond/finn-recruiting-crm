-- Migration 020: coach roster sync infrastructure
--
-- Adds:
--   1. Three columns on schools for scraper state tracking
--   2. coach_changes audit table — every detected roster diff is logged here
--      before being applied to coaches. The review UI reads this table;
--      the cron writes to it.
--
-- Apply strategy:
--   coach_added    → status='manual' (normal run) or 'seed' (--initial-seed)
--   coach_departed → always 'manual'; never auto-deleted
--   email_added    → status='auto' (normal) or 'seed' (--initial-seed)
--   email_changed  → always 'manual'
--   role_changed   → always 'manual'
--   name_changed   → always 'manual'

-- ── schools additions ─────────────────────────────────────────────────────────

-- URL of the school's official men's soccer coaches page.
-- Populated by discover-coach-urls.ts or set manually in the UI.
alter table public.schools
  add column coach_page_url text;

-- Timestamp of the last successful scrape for this school.
-- NULL = never scraped. Used by the cron to determine staleness.
alter table public.schools
  add column coach_page_last_scraped_at timestamptz;

-- Error message from the most recent failed scrape.
-- Cleared on next success. Surfaced in the review UI for diagnostics.
alter table public.schools
  add column coach_page_last_error text;

-- ── coach_changes audit table ─────────────────────────────────────────────────

create table public.coach_changes (
  id            uuid        primary key default gen_random_uuid(),
  school_id     uuid        not null references public.schools(id) on delete cascade,

  change_type   text        not null check (change_type in (
    'coach_added',
    'coach_departed',
    'email_added',
    'email_changed',
    'role_changed',
    'name_changed'
  )),

  -- FK to coaches.id — null for coach_added before the row is created,
  -- and set to null on delete for coach_departed if the coach is later removed.
  coach_id      uuid        references public.coaches(id) on delete set null,

  -- Structured payload. Shape varies by change_type:
  --   coach_added:    { name, role, email, phone }
  --   coach_departed: { name, role, email }       ← snapshot at departure time
  --   email_added:    { name, email_new }
  --   email_changed:  { name, email_before, email_after }
  --   role_changed:   { name, role_before, role_after }
  --   name_changed:   { name_before, name_after }
  details       jsonb       not null,

  -- Lifecycle status:
  --   manual  → detected, awaiting human review (default for most changes)
  --   auto    → applied automatically without review (email_added on normal runs)
  --   seed    → applied during --initial-seed bulk import
  --   applied → reviewer accepted and applied the change
  --   rejected → reviewer dismissed the change
  status        text        not null default 'manual' check (status in (
    'auto', 'manual', 'applied', 'rejected', 'seed'
  )),

  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewer_note text
);

-- Lookup by school (for the review UI grouping)
create index coach_changes_school_idx
  on public.coach_changes (school_id);

-- Lookup by status (pending review filter: WHERE status = 'manual')
create index coach_changes_status_idx
  on public.coach_changes (status);

-- Default sort: newest first
create index coach_changes_created_idx
  on public.coach_changes (created_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.coach_changes enable row level security;

-- Cron and scripts use the service role — full access
create policy "Service role manages coach_changes"
  on public.coach_changes
  for all
  using (auth.role() = 'service_role');

-- Authenticated users (Randy, Finn) can read for the review UI
create policy "Authenticated users can read coach_changes"
  on public.coach_changes
  for select
  using (auth.role() = 'authenticated');

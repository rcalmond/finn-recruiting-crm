-- Migration 057: Recruiting funnel rework phase 1
--
-- 1. schools.recruiting_stage (1-6 ladder):
--    1=Research, 2=Reach out, 3=Engage, 4=Evaluate, 5=Advance, 6=Decide
--    Constraint enforced via TypeScript union, not DB check (house convention).
--    Default 1 (Research). Auto-derived floor for 1-3 from contact_log;
--    manual promotion for 4-6. Never auto-demotes (high-water mark).
--
-- 2. school_milestones: discrete event badges per school.
--    Manual-only (no auto-derivation). One badge per type per school.

-- ── 1. Add recruiting_stage to schools ──────────────────────────────────────

alter table public.schools
  add column recruiting_stage smallint not null default 1;

-- ── 2. Create school_milestones table ───────────────────────────────────────

create table public.school_milestones (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  milestone     text not null,
  occurred_on   date,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (school_id, milestone)
);

create trigger school_milestones_updated_at
  before update on school_milestones
  for each row execute function public.set_updated_at();

alter table school_milestones enable row level security;
create policy "auth users full access on school_milestones"
  on school_milestones for all to authenticated
  using (true) with check (true);

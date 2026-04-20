-- 012_coaches.sql
-- Creates the coaches table as a proper relational model for per-coach data.
--
-- schools.head_coach and schools.coach_email are left intact as read-only
-- legacy fields. Apps read from this table going forward with fallback to
-- legacy fields if no coach records exist.

-- ─── Coaches table ────────────────────────────────────────────────────────────

create table public.coaches (
  id           uuid        primary key default gen_random_uuid(),
  school_id    uuid        not null references public.schools(id) on delete cascade,
  name         text        not null,
  role         text        not null
                           check (role in ('Head Coach', 'Associate Head Coach', 'Assistant Coach', 'Other')),
  email        text,
  is_primary   boolean     not null default false,
  needs_review boolean     not null default false,
  sort_order   integer     not null default 0,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Reuse the set_updated_at function defined in 001_initial_schema.sql
create trigger coaches_updated_at
  before update on public.coaches
  for each row execute function public.set_updated_at();

-- Enforce at most one is_primary = true coach per school
create unique index coaches_school_primary_unique
  on public.coaches (school_id)
  where (is_primary = true);

-- ─── Add generic_team_email to schools ───────────────────────────────────────

alter table public.schools
  add column generic_team_email text;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table public.coaches enable row level security;

create policy "auth users full access on coaches"
  on public.coaches for all to authenticated
  using (true)
  with check (true);

-- ─── Realtime ─────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.coaches;

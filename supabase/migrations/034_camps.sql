-- Migration 034: ID Camps
--
-- Four tables for tracking ID camps, school/coach attendance, and Finn's
-- registration status. Backfills 7 camps from existing id_camp_* columns
-- and manual research. Drops the legacy id_camp_1/2/3 columns from schools.

-- ── 1. Create tables ─────────────────────────────────────────────────────────

create table public.camps (
  id                    uuid primary key default gen_random_uuid(),
  host_school_id        uuid not null references schools(id) on delete cascade,
  name                  text not null,
  start_date            date not null,
  end_date              date not null,
  location              text,
  registration_url      text,
  registration_deadline date,
  cost                  text,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_camps_start_date on camps(start_date);
create index idx_camps_host_school on camps(host_school_id);

create trigger camps_updated_at
  before update on camps
  for each row execute function public.set_updated_at();

create table public.camp_school_attendees (
  id          uuid primary key default gen_random_uuid(),
  camp_id     uuid not null references camps(id) on delete cascade,
  school_id   uuid not null references schools(id) on delete cascade,
  source      text not null default 'advertised',
  notes       text,
  created_at  timestamptz not null default now(),
  unique (camp_id, school_id)
);

create index idx_camp_school_attendees_school on camp_school_attendees(school_id);

create table public.camp_coach_attendees (
  id           uuid primary key default gen_random_uuid(),
  camp_id      uuid not null references camps(id) on delete cascade,
  coach_id     uuid not null references coaches(id) on delete cascade,
  source       text not null default 'advertised',
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (camp_id, coach_id)
);

create table public.camp_finn_status (
  id              uuid primary key default gen_random_uuid(),
  camp_id         uuid not null references camps(id) on delete cascade,
  status          text not null default 'interested',
  registered_at   timestamptz,
  attended_at     timestamptz,
  declined_at     timestamptz,
  declined_reason text,
  notes           text,
  action_item_id  uuid references action_items(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (camp_id)
);

create index idx_camp_finn_status_camp on camp_finn_status(camp_id);

-- ── 2. RLS ───────────────────────────────────────────────────────────────────

alter table camps enable row level security;
create policy "Authenticated users can manage camps"
  on camps for all to authenticated
  using (true) with check (true);

alter table camp_school_attendees enable row level security;
create policy "Authenticated users can manage camp_school_attendees"
  on camp_school_attendees for all to authenticated
  using (true) with check (true);

alter table camp_coach_attendees enable row level security;
create policy "Authenticated users can manage camp_coach_attendees"
  on camp_coach_attendees for all to authenticated
  using (true) with check (true);

alter table camp_finn_status enable row level security;
create policy "Authenticated users can manage camp_finn_status"
  on camp_finn_status for all to authenticated
  using (true) with check (true);

-- ── 3. Realtime publication ──────────────────────────────────────────────────

alter publication supabase_realtime add table public.camps;
alter publication supabase_realtime add table public.camp_school_attendees;
alter publication supabase_realtime add table public.camp_coach_attendees;
alter publication supabase_realtime add table public.camp_finn_status;

-- ── 4. Backfill 7 camps ─────────────────────────────────────────────────────
-- Uses CTEs to look up host_school_id by short_name (no hardcoded UUIDs).

with host_schools as (
  select id, short_name from schools
  where short_name in ('Cal Poly SLO', 'Lafayette', 'SD Mines')
),

inserted_camps as (
  insert into camps (host_school_id, name, start_date, end_date, location, registration_url)
  values
    -- Cal Poly SLO: Camp 1
    ((select id from host_schools where short_name = 'Cal Poly SLO'),
     'Cal Poly Men''s Soccer ID Camp',
     '2026-05-09', '2026-05-10',
     'San Luis Obispo, CA',
     'https://calpolymenssoccer.totalcamps.com/'),

    -- Cal Poly SLO: Camp 2
    ((select id from host_schools where short_name = 'Cal Poly SLO'),
     'Cal Poly Men''s Soccer ID Camp',
     '2026-08-01', '2026-08-02',
     'San Luis Obispo, CA',
     'https://calpolymenssoccer.totalcamps.com/'),

    -- Lafayette: PPA Mass 1
    ((select id from host_schools where short_name = 'Lafayette'),
     'PPA Mass 1',
     '2026-06-26', '2026-06-28',
     'Amherst College, Amherst, MA',
     'https://peakperformancesoccer.com/'),

    -- Lafayette: PPA Penn 1
    ((select id from host_schools where short_name = 'Lafayette'),
     'PPA Penn 1',
     '2026-07-10', '2026-07-12',
     'Lafayette College, Easton, PA',
     'https://peakperformancesoccer.com/'),

    -- Lafayette: PPA Penn 2
    ((select id from host_schools where short_name = 'Lafayette'),
     'PPA Penn 2',
     '2026-07-16', '2026-07-18',
     'Lafayette College, Easton, PA',
     'https://peakperformancesoccer.com/'),

    -- Lafayette: PPA Mass 2
    ((select id from host_schools where short_name = 'Lafayette'),
     'PPA Mass 2',
     '2026-07-24', '2026-07-26',
     'Amherst College, Amherst, MA',
     'https://peakperformancesoccer.com/'),

    -- SD Mines: ID Camp
    ((select id from host_schools where short_name = 'SD Mines'),
     'SD Mines ID Camp',
     '2026-07-16', '2026-07-16',
     null,
     'https://www.hardrockermenssoccer.com/south-dakota-mines-id-camp.cfm')

  returning id, name, start_date
)

-- ── 5. Backfill Finn's status for each camp ──────────────────────────────────

insert into camp_finn_status (camp_id, status, declined_at, declined_reason)
select
  ic.id,
  case
    when ic.name = 'Cal Poly Men''s Soccer ID Camp' and ic.start_date = '2026-05-09'
      then 'declined'
    when ic.name = 'SD Mines ID Camp'
      then 'declined'
    else 'interested'
  end,
  case
    when ic.name = 'Cal Poly Men''s Soccer ID Camp' and ic.start_date = '2026-05-09'
      then now()
    when ic.name = 'SD Mines ID Camp'
      then '2026-04-19T00:00:00Z'::timestamptz
    else null
  end,
  case
    when ic.name = 'SD Mines ID Camp'
      then 'Schedule conflict — asked about alternative ways to get in front of staff'
    else null
  end
from inserted_camps ic;

-- ── 6. Verify backfill counts ─────────────────────────────────────────────────

do $$
declare
  camp_count integer;
  status_count integer;
begin
  select count(*) into camp_count from camps;
  select count(*) into status_count from camp_finn_status;

  if camp_count != 7 then
    raise exception 'Expected 7 camps, got %', camp_count;
  end if;

  if status_count != 7 then
    raise exception 'Expected 7 camp_finn_status rows, got %', status_count;
  end if;

  raise notice 'Backfill verified: % camps, % finn_status rows', camp_count, status_count;
end $$;

-- ── 7. Drop legacy id_camp columns from schools ─────────────────────────────

alter table schools drop column if exists id_camp_1;
alter table schools drop column if exists id_camp_2;
alter table schools drop column if exists id_camp_3;

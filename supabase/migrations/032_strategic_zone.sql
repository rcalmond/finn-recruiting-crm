-- Migration 032: Strategic zone foundation
--
-- schools.rq_link: URL to school's recruiting questionnaire
-- player_profile.current_reel_*: canonical "current reel" for coverage prompts
-- strategic_skips: weekly prompt dismissal tracking

-- Schools: RQ link
alter table public.schools
  add column rq_link text;

-- Player profile: current reel tracking
alter table public.player_profile
  add column current_reel_url text,
  add column current_reel_title text,
  add column current_reel_updated_at timestamptz;

-- Strategic skips table
create table public.strategic_skips (
  id uuid primary key default gen_random_uuid(),
  prompt_key text not null,
  week_start date not null,
  created_at timestamptz default now()
);

create index idx_strategic_skips_week
  on public.strategic_skips(week_start, prompt_key);

alter table public.strategic_skips enable row level security;

create policy "Authenticated users can manage strategic_skips"
  on public.strategic_skips for all
  to authenticated
  using (true)
  with check (true);

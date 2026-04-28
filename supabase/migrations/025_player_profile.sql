-- Migration 025: player_profile singleton table
-- Stores structured fields parsed from Finn's Soccer Resume.
-- AI email generation reads from these fields, not the raw document.

create table public.player_profile (
  id                uuid primary key default gen_random_uuid(),
  current_stats     text,
  upcoming_schedule text,
  highlights        text,
  academic_summary  text,
  last_parsed_at    timestamptz,
  source_asset_id   uuid references public.assets(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Singleton enforcement: only one row can ever exist
create unique index player_profile_singleton on public.player_profile ((true));

-- RLS: same pattern as all other tables — authenticated users full access
alter table public.player_profile enable row level security;

create policy "Authenticated users can read player_profile"
  on public.player_profile for select
  to authenticated
  using (true);

create policy "Authenticated users can insert player_profile"
  on public.player_profile for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update player_profile"
  on public.player_profile for update
  to authenticated
  using (true)
  with check (true);

-- updated_at trigger (matches convention from other tables)
create or replace function public.update_player_profile_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger player_profile_updated_at
  before update on public.player_profile
  for each row
  execute function public.update_player_profile_updated_at();

-- Voice reference query: 15 most recent substantive Finn-authored outbound emails
-- post-wingback transition (Nov 2025). Used by email draft prompt builder.
create or replace function public.get_voice_references()
returns table (
  summary text,
  date date,
  school_name text,
  coach_name text
)
language sql stable
security definer
as $$
  select cl.summary, cl.date, s.name as school_name, c.name as coach_name
  from contact_log cl
  join schools s on s.id = cl.school_id
  left join coaches c on c.id = cl.coach_id
  where cl.direction = 'Outbound'
    and cl.date >= '2025-11-01'
    and cl.parse_status = 'full'
    and cl.summary is not null
    and length(cl.summary) > 100
  order by cl.date desc
  limit 15;
$$;

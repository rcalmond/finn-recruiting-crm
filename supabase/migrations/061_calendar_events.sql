-- Migration 061: calendar_events + calendar_event_schools
-- Lightweight parallel event table for the recruiting calendar's other species:
--   - showcases / tournaments Finn ATTENDS that aren't school-hosted
--   - outreach send-MOMENTS Finn sends (reel drop, season update, schedule release)
-- Merged with camps at DISPLAY time on the Get Seen timeline. Camps' machinery
-- (proposals, finn_status, coach attendance) is untouched — this is parallel.

create table calendar_events (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,
    -- 'showcase' | 'tournament' | 'outreach_moment' | 'other'
    -- TypeScript union CalendarEventKind, no DB constraint (text-first, house pattern)
  name         text not null,
  start_date   date not null,
  end_date     date,          -- null = single day
  location     text,          -- city/venue; null for outreach moments
  note         text,
  status       text not null default 'planned',
    -- 'planned' | 'confirmed' | 'done' | 'skipped'
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Primary browse/merge path is chronological.
create index calendar_events_start_date_idx on calendar_events(start_date);

-- updated_at trigger (reuses set_updated_at from 001_initial_schema).
-- Migration 058 shipped WITHOUT its trigger and it had to be patched by hand —
-- do not omit this.
create trigger calendar_events_updated_at
  before update on calendar_events
  for each row execute function public.set_updated_at();

-- RLS: authenticated users full access (house idiom)
alter table calendar_events enable row level security;
create policy "auth users full access on calendar_events"
  on calendar_events for all to authenticated
  using (true) with check (true);

-- Realtime (matches school_offers / campaigns pattern for reactive management UI)
alter publication supabase_realtime add table calendar_events;

-- ── Optional school linkage ──────────────────────────────────────────────────
-- Nullable relationship — most events link no schools. A showcase can reference
-- target-school coaches attending; an outreach moment can aim at specific schools.
create table calendar_event_schools (
  event_id   uuid not null references calendar_events(id) on delete cascade,
  school_id  uuid not null references schools(id) on delete cascade,
  primary key (event_id, school_id)
);

alter table calendar_event_schools enable row level security;
create policy "auth users full access on calendar_event_schools"
  on calendar_event_schools for all to authenticated
  using (true) with check (true);

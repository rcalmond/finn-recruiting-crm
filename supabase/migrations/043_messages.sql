-- Migration 043: Messages inventory table
--
-- Foundation for the messaging strategy system. Stores the things Finn wants
-- to communicate (updates) or ask (questions) across schools.

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  type            text not null
                  check (type in ('update', 'question')),
  notes           text,
  expires_at      timestamptz,
  status          text not null default 'active'
                  check (status in ('active', 'archived')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index messages_status_idx on messages(status) where status = 'active';
create index messages_type_idx on messages(type);

create trigger messages_updated_at
  before update on messages
  for each row execute function public.set_updated_at();

alter table messages enable row level security;
create policy "Authenticated users full access"
  on messages for all
  using (auth.role() = 'authenticated');

-- Seed data: the items Randy already identified

insert into messages (title, type, notes) values
  -- Updates
  ('End of season — starter at LWB', 'update',
   '9-2-3 regular season, 3 goals and 2 assists, advancing to MLS NEXT Cup in Utah. Finn started at left wingback all season for Albion SC Boulder County MLS NEXT Academy U19.'),
  ('MLS NEXT Cup schedule', 'update',
   'Share when known (expected within a day or two). Utah, late May. Coaches may attend or schedule scouts. Once Finn has match dates and times, share with all schools who said they''d try to scout.'),
  ('SAT score improvement', 'update',
   'New total: 1380 (up from 1340). Update player_profile and mention in next round of outreach to academically-focused schools.'),
  ('Summer team: Flatirons FC USL-A', 'update',
   'In addition to Albion MLS NEXT, Finn will play for Flatirons FC on their USL-A team over the summer. Additional competitive reps and scouting opportunity.'),

  -- Questions
  ('Will you be at MLS NEXT Cup in Utah?', 'question',
   'Where can Finn meet you? Use this to coordinate in-person introductions during the tournament.'),
  ('How do you play with wingbacks?', 'question',
   'Use answer to determine tactical fit. Some schools use true wingbacks (3-4-3, 3-5-2), others use hybrid fullback/winger roles. Tactical mismatch = bad fit regardless of academic fit.'),
  ('Are you recruiting 2027 players like Finn?', 'question',
   'Direct question about whether the 2027 class has space for a left wingback. Helps narrow which schools are realistic vs. aspirational.'),
  ('Open to a phone call?', 'question',
   'Goal: 30-minute call to learn about the program, coaching philosophy, and recruiting timeline. Prioritize for tier A schools after relationship is established.'),
  ('How are you using ID camps this summer/fall?', 'question',
   'Coaches recruit differently — some heavily through camps, some through MLS NEXT scouting, some through showcase events. Knowing this helps Finn prioritize which camps to attend given limited time/cost.');

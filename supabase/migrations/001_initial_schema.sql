-- ============================================================
-- Finn Almond Recruiting CRM — Initial Schema
-- Run in Supabase SQL Editor (or via supabase db push)
-- ============================================================

create extension if not exists "pgcrypto";

-- ─── Schools ─────────────────────────────────────────────────────────────────

create table public.schools (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  short_name          text,
  category            text not null default 'B'
                      check (category in ('A','B','C','Nope')),
  division            text not null check (division in ('D1','D2','D3')),
  conference          text,
  location            text,
  status              text not null default 'Not Contacted'
                      check (status in ('Not Contacted','Intro Sent','Ongoing Conversation','Visit Scheduled','Offer','Inactive')),
  last_contact        date,
  head_coach          text,
  coach_email         text,
  admit_likelihood    text
                      check (admit_likelihood in ('Likely','Target','Reach','Far Reach') or admit_likelihood is null),
  rq_status           text,
  videos_sent         boolean not null default false,
  notes               text,
  next_action         text,
  next_action_owner   text check (next_action_owner in ('Finn','Randy') or next_action_owner is null),
  next_action_due     date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger schools_updated_at
  before update on public.schools
  for each row execute function public.set_updated_at();

-- ─── Contact Log ──────────────────────────────────────────────────────────────

create table public.contact_log (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  date        date not null default current_date,
  channel     text not null default 'Email'
              check (channel in ('Email','Phone','In Person','Text','Sports Recruits')),
  direction   text not null default 'Outbound'
              check (direction in ('Outbound','Inbound')),
  coach_name  text,
  summary     text not null,
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Private app — any authenticated user gets full access to all data.

alter table public.schools     enable row level security;
alter table public.contact_log enable row level security;

create policy "auth users full access on schools"
  on public.schools for all to authenticated
  using (true) with check (true);

create policy "auth users full access on contact_log"
  on public.contact_log for all to authenticated
  using (true) with check (true);

-- ─── Realtime ─────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.schools;
alter publication supabase_realtime add table public.contact_log;

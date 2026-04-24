-- Migration 024: Campaigns foundation
-- Apply manually via Supabase dashboard → SQL editor → Run
-- This project does not use automated migration tooling.
--
-- Changes:
--   Creates three new tables for the outbound campaign system:
--
--   campaign_templates — reusable email bodies with Mustache-style placeholders.
--     Supported placeholders: {{coach_last_name}}, {{coach_first_name}},
--     {{school_name}}, {{coach_role}}. Templates are first-class objects; a
--     single template may back multiple campaigns in later phases.
--
--   campaigns — a named campaign targeting a set of schools. Points to one
--     template; tracks status (draft → active → paused → completed).
--     tier_scope and throttle_days are stored but throttle enforcement is
--     deferred to Phase 2b — no code reads throttle_days in Phase 2a.
--
--   campaign_schools — per-school record within a campaign. Tracks send status
--     (pending → sent | dismissed | bounced), the coach recommended as primary
--     recipient, and a FK back to contact_log when a send is logged.
--
-- After running, verify with:
--   select table_name from information_schema.tables
--   where table_schema = 'public'
--     and table_name in ('campaign_templates','campaigns','campaign_schools');
--
--   select count(*) from public.campaign_templates;  -- should be 0
--   select count(*) from public.campaigns;           -- should be 0
--   select count(*) from public.campaign_schools;    -- should be 0

-- ── campaign_templates ────────────────────────────────────────────────────────

create table public.campaign_templates (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  body        text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.campaign_templates is
  'Reusable email body templates with Mustache-style placeholders. '
  'Supported: {{coach_last_name}}, {{coach_first_name}}, {{school_name}}, {{coach_role}}.';

-- ── campaigns ─────────────────────────────────────────────────────────────────

create table public.campaigns (
  id             uuid        primary key default gen_random_uuid(),
  name           text        not null,
  template_id    uuid        not null references public.campaign_templates(id),
  status         text        not null check (status in ('draft','active','paused','completed')),
  tier_scope     text[]      not null default array['A','B'],
  throttle_days  int         not null default 7,
  created_at     timestamptz not null default now(),
  activated_at   timestamptz,
  completed_at   timestamptz
);

comment on column public.campaigns.throttle_days is
  'Minimum days between sends to the same school. Stored for Phase 2b; not enforced in Phase 2a.';

comment on column public.campaigns.tier_scope is
  'Advisory tier filter used to pre-populate school scope at campaign creation. '
  'Finn can add C-tier schools manually. Nope tier is never included.';

create index campaigns_status_idx on public.campaigns (status);

-- ── campaign_schools ──────────────────────────────────────────────────────────

create table public.campaign_schools (
  id              uuid        primary key default gen_random_uuid(),
  campaign_id     uuid        not null references public.campaigns(id) on delete cascade,
  school_id       uuid        not null references public.schools(id),
  coach_id        uuid        references public.coaches(id),
  status          text        not null check (status in ('pending','sent','dismissed','bounced')),
  sent_at         timestamptz,
  contact_log_id  uuid        references public.contact_log(id),
  dismissed_at    timestamptz,
  created_at      timestamptz not null default now(),

  unique (campaign_id, school_id)
);

comment on column public.campaign_schools.coach_id is
  'Recommended primary recipient at draft time. Nullable — some schools have no '
  'current primary coach in our data. Updated to current primary coach when Finn opens the draft.';

comment on column public.campaign_schools.contact_log_id is
  'Set when status=''sent''. Either from the data migration (historical sends) '
  'or from the send flow when Finn marks a draft sent.';

comment on column public.campaign_schools.dismissed_at is
  'Set when status=''dismissed''. Removes school from THIS campaign only; '
  'school remains eligible for future campaigns.';

create index campaign_schools_campaign_status_idx
  on public.campaign_schools (campaign_id, status);

create index campaign_schools_school_idx
  on public.campaign_schools (school_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
--
-- All three tables follow the same pattern as action_items: authenticated users
-- get full access (this is a private, two-person app — no row-level user scoping
-- is needed). Service role access is implicit (bypasses RLS by design).

alter table public.campaign_templates enable row level security;
alter table public.campaigns          enable row level security;
alter table public.campaign_schools   enable row level security;

create policy "auth users full access on campaign_templates"
  on public.campaign_templates for all to authenticated
  using (true) with check (true);

create policy "auth users full access on campaigns"
  on public.campaigns for all to authenticated
  using (true) with check (true);

create policy "auth users full access on campaign_schools"
  on public.campaign_schools for all to authenticated
  using (true) with check (true);

-- ── Realtime ──────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.campaign_templates;
alter publication supabase_realtime add table public.campaigns;
alter publication supabase_realtime add table public.campaign_schools;

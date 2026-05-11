-- Migration 039: LLM-generated campaign email drafts
--
-- Adds message_set to campaigns (free-form lines of what Finn wants to
-- communicate this round). Adds campaign_email_drafts cache table for
-- per-school generated bodies.

-- Campaign message set
alter table campaigns
  add column message_set text;
comment on column campaigns.message_set is
  'Free-form text, one message per line. Used as input to LLM email generation for personalized per-school drafts.';

-- Campaign email drafts cache
create table campaign_email_drafts (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references campaigns(id) on delete cascade,
  school_id           uuid not null references schools(id) on delete cascade,
  coach_id            uuid references coaches(id) on delete set null,
  subject             text not null,
  body                text not null,
  generated_at        timestamptz not null default now(),
  regenerated_at      timestamptz,
  regeneration_count  integer not null default 0,
  model_used          text not null default 'claude-sonnet-4-6',
  input_tokens        integer,
  output_tokens       integer,
  created_at          timestamptz not null default now(),
  unique (campaign_id, school_id, coach_id)
);

create index campaign_email_drafts_campaign_idx
  on campaign_email_drafts(campaign_id);
create index campaign_email_drafts_school_idx
  on campaign_email_drafts(school_id);

alter table campaign_email_drafts enable row level security;
create policy "Authenticated users full access"
  on campaign_email_drafts for all
  using (auth.role() = 'authenticated');

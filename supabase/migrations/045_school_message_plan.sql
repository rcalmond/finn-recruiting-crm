-- Migration 045: School message plan + campaign inventory tracking
--
-- Per-school communications plan with LLM-generated suggestions.
-- Campaign source_message_ids tracks which inventory items a campaign references.

create table public.school_message_plan (
  id                        uuid primary key default gen_random_uuid(),
  school_id                 uuid not null unique references schools(id) on delete cascade,
  finn_notes                text,
  suggestions               jsonb,
  suggestions_generated_at  timestamptz,
  suggestions_model_used    text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index school_message_plan_school_idx
  on school_message_plan(school_id);

create trigger school_message_plan_updated_at
  before update on school_message_plan
  for each row execute function public.set_updated_at();

alter table school_message_plan enable row level security;
create policy "Authenticated users full access"
  on school_message_plan for all
  using (auth.role() = 'authenticated');

-- Campaign inventory tracking
alter table campaigns
  add column source_message_ids uuid[];

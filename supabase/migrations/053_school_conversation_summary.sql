-- Migration 053: School conversation summary
--
-- Cached LLM-generated conversation summaries for the school detail page.
-- Singleton per school (UNIQUE on school_id). Regenerated on every
-- contact_log insert via fire-and-forget hook in gmail-sync and sendgrid-inbound.

create table public.school_conversation_summary (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null unique references schools(id) on delete cascade,
  summary               text not null,
  recommended_action    jsonb not null,
  last_contact_log_id   uuid references contact_log(id) on delete set null,
  generated_at          timestamptz not null default now(),
  model_used            text not null default 'claude-opus-4-7',
  input_tokens          integer,
  output_tokens         integer,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger school_conversation_summary_updated_at
  before update on school_conversation_summary
  for each row execute function public.set_updated_at();

alter table school_conversation_summary enable row level security;
create policy "auth users full access on school_conversation_summary"
  on school_conversation_summary for all to authenticated
  using (true) with check (true);

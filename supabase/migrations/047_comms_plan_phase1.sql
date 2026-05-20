-- Migration 047: Communications Plan Phase 1
-- Q&A history for "Ask about this school" + manual suggestion ordering

-- Q&A history table
create table school_plan_questions (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  question        text not null,
  answer          text not null,
  model_used      text,
  created_at      timestamptz not null default now()
);

create index school_plan_questions_school_idx
  on school_plan_questions(school_id, created_at desc);

alter table school_plan_questions enable row level security;
create policy "Authenticated users full access"
  on school_plan_questions for all
  using (auth.role() = 'authenticated');

-- Manual suggestion ordering on school_message_plan
-- Array of message_ids representing Finn's preferred display order.
-- When present, UI orders suggestions by this array; new items append after.
-- When null, pure LLM priority order is used.
alter table school_message_plan
  add column manual_order uuid[];

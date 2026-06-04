-- Migration 049: call_prep_docs table
-- Dedicated storage for call prep documents, separate from the asset library.
-- Each row is one generated prep doc for a school + coach combination.
-- Latest by generated_at is "current"; all rows are historical.

create table call_prep_docs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  coach_id uuid references coaches(id) on delete set null,
  coach_name_snapshot text not null,
  framing_notes text,
  docx_storage_path text not null,
  tool_call_count int,
  generated_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now()
);

create index call_prep_docs_school_id_generated_at_idx
  on call_prep_docs(school_id, generated_at desc);

-- RLS: authenticated users get full access (same pattern as other tables)
alter table call_prep_docs enable row level security;

create policy "Authenticated users full access" on call_prep_docs
  for all using (auth.role() = 'authenticated');

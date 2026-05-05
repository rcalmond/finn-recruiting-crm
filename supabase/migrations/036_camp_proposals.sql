-- Migration 036: Camp proposals for automated camp discovery
--
-- Stores proposed camps extracted from emails or web search.
-- Proposals are reviewed in /settings/camp-proposals before becoming camps.

create table public.camp_proposals (
  id              uuid primary key default gen_random_uuid(),
  source          text not null
                  check (source in ('email_extract', 'email_extract_backfill', 'web_search')),
  source_ref      text not null,
  host_school_id  uuid references schools(id) on delete cascade,
  proposed_data   jsonb not null,
  matched_camp_id uuid references camps(id) on delete set null,
  status          text not null default 'pending'
                  check (status in ('pending', 'applied', 'rejected', 'superseded')),
  confidence      text not null default 'medium'
                  check (confidence in ('high', 'medium', 'low')),
  notes           text,
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz
);

create index camp_proposals_status_idx
  on camp_proposals(status) where status = 'pending';
create index camp_proposals_school_idx
  on camp_proposals(host_school_id);
create index camp_proposals_source_ref_idx
  on camp_proposals(source_ref);

alter table camp_proposals enable row level security;

create policy "Authenticated users can manage camp_proposals"
  on camp_proposals for all to authenticated
  using (true) with check (true);

alter publication supabase_realtime add table public.camp_proposals;

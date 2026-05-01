-- Migration 033: Batch reel send tracking
--
-- Persists the state of each school in the batch reel flow.
-- Keyed by school_id + reel_url so state is per-reel.
-- When current reel changes, old entries are naturally irrelevant.

create table public.batch_reel_sends (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  reel_url text not null,
  sent_via text not null,       -- 'Email' | 'Sports Recruits' | 'Skipped'
  sent_at timestamptz not null default now(),
  created_at timestamptz default now()
);

create index idx_batch_reel_sends_school
  on batch_reel_sends(school_id, sent_at desc);

create index idx_batch_reel_sends_reel
  on batch_reel_sends(reel_url);

alter table batch_reel_sends enable row level security;

create policy "Authenticated users can manage batch_reel_sends"
  on batch_reel_sends for all to authenticated
  using (true) with check (true);

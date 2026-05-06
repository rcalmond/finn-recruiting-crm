-- Migration 037: cron_runs audit table for ingestion monitoring
--
-- Unified audit log for all cron jobs. Replaces ad-hoc per-source signals
-- with a single table tracking start, completion, status, and metadata.

create table cron_runs (
  id            uuid primary key default gen_random_uuid(),
  cron_name     text not null
                check (cron_name in ('gmail-sync',
                                     'coach-roster-sync',
                                     'camp-discovery')),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  status        text not null default 'running'
                check (status in ('running', 'success',
                                  'partial', 'failed')),
  error         text,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

create index cron_runs_name_completed_idx
  on cron_runs(cron_name, completed_at desc)
  where completed_at is not null;

create index cron_runs_running_idx
  on cron_runs(cron_name, started_at)
  where status = 'running';

alter table cron_runs enable row level security;
create policy "Authenticated users full access"
  on cron_runs for all
  using (auth.role() = 'authenticated');

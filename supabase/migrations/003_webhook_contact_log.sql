-- Allow webhook-created contact log entries (no auth user session)
alter table public.contact_log alter column created_by drop not null;

-- Add a source column to distinguish webhook vs manual entries
alter table public.contact_log add column if not exists source text default 'manual';

-- Migration 026: Add sent_at timestamptz to contact_log
--
-- Fixes within-day ordering: contact_log.date is date-only (no time),
-- so same-day entries sort by created_at (ingestion time, not send time).
-- sent_at provides a real timestamp for correct chronological ordering.
--
-- Backfill: historical rows get an approximate sent_at derived from
-- date (calendar day) + created_at time-of-day, shifted to Mountain Time.
-- Post-deploy rows will have actual send timestamps from email headers.

-- 1. Add column
alter table public.contact_log
  add column sent_at timestamptz;

-- 2. Indexes for sort performance
create index idx_contact_log_sent_at on public.contact_log (sent_at desc);
create index idx_contact_log_school_sent on public.contact_log (school_id, sent_at desc);

-- 3. Backfill: combine date's calendar day with created_at's time-of-day
-- Result is in Mountain Time, converted to UTC for storage.
-- This preserves correct date boundaries while giving stable within-day ordering.
update public.contact_log
set sent_at = (
  date::timestamp + created_at::time
) at time zone 'America/Denver'
where sent_at is null;

-- 4. Enforce non-null going forward (backfill guarantees no nulls remain)
alter table public.contact_log
  alter column sent_at set not null;

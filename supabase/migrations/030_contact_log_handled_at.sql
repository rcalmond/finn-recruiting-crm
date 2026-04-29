-- Migration 030: Add handled_at to contact_log
--
-- "Done" action from Today's tactical zone sets handled_at = now().
-- Row is excluded from Today but remains visible in school detail timeline.
-- Separate from dismissed_at (which means "no reply needed at all").

alter table public.contact_log
  add column handled_at timestamptz;

create index idx_contact_log_handled
  on public.contact_log (handled_at)
  where handled_at is not null;

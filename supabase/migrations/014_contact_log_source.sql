-- Migration 014: add source tracking columns to contact_log
-- Supports the Sports Recruits inbound webhook (Part 2 of email ingestion)

alter table public.contact_log
  add column raw_source         text         default null,
  add column source_thread_id   text         default null,
  add column source_message_id  text         default null,
  add column parse_status       text         not null default 'parsed'
    check (parse_status in ('parsed', 'partial', 'failed')),
  add column parse_notes        text         default null,
  add column coach_id           uuid         references public.coaches(id) on delete set null;

-- Index for threading / deduplication queries
create index contact_log_source_thread_idx
  on public.contact_log (source_thread_id);

-- Index for FK lookups from the coaches side
create index contact_log_coach_idx
  on public.contact_log (coach_id);

-- Partial index — only rows that need attention (omits the common 'parsed' case)
create index contact_log_parse_status_idx
  on public.contact_log (parse_status)
  where parse_status != 'parsed';

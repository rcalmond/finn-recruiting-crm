-- Migration 022: Gmail partials review infrastructure
-- Apply manually via Supabase dashboard → SQL editor → Run.
-- This project does not use automated migration tooling.
--
-- Changes:
--   a. Rename parse_status values in contact_log:
--        'parsed'  → 'full'    (both school_id + coach_id resolved, high confidence)
--        'partial' → 'partial' (school_id known, coach_id null — needs review)
--      Add new value 'non_coach' (user-marked: sender is admin/bot/recruiter).
--      Add new value 'orphan'    (neither school nor coach resolved).
--      Note: no 'failed' rows existed at time of migration; no data rename needed.
--
--   b. Drop old check constraint and add new one with updated values.
--      Drop and recreate the parse_status partial index.
--
--   c. Add coaches.source column (tracks origin of each coach record):
--        'manual'     — added by a human (default for all pre-existing rows)
--        'scraped'    — added by the coach roster scraper
--        'from_gmail' — created via Gmail partials review UI
--      Note: backfilling 'scraped' vs 'manual' from coach_changes history is
--      ambiguous. All existing coaches default to 'manual'; scraper and Gmail UI
--      will set the correct value going forward.

-- ── a + b. Drop constraint first, then rename values, then add new constraint ──

alter table public.contact_log
  drop constraint contact_log_parse_status_check;

update public.contact_log set parse_status = 'full' where parse_status = 'parsed';

alter table public.contact_log
  add constraint contact_log_parse_status_check
  check (parse_status in ('full', 'partial', 'non_coach', 'orphan'));

-- ── Recreate parse_status index ───────────────────────────────────────────────

drop index if exists contact_log_parse_status_idx;

create index contact_log_parse_status_idx
  on public.contact_log (parse_status)
  where parse_status in ('partial', 'non_coach');

-- ── c. Add coaches.source column ──────────────────────────────────────────────

alter table public.coaches
  add column if not exists source text not null default 'manual'
  check (source in ('scraped', 'manual', 'from_gmail'));

comment on column public.coaches.source is
  'Origin of this coach record: manual (default), scraped (coach roster scraper), from_gmail (created via Gmail partials review UI)';

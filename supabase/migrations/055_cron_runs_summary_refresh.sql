-- Migration 055: Extend cron_runs check constraint to include 'summary-refresh'
--
-- The summary-refresh cron regenerates stale school_conversation_summary rows
-- weekly for active A/B/C schools.

-- Drop the existing check constraint and re-add with the new value
ALTER TABLE cron_runs DROP CONSTRAINT IF EXISTS cron_runs_cron_name_check;
ALTER TABLE cron_runs ADD CONSTRAINT cron_runs_cron_name_check
  CHECK (cron_name IN ('gmail-sync', 'coach-roster-sync', 'camp-discovery', 'summary-refresh'));

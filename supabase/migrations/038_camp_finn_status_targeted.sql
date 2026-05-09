-- Migration 038: Add 'targeted' status to camp_finn_status
--
-- New state between 'interested' and 'registered' for camps Finn
-- is genuinely planning to attend. Gates action item creation (Model B).
--
-- No check constraint change needed — the DB has no status check constraint.
-- The status enum is enforced by the TypeScript type only.

alter table camp_finn_status
  add column targeted_at timestamptz;

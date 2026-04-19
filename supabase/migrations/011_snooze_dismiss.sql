-- 011_snooze_dismiss.sql
-- Adds snooze and dismiss flags to contact_log entries.
--
-- snoozed_until: when set, the entry is hidden from "Awaiting reply"
--   calculations until the timestamp passes, then reappears automatically.
--
-- dismissed_at: when set, the entry is permanently hidden from "Awaiting reply".
--
-- Invariant: a dismissal clears any snooze; setting a new snooze clears dismissal.
-- (enforced in application code, not at DB level)

ALTER TABLE contact_log
  ADD COLUMN snoozed_until timestamptz DEFAULT NULL,
  ADD COLUMN dismissed_at  timestamptz DEFAULT NULL;

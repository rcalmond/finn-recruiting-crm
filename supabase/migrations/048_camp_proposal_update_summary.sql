-- Migration 048: Add update_summary to camp_proposals
-- Stores human-readable materiality detail for update proposals
-- (e.g. "Bucknell added as host", "CMU and Rochester added as attending schools")
-- Null for new-camp proposals and legacy proposals.

alter table camp_proposals
  add column update_summary text;

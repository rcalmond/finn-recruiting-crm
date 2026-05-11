-- Migration 040: Add last_hint to campaign_email_drafts
--
-- Stores the regeneration hint used (if any) for debugging
-- and future "regenerate with same hint" features.

alter table campaign_email_drafts
  add column last_hint text;

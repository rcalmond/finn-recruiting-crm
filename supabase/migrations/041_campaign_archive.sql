-- Migration 041: Campaign archive support
--
-- Adds archived_at to campaigns for soft-archive.
-- campaign_schools and campaign_email_drafts already have
-- ON DELETE CASCADE from migrations 024 and 039.

alter table campaigns
  add column archived_at timestamptz;

comment on column campaigns.archived_at is
  'When set, the campaign is hidden from the default campaigns list but preserved for historical reference. Null means active (or draft).';

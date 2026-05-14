-- Migration 042: Update campaign_email_drafts model_used default to claude-opus-4-7
-- All email generation flows now use Opus 4.7.

alter table campaign_email_drafts
  alter column model_used set default 'claude-opus-4-7';

-- Migration 015: allow webhook-authored contact_log entries
--
-- contact_log was originally designed for user-created entries only.
-- Webhook-authored entries (SR inbound parser) have no auth user and
-- may not always resolve a school (parse_status = 'partial'/'failed').
-- Both constraints must be relaxed for the webhook to function.

alter table public.contact_log
  alter column school_id  drop not null,
  alter column created_by drop not null;

-- Migration 017: content_hash for bulk-import deduplication
--
-- Allows the SR Sent bulk importer (Part 3b) to detect re-imports
-- of the same paste without scanning the full table. Existing rows
-- get null (they predate the bulk import feature). Only rows written
-- by the bulk importer (and optionally the Part 2 webhook going
-- forward) will have a value here.

alter table public.contact_log
  add column content_hash text default null;

-- Partial index — only indexes non-null rows, keeping it small
-- since the vast majority of rows (webhook-written, user-logged)
-- will never have a hash.
create index contact_log_content_hash_idx
  on public.contact_log (content_hash)
  where content_hash is not null;

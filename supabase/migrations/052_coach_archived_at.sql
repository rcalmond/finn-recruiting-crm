-- Migration 052: Add archived_at to coaches for soft-archive.
-- NULL = active coach. Non-null = archived (hidden from active UI,
-- but coach_id references in contact_log, call_prep_docs, etc. still resolve).
-- Replaces the hard-delete pattern which was silently failing due to FK constraints.

alter table coaches
  add column archived_at timestamp with time zone;

create index coaches_school_id_archived_at_idx
  on coaches(school_id, archived_at);

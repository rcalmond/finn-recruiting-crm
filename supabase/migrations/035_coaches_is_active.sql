-- Migration 035: Soft-delete for coaches via is_active flag
--
-- Fixes Bug C: coach_departed apply path now sets is_active=false instead of
-- just needs_review=true. Scraper diff excludes inactive coaches, stopping
-- re-proposals of already-departed coaches.

alter table coaches add column is_active boolean not null default true;

create index coaches_active_school_idx on coaches(school_id) where is_active = true;

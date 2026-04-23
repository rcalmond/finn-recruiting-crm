-- Migration 019: domains[] on schools for direct school→domain mapping
--
-- Adds an authoritative domain array to each school row. Used by the
-- Gmail resolver (gmail-resolve.ts) as a high-confidence matching path
-- when a sender/recipient domain doesn't appear in coaches.email but
-- is known to belong to a specific school.
--
-- Populated via scripts/learn-school-domains.ts (manual, reviewed run).
-- Re-parse script (scripts/reparse-orphan-domains.ts) rescues existing
-- partial contact_log rows once this column is seeded.

alter table public.schools
  add column domains text[] not null default '{}';

-- GIN index for fast array containment lookups:
--   WHERE domains @> ARRAY['jhu.edu']
create index schools_domains_gin_idx
  on public.schools using gin (domains);

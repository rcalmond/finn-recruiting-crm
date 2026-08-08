-- Migration 062: discovery_schools.programs
-- Structured program facets for School Discovery. Becomes the source of truth
-- for "what a school offers," replacing the single has_engineering boolean.
-- Absence of a program in the array means unknown-or-not-offered — NEVER guessed.
--
-- TypeScript union DiscoveryProgram (src/lib/types.ts):
--   engineering | business | nursing | premed_health | computer_science | education
-- No DB check constraint (text-first, house pattern) — the app owns the vocabulary.

alter table discovery_schools
  add column programs text[] not null default '{}';

-- Backfill: carry the deprecated has_engineering boolean into the array.
-- Expected result: 326 rows tagged 'engineering' (matches has_engineering = true).
update discovery_schools
  set programs = array['engineering']
  where has_engineering = true;

-- has_engineering is now DEPRECATED. Kept in place for compatibility + backfill
-- provenance, but `programs` is the source of truth going forward — do not
-- read or write has_engineering in new code.
comment on column discovery_schools.has_engineering is
  'DEPRECATED (migration 062): use programs (contains ''engineering'') instead. Retained for backfill provenance only.';

comment on column discovery_schools.programs is
  'Program facets a school is KNOWN to offer. Absence = unknown-or-not-offered, never guessed. TS union DiscoveryProgram: engineering | business | nursing | premed_health | computer_science | education.';

-- GIN index for array containment / overlap facet queries (programs && '{...}').
create index if not exists discovery_schools_programs_idx
  on discovery_schools using gin (programs);

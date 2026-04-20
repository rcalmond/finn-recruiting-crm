-- Migration 016: school name aliases for SR notification matching
--
-- SR notifications use formal university names that differ from our
-- abbreviated DB names. The aliases array lets the webhook match
-- "University of California, Los Angeles" → UCLA, etc.

alter table public.schools
  add column aliases text[] not null default '{}';

-- Populate known mismatches discovered during historical SR backfill
update public.schools
  set aliases = '{"University of California, Los Angeles","UC Los Angeles"}'
  where name = 'UCLA';

update public.schools
  set aliases = '{"University of Washington"}'
  where name = 'U of Washington';

update public.schools
  set aliases = '{"University of Virginia"}'
  where name = 'UVA';

update public.schools
  set aliases = '{"California Institute of Technology"}'
  where name = 'Caltech';

update public.schools
  set aliases = '{"Massachusetts Institute of Technology"}'
  where name = 'MIT';

update public.schools
  set aliases = '{"North Carolina State University","NC State University"}'
  where name = 'NC State';

update public.schools
  set aliases = '{"California Polytechnic State University","Cal Poly SLO","Cal Poly"}'
  where name = 'Cal Poly San Luis Obispo (Cal Poly SLO)';
